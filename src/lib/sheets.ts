import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE    = 'https://sheets-connector.vercel.app';
const PROJECT_ID  = '8a1144db-1cbf-4141-90b2-85021a633ed5';
const PROJ_TABLE  = 'RAIL1';
const STN_TABLE   = import.meta.env.VITE_STATIONS_TABLE as string | undefined; // optional

const API_KEY     = import.meta.env.VITE_API_KEY as string | undefined;

// Fallback: published CSV for read-only when no API key
const CSV_BASE    = (() => {
  const raw = (import.meta.env.VITE_SHEETS_CSV_URL as string | undefined)
    ?? 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1gPbkvJTIY6ZztmORgUxGiE17fYrVH30X7LsW57ELt7jIrXFbFyjkzBDRxNHPiLWUWPq1tKSLJHJK/pub';
  return raw.split('?')[0];
})();

export const sheetsEnabled = true;
export const canWrite      = !!API_KEY;

// ── REST helpers ──────────────────────────────────────────────────────────────

const tableUrl = (table: string) =>
  `${API_BASE}/api/v1/projects/${PROJECT_ID}/tables/${table}`;

const authHeaders = (): Record<string, string> => ({
  'x-api-key':    API_KEY!,
  'Content-Type': 'application/json',
});

// Unwrap whatever envelope the API uses
function extractRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  const j = json as Record<string, unknown>;
  const candidate = j['data'] ?? j['records'] ?? j['rows'] ?? j['items'] ?? [];
  return Array.isArray(candidate) ? candidate as Record<string, unknown>[] : [];
}

// Fetch all rows, handling pagination automatically
async function apiList(table: string): Promise<Record<string, unknown>[]> {
  const limit = 100;
  let offset  = 0;
  const all: Record<string, unknown>[] = [];

  while (true) {
    const res = await fetch(`${tableUrl(table)}?limit=${limit}&offset=${offset}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const batch = extractRows(await res.json());
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

async function apiPost(table: string, data: Record<string, string>): Promise<void> {
  const res = await fetch(tableUrl(table), {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function apiPatch(table: string, id: string, data: Partial<Record<string, string>>): Promise<void> {
  const res = await fetch(`${tableUrl(table)}/${id}`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function apiDelete(table: string, id: string): Promise<void> {
  const res = await fetch(`${tableUrl(table)}/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── CSV fallback (read-only, no API key needed) ───────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line, idx) => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
    if (!row.id) row.id = `sheet-${idx + 1}`;
    return row;
  });
}

async function csvLoadProjects(): Promise<Project[]> {
  for (const url of [
    `${CSV_BASE}?output=csv&sheet=${PROJ_TABLE}`,
    `${CSV_BASE}?output=csv&sheet=projects`,
    `${CSV_BASE}?output=csv`,
  ]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rows = parseCSV(await res.text()).filter(r => r.title?.trim());
      if (rows.length > 0) return rows.map(r => rowToProject(r as Record<string, string>));
    } catch { /* try next */ }
  }
  return [];
}

// ── Row converters ────────────────────────────────────────────────────────────

function str(v: unknown): string { return v != null ? String(v).trim() : ''; }

export function rowToProject(row: Record<string, unknown>): Project {
  let geometry: GeoGeometry | undefined;
  try { if (row.geometry) geometry = JSON.parse(str(row.geometry)); } catch { /* skip */ }
  return {
    id:                     str(row.id),
    title:                  str(row.title),
    projectType:            (str(row.projectType) as ProjectType) || undefined,
    location:               { lat: Number(row.lat) || 0, lng: Number(row.lng) || 0 },
    geometry,
    targetYear:             str(row.targetYear)             || undefined,
    cost:                   str(row.cost)                   || undefined,
    trafficPurpose:         str(row.trafficPurpose)         || undefined,
    trafficClosureDate:     str(row.trafficClosureDate)     || undefined,
    trafficClosureDuration: str(row.trafficClosureDuration) || undefined,
    contractor:             str(row.contractor)             || undefined,
    managementCompany:      str(row.managementCompany)      || undefined,
    image:                  str(row.image)                  || undefined,
    notes:                  str(row.notes)                  || undefined,
  };
}

export function projectToRow(p: Project): Record<string, string> {
  return {
    id:                     p.id,
    title:                  p.title,
    projectType:            p.projectType            ?? '',
    lat:                    String(p.location.lat),
    lng:                    String(p.location.lng),
    geometry:               p.geometry ? JSON.stringify(p.geometry) : '',
    targetYear:             p.targetYear             ?? '',
    cost:                   p.cost                   ?? '',
    trafficPurpose:         p.trafficPurpose         ?? '',
    trafficClosureDate:     p.trafficClosureDate     ?? '',
    trafficClosureDuration: p.trafficClosureDuration ?? '',
    contractor:             p.contractor             ?? '',
    managementCompany:      p.managementCompany      ?? '',
    image:                  p.image                  ?? '',
    notes:                  p.notes                  ?? '',
    createdAt:              new Date().toISOString(),
  };
}

export function rowToStation(row: Record<string, unknown>): StoryPoint {
  let geometry: GeoGeometry | undefined;
  try { if (row.geometry) geometry = JSON.parse(str(row.geometry)); } catch { /* skip */ }
  return {
    id:          str(row.id),
    title:       str(row.title),
    description: str(row.description) || '',
    status:      str(row.status)      || 'אחר',
    location:    { lat: Number(row.lat) || 0, lng: Number(row.lng) || 0 },
    geometry,
    image:       str(row.image)   || undefined,
    link:        str(row.linkUrl) ? { url: str(row.linkUrl), label: str(row.linkLabel) || str(row.linkUrl) } : undefined,
  };
}

export function stationToRow(s: StoryPoint): Record<string, string> {
  return {
    id:          s.id,
    title:       s.title,
    description: s.description,
    status:      s.status,
    lat:         String(s.location.lat),
    lng:         String(s.location.lng),
    geometry:    s.geometry ? JSON.stringify(s.geometry) : '',
    image:       s.image      ?? '',
    linkUrl:     s.link?.url  ?? '',
    linkLabel:   s.link?.label ?? '',
    createdAt:   new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadProjects(): Promise<Project[]> {
  if (API_KEY) {
    const rows = await apiList(PROJ_TABLE);
    return rows.filter(r => str(r.title)).map(rowToProject);
  }
  return csvLoadProjects();
}

export async function loadCustomStations(): Promise<StoryPoint[]> {
  if (API_KEY && STN_TABLE) {
    try {
      const rows = await apiList(STN_TABLE);
      return rows.filter(r => str(r.title)).map(rowToStation);
    } catch { return []; }
  }
  try {
    const res = await fetch(`${CSV_BASE}?output=csv&sheet=stations`);
    if (!res.ok) return [];
    return parseCSV(await res.text()).filter(r => r.title?.trim()).map(r => rowToStation(r));
  } catch { return []; }
}

export async function saveProject(project: Project): Promise<void> {
  await apiPost(PROJ_TABLE, projectToRow(project));
}

export async function updateProject(project: Project): Promise<void> {
  await apiPatch(PROJ_TABLE, project.id, projectToRow(project));
}

export async function deleteProject(id: string): Promise<void> {
  await apiDelete(PROJ_TABLE, id);
}

export async function saveStation(station: StoryPoint): Promise<void> {
  if (!STN_TABLE) return;
  await apiPost(STN_TABLE, stationToRow(station));
}

export async function deleteStation(id: string): Promise<void> {
  if (!STN_TABLE) return;
  await apiDelete(STN_TABLE, id);
}
