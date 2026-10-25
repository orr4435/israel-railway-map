import { Project, StoryPoint, GeoPoint } from '../types';

// ── Traffic-arrangement status (derived from dates, never stored) ─────────────
export type TrafficStatus = 'upcoming' | 'active' | 'ended' | 'no_end';

export const TRAFFIC_STATUS: Record<TrafficStatus, { label: string; color: string; bg: string; text: string; legend: string }> = {
  upcoming: { label: 'טרם החל',        color: '#f97316', bg: 'bg-orange-100', text: 'text-orange-700', legend: 'תאריך ההתחלה טרם הגיע' },
  active:   { label: 'פעיל',           color: '#16a34a', bg: 'bg-green-100',  text: 'text-green-700',  legend: 'בין תאריך ההתחלה לסיום' },
  ended:    { label: 'הסתיים',         color: '#dc2626', bg: 'bg-red-100',    text: 'text-red-700',    legend: 'תאריך הסיום חלף' },
  no_end:   { label: 'חסר תאריך סיום', color: '#eab308', bg: 'bg-yellow-100', text: 'text-yellow-800', legend: 'לא הוזן תאריך סיום' },
};
export const TRAFFIC_STATUS_ORDER: TrafficStatus[] = ['active', 'upcoming', 'ended', 'no_end'];

export const isTraffic = (p: Project) => p.projectType === 'הסדרי_תנועה';

/**
 * Parse the date formats that show up in the sheet and the Excel file:
 * ISO "2027-02-01" or "2027-02-01 0:00:00", "15/07/2026", "27.6.26", "1.7.2026",
 * and Excel serial numbers (days since 1899-12-30).
 */
export function parseDate(value?: string | number | null): Date | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;

  if (/^\d{5}(\.\d+)?$/.test(s)) {                       // Excel serial
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);         // ISO, optional time
  if (m) return safeDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);  // day first, Israeli order
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return safeDate(y, +m[2], +m[1]);
  }
  return null;
}

function safeDate(y: number, mo: number, d: number): Date | null {
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

export function formatDate(value?: string | null): string {
  const d = parseDate(value);
  if (!d) return value?.trim() || '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** yyyy-mm-dd for <input type="date">, or '' when the value cannot be parsed */
export function toInputDate(value?: string | null): string {
  const d = parseDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * orange: start date not reached yet. green: between start and end (end day included).
 * red: end date passed. yellow warning: no end date.
 * A missing start date counts as "already started".
 */
export function getTrafficStatus(p: Pick<Project, 'trafficStartDate' | 'trafficClosureDate'>, today = new Date()): TrafficStatus {
  const end = parseDate(p.trafficClosureDate);
  if (!end) return 'no_end';
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = parseDate(p.trafficStartDate);
  if (start && day < start) return 'upcoming';
  if (day > end) return 'ended';
  return 'active';
}

// ── Location by station name ("מיקום" column) ─────────────────────────────────
export function normalizeName(s: string): string {
  return s
    .replace(new RegExp(String.fromCharCode(0xa0), 'g'), ' ')   // non-breaking spaces, common in station names
    .replace(/["'״׳`]/g, '')
    .replace(/[-–—_/\\(),.]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)(תחנת|תחנה|רכבת)(?=\s|$)/g, ' ')   // \b does not work with Hebrew letters
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Find the station whose name matches a free-text location. Exact match first, then the longest contained name. */
export function matchStation(location: string, stations: StoryPoint[]): StoryPoint | undefined {
  const loc = normalizeName(location);
  if (!loc) return undefined;
  const named = stations.map(s => ({ s, n: normalizeName(s.title || '') })).filter(x => x.n.length >= 2);
  const exact = named.find(x => x.n === loc);
  if (exact) return exact.s;
  const contained = named
    .filter(x => loc.includes(x.n) || (x.n.includes(loc) && loc.length >= 3))
    .sort((a, b) => b.n.length - a.n.length);
  return contained[0]?.s;
}

export function hasCoords(g?: GeoPoint): boolean {
  return !!g && Number.isFinite(g.lat) && Number.isFinite(g.lng) && !(g.lat === 0 && g.lng === 0);
}

/** Give every traffic arrangement a map position: its own coordinates, or the station named in "מיקום". */
export function resolveTrafficLocations(projects: Project[], stations: StoryPoint[]): Project[] {
  return projects.map(p => {
    if (!isTraffic(p)) return p;
    if (hasCoords(p.location)) return { ...p, locationSource: 'coords' as const };
    const st = p.locationName ? matchStation(p.locationName, stations) : undefined;
    if (st) return { ...p, location: st.location, locationSource: 'station' as const, matchedStation: st.title };
    return { ...p, locationSource: 'none' as const };
  });
}
