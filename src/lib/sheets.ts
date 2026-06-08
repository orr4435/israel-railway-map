import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

// ── Base URL ──────────────────────────────────────────────────────────────────
// Strip any query-string from whatever URL the env provides (or the default)
const CSV_BASE = (() => {
  const raw = (import.meta.env.VITE_SHEETS_CSV_URL as string | undefined)
    ?? 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1gPbkvJTIY6ZztmORgUxGiE17fYrVH30X7LsW57ELt7jIrXFbFyjkzBDRxNHPiLWUWPq1tKSLJHJK/pub';
  return raw.split('?')[0];
})();

export const sheetsEnabled = true;

const csvUrl = (sheet: string) =>
  `${CSV_BASE}?output=csv&sheet=${encodeURIComponent(sheet)}`;

// ── CSV parser ────────────────────────────────────────────────────────────────

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
  const clean = text.replace(/^﻿/, '');           // strip BOM
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line, idx) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    // Auto-generate id if missing (manual entry in sheet)
    if (!row.id) row.id = `sheet-${idx + 1}`;
    return row;
  });
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
    image:       row.image    || undefined,
    link:        row.linkUrl  ? { url: row.linkUrl, label: row.linkLabel || row.linkUrl } : undefined,
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

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchSheet(sheet: string): Promise<Record<string, string>[]> {
  const res = await fetch(csvUrl(sheet));
  if (!res.ok) throw new Error(`HTTP ${res.status} for sheet "${sheet}"`);
  const text = await res.text();
  return parseCSV(text);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadProjects(): Promise<Project[]> {
  // Try named tab "projects" first; fall back to whichever tab is default (no &sheet=)
  const attempts = [csvUrl('projects'), `${CSV_BASE}?output=csv`];
  for (const url of attempts) {
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
    const rows = await fetchSheet('stations');
    return rows.filter(r => r.title?.trim()).map(rowToStation);
  } catch {
    return []; // stations sheet is optional
  }
}

// Write stubs — CSV is read-only; items added via the form live in local state.
// To persist them, add the row manually in Google Sheets.
export async function saveProject(_p: Project): Promise<void> { /* read-only */ }
export async function saveStation(_s: StoryPoint): Promise<void> { /* read-only */ }
