import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

const API_URL = import.meta.env.VITE_SHEETS_API_URL as string | undefined;

export const sheetsEnabled = !!API_URL;

// ── Row ↔ Project ─────────────────────────────────────────────────────────

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

export function rowToProject(row: Record<string, string>): Project {
  let geometry: GeoGeometry | undefined;
  try { if (row.geometry) geometry = JSON.parse(row.geometry); } catch { /* invalid JSON */ }
  return {
    id:                     String(row.id),
    title:                  row.title,
    projectType:            (row.projectType as ProjectType) || undefined,
    location:               { lat: Number(row.lat), lng: Number(row.lng) },
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

// ── Row ↔ StoryPoint ──────────────────────────────────────────────────────

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

export function rowToStation(row: Record<string, string>): StoryPoint {
  let geometry: GeoGeometry | undefined;
  try { if (row.geometry) geometry = JSON.parse(row.geometry); } catch { /* invalid JSON */ }
  return {
    id:          String(row.id),
    title:       row.title,
    description: row.description,
    status:      row.status,
    location:    { lat: Number(row.lat), lng: Number(row.lng) },
    geometry,
    image:       row.image   || undefined,
    link:        row.linkUrl ? { url: row.linkUrl, label: row.linkLabel || row.linkUrl } : undefined,
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

async function get<T>(params: Record<string, string>): Promise<T | null> {
  if (!API_URL) return null;
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${qs}`);
  return res.json() as Promise<T>;
}

// POST with text/plain avoids CORS preflight (simple request)
async function post(body: unknown): Promise<void> {
  if (!API_URL) return;
  await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
}

// ── Projects API ──────────────────────────────────────────────────────────

export async function loadProjects(): Promise<Project[]> {
  const json = await get<{ data: Record<string, string>[] }>({ action: 'list', sheet: 'projects' });
  return (json?.data ?? []).map(rowToProject).filter(p => p.id && p.title);
}

export async function saveProject(project: Project): Promise<void> {
  await post({ action: 'add', sheet: 'projects', data: projectToRow(project) });
}

export async function deleteProject(id: string): Promise<void> {
  await post({ action: 'delete', sheet: 'projects', id });
}

// ── Custom stations API ───────────────────────────────────────────────────

export async function loadCustomStations(): Promise<StoryPoint[]> {
  const json = await get<{ data: Record<string, string>[] }>({ action: 'list', sheet: 'stations' });
  return (json?.data ?? []).map(rowToStation).filter(s => s.id && s.title);
}

export async function saveStation(station: StoryPoint): Promise<void> {
  await post({ action: 'add', sheet: 'stations', data: stationToRow(station) });
}

export async function deleteStation(id: string): Promise<void> {
  await post({ action: 'delete', sheet: 'stations', id });
}
