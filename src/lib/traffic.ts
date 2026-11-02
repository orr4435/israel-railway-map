import { useEffect, useState } from 'react';
import { Project, StoryPoint, GeoPoint } from '../types';

// ── Traffic-arrangement status (derived from dates, never stored) ─────────────
export type TrafficStatus = 'upcoming' | 'active' | 'ended' | 'no_end';

export const TRAFFIC_STATUS: Record<TrafficStatus, { label: string; color: string; bg: string; text: string; legend: string }> = {
  upcoming: { label: 'טרם החל',        color: '#f97316', bg: 'bg-orange-100', text: 'text-orange-700', legend: 'מועד ההתחלה טרם הגיע' },
  active:   { label: 'פעיל',           color: '#16a34a', bg: 'bg-green-100',  text: 'text-green-700',  legend: 'בין מועד ההתחלה לסיום' },
  ended:    { label: 'הסתיים',         color: '#dc2626', bg: 'bg-red-100',    text: 'text-red-700',    legend: 'מועד הסיום חלף' },
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

/** "HH:MM" from "HH:MM", "HH:MM:SS", "H:MM" or "0630"; '' when it is not a valid time. */
export function normalizeTime(value?: string | null): string {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):?(\d{2})(?::\d{2})?$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Date + optional time as a local Date. Without a time: start of day, or end of day (23:59:59) when endOfDay. */
export function combineDateTime(date?: string | null, time?: string | null, endOfDay = false): Date | null {
  const d = parseDate(date);
  if (!d) return null;
  const t = normalizeTime(time);
  if (t) d.setHours(+t.slice(0, 2), +t.slice(3, 5), endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  else if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

/** "15/01/2027 06:30", or just the date when there is no time. */
export function formatDateTime(date?: string | null, time?: string | null): string {
  const t = normalizeTime(time);
  return t && parseDate(date) ? `${formatDate(date)} ${t}` : formatDate(date);
}

/**
 * orange: start (date + time) not reached yet. green: between start and end. red: end passed.
 * yellow warning: no end date. A missing start counts as "already started"; a missing end time means
 * the arrangement runs until the end of its end day.
 */
export function getTrafficStatus(
  p: Pick<Project, 'trafficStartDate' | 'trafficClosureDate' | 'trafficStartTime' | 'trafficEndTime'>,
  now = new Date(),
): TrafficStatus {
  const end = combineDateTime(p.trafficClosureDate, p.trafficEndTime, true);
  if (!end) return 'no_end';
  const start = combineDateTime(p.trafficStartDate, p.trafficStartTime, false);
  if (start && now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}

/** Re-renders once a minute so statuses flip at the right time while the page stays open. */
export function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

// ── Location by station name ("מיקום" column) ─────────────────────────────────
// Common abbreviations in location names, for example "ראשל"צ משה דיין" (quotes are removed first).
// Keep in sync with scripts/import-traffic.mjs.
const ABBR: [string, string][] = [['ראשלצ', 'ראשון לציון'], ['תא', 'תל אביב'], ['בש', 'באר שבע'], ['פת', 'פתח תקווה']];

export function normalizeName(s: string): string {
  let v = s
    .replace(new RegExp(String.fromCharCode(0xa0), 'g'), ' ')   // non-breaking spaces, common in station names
    .replace(/["'״׳`]/g, '')
    .replace(/[-–—_/\\(),.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [abbr, full] of ABBR) v = v.replace(new RegExp(`(^|\\s)${abbr}(?=\\s|$)`, 'g'), `$1${full}`);
  return v
    .replace(/(^|\s)(תחנת|תחנה|רכבת)(?=\s|$)/g, ' ')   // \b does not work with Hebrew letters
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const hasWords = (text: string, words: string) => ` ${text} `.includes(` ${words} `);   // "דור" is not in "סבידור"

/**
 * Find the station a free-text location refers to: exact name first; then a station with a dash-separated part
 * equal to the text ("תל אביב - אוניברסיטה" for "אוניברסיטה"); then whole-word containment, longest name first.
 */
export function matchStation(location: string, stations: StoryPoint[]): StoryPoint | undefined {
  const loc = normalizeName(location);
  if (!loc) return undefined;
  const named = stations
    .map(s => ({ s, n: normalizeName(s.title || ''), segs: (s.title || '').split(/\s*[-–—]\s*/).map(normalizeName).filter(Boolean) }))
    .filter(x => x.n.length >= 2);
  const exact = named.find(x => x.n === loc);
  if (exact) return exact.s;
  const bySegment = named.find(x => x.segs.length > 1 && x.segs.includes(loc));
  if (bySegment) return bySegment.s;
  const contained = named
    .filter(x => hasWords(loc, x.n) || (hasWords(x.n, loc) && loc.length >= 3))
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
