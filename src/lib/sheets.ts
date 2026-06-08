import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

// ── Config ────────────────────────────────────────────────────────────────────
const PROJ_TABLE = 'RAIL1';
const STN_TABLE  = import.meta.env.VITE_STATIONS_TABLE as string | undefined;

const PROXY  = '/.netlify/functions/sheets';

const CSV_BASE = (() => {
  const raw = (import.meta.env.VITE_SHEETS_CSV_URL as string | undefined)
    ?? 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1gPbkvJTIY6ZztmORgUxGiE17fYrVH30X7LsW57ELt7jIrXFbFyjkzBDRxNHPiLWUWPq1tKSLJHJK/pub';
  return raw.split('?')[0];
})();

export const sheetsEnabled = true;
export const canWrite      = true;

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function proxyUrl(table: string, id?: string, extra?: Record<string, string>): string {
  const p = new URLSearchParams({ table, ...extra });
  if (id) p.set('id', id);
  return `${PROXY}?${p}`;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

function extractRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  const j = json as Record<string, unknown>;
  const c = j['data'] ?? j['records'] ?? j['rows'] ?? j['items'] ?? [];
  return Array.isArray(c) ? c as Record<string, unknown>[] : [];
}

// ── Schema cache (populated on first GET) ─────────────────────────────────────
// Maps table name → set of known column names
const knownCols: Map<string, Set<string>> = new Map();

async function apiList(table: string): Promise<Record<string, unknown>[]> {
  const limit = 100;
  let offset  = 0;
  const all: Record<string, unknown>[] = [];
  while (true) {
    const res = await fetch(proxyUrl(table, undefined, { limit: String(limit), offset: String(offset) }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const batch = extractRows(await res.json());
    // Learn column names from first batch that has rows
    if (batch.length > 0 && !knownCols.has(table)) {
      knownCols.set(table, new Set(Object.keys(batch[0])));
    }
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

// Filter payload to only include columns that exist in the sheet.
// If schema is unknown, send everything (first POST teaches us).
function filterToKnownCols(table: string, data: Record<string, string>): Record<string, string> {
  const cols = knownCols.get(table);
  if (!cols || cols.size === 0) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => cols.has(k)));
}

const MINIMAL_KEYS = ['id', 'title', 'lat', 'lng', 'projectType', 'status'];

async function postOnce(table: string, data: Record<string, string>): Promise<Response> {
  return fetch(proxyUrl(table), {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify(data),
  });
}

async function apiPost(table: string, data: Record<string, string>): Promise<void> {
  const filtered = filterToKnownCols(table, data);

  let res = await postOnce(table, filtered);

  // If 500 and we have many fields, retry with minimal payload so we can tell
  // whether the issue is the schema or the connection.
  if (res.status === 500 && Object.keys(filtered).length > MINIMAL_KEYS.length) {
    const minimal = Object.fromEntries(
      Object.entries(filtered).filter(([k]) => MINIMAL_KEYS.includes(k))
    );
    res = await postOnce(table, minimal);
    if (res.ok) {
      // Minimal worked — the sheet is missing some columns. Save what we can.
      return;
    }
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  }
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json.error) throw new Error(String(json.error));
  } catch (e) {
    if (e instanceof SyntaxError) return;
    throw e;
  }
}

async function apiPatch(table: string, id: string, data: Partial<Record<string, string>>): Promise<void> {
  const res = await fetch(proxyUrl(table, id), {
    method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function apiDelete(table: string, id: string): Promise<void> {
  const res = await fetch(proxyUrl(table, id), { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── Diagnostic ────────────────────────────────────────────────────────────────

export interface SheetsDiag {
  ok: boolean;
  columns: string[];
  rowCount: number;
  rawStatus: number;
  error?: string;
}

export async function diagnoseSheets(): Promise<SheetsDiag> {
  try {
    const res   = await fetch(proxyUrl(PROJ_TABLE, undefined, { limit: '5', offset: '0' }));
    const text  = await res.text();
    if (!res.ok) return { ok: false, columns: [], rowCount: 0, rawStatus: res.status, error: text };
    const json  = JSON.parse(text);
    const rows  = extractRows(json);
    const cols  = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { ok: true, columns: cols, rowCount: rows.length, rawStatus: res.status };
  } catch (e) {
    return { ok: false, columns: [], rowCount: 0, rawStatus: 0, error: String(e) };
  }
}

// ── CSV fallback ──────────────────────────────────────────────────────────────

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
  // geometry is excluded — nested JSON inside JSON breaks most sheet connectors.
  // lat/lng represent the centre point; that's sufficient for Sheets.
  return {
    id:                     p.id,
    title:                  p.title,
    projectType:            p.projectType            ?? '',
    lat:                    String(p.location.lat),
    lng:                    String(p.location.lng),
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
  try {
    const rows = await apiList(PROJ_TABLE);
    return rows.filter(r => str(r.title)).map(rowToProject);
  } catch {
    return csvLoadProjects();
  }
}

export async function loadCustomStations(): Promise<StoryPoint[]> {
  if (STN_TABLE) {
    try {
      const rows = await apiList(STN_TABLE);
      return rows.filter(r => str(r.title)).map(rowToStation);
    } catch { /* fall through */ }
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
