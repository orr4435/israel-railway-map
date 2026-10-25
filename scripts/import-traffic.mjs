#!/usr/bin/env node
/**
 * Imports the traffic-arrangements Excel file into the format of the "projects" Google Sheet.
 *
 *   node scripts/import-traffic.mjs <file.xlsx> [--sheet "<sheet name>"] [--out traffic_import.csv]
 *
 * - Finds the header row automatically (the file may start with a title row).
 * - Recognises Hebrew column names: שם ההסדר, מיקום, תאריך התחלה, תאריך סיום, יזם,
 *   אנשי קשר / טלפון, הערות, מטרה, קבלן, חברת ניהול, משך.
 * - Converts every date format (Excel dates, 27.6.26, 15/07/2026) to yyyy-mm-dd.
 * - Places each arrangement on the station named in "מיקום" (from public/station.geojson).
 *
 * Output: a CSV whose columns match the sheet. In Google Sheets, delete the old
 * הסדרי_תנועה rows of the "projects" tab and paste or import the new rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!file) { console.error('usage: node scripts/import-traffic.mjs <file.xlsx> [--sheet name] [--out file.csv]'); process.exit(1); }
const outFile = opt('--out', 'traffic_import.csv');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

// ── column names ─────────────────────────────────────────────────────────────
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');   // non-breaking spaces from Excel and station names
const norm = s => String(s ?? '').replace(NBSP, ' ').replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim();
const ALIASES = {
  title:             ['שם ההסדר', 'שם הסדר', 'הסדר תנועה', 'הסדר', 'שם', 'שם הפרויקט', 'נושא'],
  locationName:      ['מיקום', 'תחנה', 'מיקום/תחנה', 'מיקום / תחנה', 'אתר', 'מיקום ההסדר'],
  trafficStartDate:  ['תאריך התחלה', 'מועד התחלה', 'התחלה', 'מתאריך', 'תחילת ההסדר'],
  trafficClosureDate:['תאריך סיום', 'מועד סיום', 'סיום', 'עד תאריך', 'מועד סגירה', 'תאריך סגירה', 'סיום ההסדר'],
  initiator:         ['יזם', 'יזם ההסדר', 'גורם יוזם', 'היזם'],
  contacts:          ['אנשי קשר וטלפונים', 'אנשי קשר', 'איש קשר', 'טלפון', 'טלפונים', 'נייד', 'נציג', 'פרטי קשר'],
  notes:             ['הערות', 'הערה'],
  trafficPurpose:    ['מטרת ההסדר', 'מטרה', 'תיאור', 'תיאור ההסדר'],
  contractor:        ['קבלן', 'קבלן מבצע'],
  managementCompany: ['חברת ניהול', 'חברת הניהול', 'מנהל פרויקט'],
  trafficClosureDuration: ['משך', 'משך סגירה', 'משך ההסדר'],
  lat:               ['lat', 'latitude', 'קו רוחב'],
  lng:               ['lng', 'lon', 'longitude', 'קו אורך'],
};
const aliasOf = {};
for (const [field, names] of Object.entries(ALIASES)) for (const n of names) aliasOf[norm(n).toLowerCase()] = field;

const SHEET_HEADERS = ['id', 'title', 'projectType', 'lat', 'lng', 'geometry', 'targetYear', 'cost',
  'trafficPurpose', 'trafficStartDate', 'trafficClosureDate', 'trafficClosureDuration',
  'locationName', 'contacts', 'initiator', 'contractor', 'managementCompany', 'image', 'notes', 'createdAt'];

// ── dates ─────────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
function toISO(v) {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = XLSX.SSF.parse_date_code(Number(s)); return `${d.y}-${pad(d.m)}-${pad(d.d)}`; }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  return s;                                  // keep unknown text (for example "עד הפעלת התחנה") so nothing is lost
}

// ── stations (same matching rules as src/lib/traffic.ts) ─────────────────────
const normName = s => String(s ?? '').replace(NBSP, ' ').replace(/["'״׳`]/g, '').replace(/[-–—_/\\(),.]/g, ' ')
  .replace(/\s+/g, ' ').replace(/(^|\s)(תחנת|תחנה|רכבת)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const stations = JSON.parse(fs.readFileSync(path.join(root, 'public', 'station.geojson'), 'utf8')).features
  .filter(f => f.geometry?.type === 'Point' && f.properties?.ASSET_NAME)
  .map(f => ({ name: f.properties.ASSET_NAME, n: normName(f.properties.ASSET_NAME), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }))
  .filter(s => s.n.length >= 2);
function matchStation(loc) {
  const l = normName(loc);
  if (!l) return undefined;
  return stations.find(s => s.n === l)
    ?? stations.filter(s => l.includes(s.n) || (s.n.includes(l) && l.length >= 3)).sort((a, b) => b.n.length - a.n.length)[0];
}

// ── read the workbook ────────────────────────────────────────────────────────
const wb = XLSX.readFile(file, { cellDates: true });
const sheetName = opt('--sheet', wb.SheetNames[0]);
const ws = wb.Sheets[sheetName];
if (!ws) { console.error(`sheet not found: ${sheetName}. sheets: ${wb.SheetNames.join(', ')}`); process.exit(1); }
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

let headerIdx = -1, best = 0;
grid.slice(0, 15).forEach((row, i) => {
  const hits = row.filter(c => aliasOf[norm(c).toLowerCase()]).length;
  if (hits > best) { best = hits; headerIdx = i; }
});
if (headerIdx < 0 || best < 2) { console.error('could not find a header row with known column names'); process.exit(1); }

const header = grid[headerIdx].map(c => norm(c));
const colFields = header.map(h => aliasOf[h.toLowerCase()]);
const unknown = header.filter((h, i) => h && !colFields[i]);

const out = [], report = { noTitle: 0, noEnd: [], unlocated: [], located: 0 };
for (const row of grid.slice(headerIdx + 1)) {
  const rec = {};
  row.forEach((cell, i) => {
    const f = colFields[i]; if (!f || cell === '' || cell === null) return;
    const val = f.endsWith('Date') ? toISO(cell) : (cell instanceof Date ? toISO(cell) : String(cell).trim());
    if (f === 'contacts' && rec.contacts) rec.contacts += ` · ${val}`;    // several contact/phone columns are joined
    else if (!rec[f]) rec[f] = val;
  });
  if (!rec.title) { if (Object.keys(rec).length) report.noTitle++; continue; }
  if (!rec.lat || !rec.lng) {
    const st = rec.locationName && matchStation(rec.locationName);
    if (st) { rec.lat = st.lat; rec.lng = st.lng; report.located++; }
    else report.unlocated.push(`${rec.title}${rec.locationName ? ` (מיקום: ${rec.locationName})` : ' (אין מיקום)'}`);
  } else report.located++;
  if (!rec.trafficClosureDate) report.noEnd.push(rec.title);
  out.push({ ...rec, id: `xls-${out.length + 1}`, projectType: 'הסדרי_תנועה', createdAt: new Date().toISOString() });
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = [SHEET_HEADERS.join(','), ...out.map(r => SHEET_HEADERS.map(h => csvCell(r[h])).join(','))].join('\r\n');
fs.writeFileSync(outFile, '﻿' + csv, 'utf8');

console.log(`sheet "${sheetName}", header row ${headerIdx + 1}`);
console.log(`columns used: ${header.filter((_, i) => colFields[i]).map((h, i) => h).join(', ')}`);
if (unknown.length) console.log(`columns ignored: ${unknown.join(', ')}`);
console.log(`${out.length} arrangements written to ${outFile}`);
console.log(`placed on map: ${report.located}, not placed: ${report.unlocated.length}`);
report.unlocated.forEach(t => console.log(`  not placed: ${t}`));
if (report.noEnd.length) console.log(`missing end date (yellow warning): ${report.noEnd.length}`);
if (report.noTitle) console.log(`rows skipped without a name: ${report.noTitle}`);
