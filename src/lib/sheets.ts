import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

// ── Read: Published CSV (no auth, CORS-free) ──────────────────────────────────
const CSV_BASE = (() => {
  const raw = (import.meta.env.VITE_SHEETS_CSV_URL as string | undefined)
    ?? 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1gPbkvJTIY6ZztmORgUxGiE17fYrVH30X7LsW57ELt7jIrXFbFyjkzBDRxNHPiLWUWPq1tKSLJHJK/pub';
  return raw.split('?')[0];
})();

// ── Write: Apps Script Web App (set VITE_SHEETS_API_URL to enable) ────────────
const API_URL = import.meta.env.VITE_SHEETS_API_URL as string | undefined;

export const sheetsEnabled = true;   // read always works
export const canWrite = !!API_URL;   // write only when API URL is configured

// ── CSV helpers ───────────────────────────────────────────────────────────────

const csvUrl = (sheet: string) =>
  `${CSV_BASE}?output=csv&sheet=${encodeURIComponent(sheet)}`;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line, idx) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    if (!row.id) row.id = `sheet-${idx + 1}`;
    return row;
  });
}

// ── Write helper: POST to Apps Script ────────────────────────────────────────
// Uses Content-Type: text/plain to avoid CORS preflight (simple request).

async function apiPost(body: object): Promise<void> {
  if (!API_URL) throw new Error('VITE_SHEETS_API_URL not configured');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
}

// ── Row ↔ Project ─────────────────────────────────────────────────────────────

export function rowToProject(row: Record<string, string>): Project {
  let geometry: GeoGeometry | undefined;
  try { if (row.geometry) geometry = JSON.parse(row.geometry); } catch { /* skip */ }
  return {
    id:                     row.id,
    title:                  row.title,
    projectType:            (row.projectType as ProjectType) || undefined,
    location:               { lat: Number(row.lat) || 0, lng: Number(row.lng) || 0 },
    geometry,
    targetYear:             row.targetYear             || undefined,
    cost:                   row.cost                   || undefined,
    trafficPurpose:         row.trafficPurpose         || undefined,
    trafficClosureDate:     row.trafficClosureDate     || undefined,
    trafficClosureDuration: row.trafficClosureDuration || undefined,
    contractor:             row.contractor             || undefined,
    managementCompany:      row.managementCompany      || undefined,
    image:                  row.image                  || undefined,
    notes:                  row.notes                  || undefined,
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

// ── Row ↔ StoryPoint ──────────────────────────────────────────────────────────

export function rowToStation(row: Record<string, string>): StoryPoint {
  let geometry: GeoGeometry | undefined;
  try { if (row.geometry) geometry = JSON.parse(row.geometry); } catch { /* skip */ }
  return {
    id:          row.id,
    title:       row.title,
    description: row.description || '',
    status:      row.status      || 'אחר',
    location:    { lat: Number(row.lat) || 0, lng: Number(row.lng) || 0 },
    geometry,
    image:       row.image   || undefined,
    link:        row.linkUrl ? { url: row.linkUrl, label: row.linkLabel || row.linkUrl } : undefined,
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

// ── Public read API ───────────────────────────────────────────────────────────

export async function loadProjects(): Promise<Project[]> {
  for (const url of [csvUrl('projects'), `${CSV_BASE}?output=csv`]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rows = parseCSV(await res.text()).filter(r => r.title?.trim());
      if (rows.length > 0) return rows.map(rowToProject);
    } catch { /* try next */ }
  }
  return [];
}

export async function loadCustomStations(): Promise<StoryPoint[]> {
  try {
    const res = await fetch(csvUrl('stations'));
    if (!res.ok) return [];
    return parseCSV(await res.text())
      .filter(r => r.title?.trim())
      .map(rowToStation);
  } catch {
    return [];
  }
}

// ── Public write API (requires VITE_SHEETS_API_URL) ───────────────────────────

export async function saveProject(project: Project): Promise<void> {
  await apiPost({ action: 'add', sheet: 'projects', data: projectToRow(project) });
}

export async function saveStation(station: StoryPoint): Promise<void> {
  await apiPost({ action: 'add', sheet: 'stations', data: stationToRow(station) });
}

export async function deleteProject(id: string): Promise<void> {
  await apiPost({ action: 'delete', sheet: 'projects', id });
}

export async function deleteStation(id: string): Promise<void> {
  await apiPost({ action: 'delete', sheet: 'stations', id });
}
