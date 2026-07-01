import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

// ── Google Apps Script URL (Web App, Execute as: Me, Anyone) ─────────────────
// POST uses Content-Type: text/plain → no CORS preflight → works directly from browser
const GAS_URL = (import.meta.env.VITE_GAS_URL as string | undefined) ?? '';

// ── Published CSV (read-only, no auth) ───────────────────────────────────────
const CSV_BASE = (() => {
  const raw = (import.meta.env.VITE_SHEETS_CSV_URL as string | undefined)
    ?? 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1gPbkvJTIY6ZztmORgUxGiE17fYrVH30X7LsW57ELt7jIrXFbFyjkzBDRxNHPiLWUWPq1tKSLJHJK/pub';
  return raw.split('?')[0];
})();

export const sheetsEnabled = true;
export const canWrite      = !!GAS_URL;

// ── GAS write (text/plain avoids CORS preflight) ──────────────────────────────

async function gasPost(body: object): Promise<void> {
  if (!GAS_URL) throw new Error('GAS_URL לא מוגדר');
  const res = await fetch(GAS_URL, {
    method:  'POST',
    // text/plain = "simple request" → no preflight OPTIONS needed
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as Record<string, unknown>;
  if (json.error) throw new Error(String(json.error));
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line, i) => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = (vals[j] ?? '').trim(); });
    if (!row.id) row.id = `row-${i + 1}`;
    return row;
  });
}

async function csvFetch(url: string): Promise<Record<string, string>[]> {
  // cache-bust: published CSV + browser cache otherwise serves stale data
  const bust = `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  const res = await fetch(bust, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCSV(await res.text());
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
    subProject:             str(row.subProject)             || undefined,
    initiator:              str(row.initiator)              || undefined,
    representative:         str(row.representative)         || undefined,
    blockageStatus:         str(row.blockageStatus)         || undefined,
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
    targetYear:             p.targetYear             ?? '',
    cost:                   p.cost                   ?? '',
    trafficPurpose:         p.trafficPurpose         ?? '',
    trafficClosureDate:     p.trafficClosureDate     ?? '',
    trafficClosureDuration: p.trafficClosureDuration ?? '',
    contractor:             p.contractor             ?? '',
    managementCompany:      p.managementCompany      ?? '',
    subProject:             p.subProject             ?? '',
    initiator:              p.initiator              ?? '',
    representative:         p.representative         ?? '',
    blockageStatus:         p.blockageStatus         ?? '',
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
    image:       s.image      ?? '',
    linkUrl:     s.link?.url  ?? '',
    linkLabel:   s.link?.label ?? '',
    createdAt:   new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadProjects(): Promise<Project[]> {
  for (const url of [
    `${CSV_BASE}?output=csv&sheet=projects`,
    `${CSV_BASE}?output=csv`,
  ]) {
    try {
      const rows = (await csvFetch(url)).filter(r => r.title?.trim());
      if (rows.length > 0) return rows.map(rowToProject);
    } catch { /* try next */ }
  }
  return [];
}

export async function loadCustomStations(): Promise<StoryPoint[]> {
  try {
    const rows = await csvFetch(`${CSV_BASE}?output=csv&sheet=stations`);
    return rows.filter(r => r.title?.trim()).map(rowToStation);
  } catch { return []; }
}

export async function saveProject(project: Project): Promise<void> {
  await gasPost({ action: 'add', sheet: 'projects', data: projectToRow(project) });
}

export async function updateProject(project: Project): Promise<void> {
  await gasPost({ action: 'update', sheet: 'projects', id: project.id, data: projectToRow(project) });
}

export async function deleteProject(id: string): Promise<void> {
  await gasPost({ action: 'delete', sheet: 'projects', id });
}

export async function saveStation(station: StoryPoint): Promise<void> {
  await gasPost({ action: 'add', sheet: 'stations', data: stationToRow(station) });
}

export async function deleteStation(id: string): Promise<void> {
  await gasPost({ action: 'delete', sheet: 'stations', id });
}

// Diagnostic: checks if CSV read works
export interface SheetsDiag { ok: boolean; columns: string[]; rowCount: number; error?: string }
export async function diagnoseSheets(): Promise<SheetsDiag> {
  try {
    const rows = await csvFetch(`${CSV_BASE}?output=csv&sheet=projects`);
    return { ok: true, columns: rows[0] ? Object.keys(rows[0]) : [], rowCount: rows.length };
  } catch (e) {
    return { ok: false, columns: [], rowCount: 0, error: String(e) };
  }
}
