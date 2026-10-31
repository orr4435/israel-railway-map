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
 * Output:
 *   --out file.csv   a CSV whose columns match the old Google Sheet (default traffic_import.csv)
 *   --sql file.sql   SQL for Supabase: paste it into Supabase > SQL Editor and run it.
 *                    Rows are upserted by id; add --replace to delete every existing
 *                    traffic arrangement first, so the table holds exactly the Excel rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUE_OPTS = ['--sheet', '--out', '--sql'];
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_OPTS.includes(args[i - 1])));
if (!file) { console.error('usage: node scripts/import-traffic.mjs <file.xlsx> [--sheet name] [--out file.csv] [--sql file.sql [--replace]]'); process.exit(1); }
const outFile = opt('--out', 'traffic_import.csv');
const sqlFile = opt('--sql', '');
const replace = args.includes('--replace');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

// ── column names ─────────────────────────────────────────────────────────────
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');   // non-breaking spaces from Excel and station names
const norm = s => String(s ?? '').replace(NBSP, ' ').replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim();
const ALIASES = {
  title:             ['שם ההסדר', 'שם הסדר', 'הסדר תנועה', 'הסדר', 'שם', 'שם הפרויקט', 'שם פרויקט', 'נושא'],
  locationName:      ['מיקום', 'תחנה', 'מיקום/תחנה', 'מיקום / תחנה', 'אתר', 'מיקום ההסדר'],
  trafficStartDate:  ['תאריך התחלה', 'מועד התחלה', 'התחלה', 'מתאריך', 'תחילת ההסדר'],
  trafficClosureDate:['תאריך סיום', 'מועד סיום', 'סיום', 'עד תאריך', 'מועד סגירה', 'תאריך סגירה', 'סיום ההסדר'],
  initiator:         ['יזם', 'יזם ההסדר', 'גורם יוזם', 'היזם'],
  contacts:          ['אנשי קשר וטלפונים', 'אנשי קשר', 'איש קשר', 'טלפון', 'טלפונים', 'נייד', 'נציג', 'נציג / אנשי קשר', 'נציג/ אנשי קשר', 'פרטי קשר'],
  department:        ['אגף'],
  adminHead:         ['ראש מנהלת', 'ראש המנהלת', 'ראש מינהלת'],
  arrangementStatus: ['סטטוס', 'סטאטוס', 'סטטוס ההסדר'],
  image:             ['תמונה', 'קישור לתמונה'],
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
  'locationName', 'contacts', 'initiator', 'department', 'adminHead', 'arrangementStatus',
  'contractor', 'managementCompany', 'image', 'notes', 'createdAt'];

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
// common abbreviations in location names, for example "ראשל"צ משה דיין" (quotes are removed first)
const ABBR = [['ראשלצ', 'ראשון לציון'], ['תא', 'תל אביב'], ['בש', 'באר שבע'], ['פת', 'פתח תקווה']];
const normName = s => {
  let v = String(s ?? '').replace(NBSP, ' ').replace(/["'״׳`]/g, '').replace(/[-–—_/\\(),.]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [a, full] of ABBR) v = v.replace(new RegExp(`(^|\\s)${a}(?=\\s|$)`, 'g'), `$1${full}`);
  return v.replace(/(^|\s)(תחנת|תחנה|רכבת)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
};
const stations = JSON.parse(fs.readFileSync(path.join(root, 'public', 'station.geojson'), 'utf8')).features
  .filter(f => f.geometry?.type === 'Point' && f.properties?.ASSET_NAME)
  .map(f => ({ name: f.properties.ASSET_NAME, n: normName(f.properties.ASSET_NAME),
               segs: String(f.properties.ASSET_NAME).split(/\s*[-–—]\s*/).map(normName).filter(Boolean),
               lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }))
  .filter(s => s.n.length >= 2);
const ambiguous = [];
/**
 * Exact name first; then a station with a dash-separated part equal to the text ("תל אביב - אוניברסיטה"
 * for "אוניברסיטה"); then partial containment, longest name first. Several equally good matches are reported.
 */
function matchStation(loc) {
  const l = normName(loc);
  if (!l) return undefined;
  const exact = stations.filter(s => s.n === l);
  if (exact.length) return exact[0];
  const bySegment = stations.filter(s => s.segs.length > 1 && s.segs.includes(l));
  if (bySegment.length) {
    if (bySegment.length > 1) ambiguous.push(`${loc} → ${bySegment.map(s => s.name).join(' / ')}`);
    return bySegment[0];
  }
  const hasWords = (text, words) => ` ${text} `.includes(` ${words} `);   // whole words only ("דור" is not in "סבידור")
  const contained = stations.filter(s => hasWords(l, s.n) || (hasWords(s.n, l) && l.length >= 3)).sort((a, b) => b.n.length - a.n.length);
  if (contained.length > 1 && !hasWords(l, contained[0].n)) ambiguous.push(`${loc} → ${contained.map(s => s.name).join(' / ')} (נבחר: ${contained[0].name})`);
  return contained[0];
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
  // Stable id from name + location: importing an updated Excel updates the same rows instead of duplicating them
  const key = `${normName(rec.title)}|${normName(rec.locationName ?? '')}`;
  let id = `xls-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}`;
  while (out.some(r => r.id === id)) id += 'b';
  out.push({ ...rec, id, projectType: 'הסדרי_תנועה', createdAt: new Date().toISOString() });
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = [SHEET_HEADERS.join(','), ...out.map(r => SHEET_HEADERS.map(h => csvCell(r[h])).join(','))].join('\r\n');
fs.writeFileSync(outFile, '﻿' + csv, 'utf8');

// ── SQL for Supabase ─────────────────────────────────────────────────────────
if (sqlFile) {
  const q = v => (v === undefined || v === null || String(v).trim() === '') ? 'null'
    : typeof v === 'number' ? String(v) : `'${String(v).trim().replace(/'/g, "''")}'`;
  const isoOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');
  const dateNotes = [];
  const COLS = ['id', 'title', 'project_type', 'lat', 'lng', 'traffic_purpose', 'traffic_start_date', 'traffic_end_date',
    'department', 'admin_head', 'arrangement_status', 'image',
    'traffic_closure_duration', 'location_name', 'contacts', 'initiator', 'contractor', 'management_company', 'notes'];
  const values = out.map(r => {
    // a date column only accepts real dates; free text (for example "עד הפעלת התחנה") is kept in the notes
    const extra = [];
    if (r.trafficStartDate && !isoOk(r.trafficStartDate)) extra.push(`תאריך התחלה במקור: ${r.trafficStartDate}`);
    if (r.trafficClosureDate && !isoOk(r.trafficClosureDate)) extra.push(`תאריך סיום במקור: ${r.trafficClosureDate}`);
    if (extra.length) dateNotes.push(r.title);
    const row = {
      id: r.id, title: r.title, project_type: 'הסדרי_תנועה',
      lat: r.lat === undefined || r.lat === '' ? null : Number(r.lat), lng: r.lng === undefined || r.lng === '' ? null : Number(r.lng),
      traffic_purpose: r.trafficPurpose, traffic_start_date: isoOk(r.trafficStartDate) ? r.trafficStartDate : null,
      traffic_end_date: isoOk(r.trafficClosureDate) ? r.trafficClosureDate : null, traffic_closure_duration: r.trafficClosureDuration,
      location_name: r.locationName, contacts: r.contacts, initiator: r.initiator, contractor: r.contractor,
      department: r.department, admin_head: r.adminHead, arrangement_status: r.arrangementStatus, image: r.image,
      management_company: r.managementCompany, notes: [r.notes, ...extra].filter(Boolean).join('\n'),
    };
    return `  (${COLS.map(c => q(row[c])).join(', ')})`;
  });
  const sql = [
    `-- Traffic arrangements imported from ${path.basename(file)} on ${new Date().toISOString().slice(0, 10)}.`,
    '-- Paste into Supabase > SQL Editor and run. Everything runs as one transaction.',
    'begin;',
    replace ? "delete from public.projects where project_type = 'הסדרי_תנועה';" : '-- (run the importer with --replace to remove arrangements that are not in this file)',
    `insert into public.projects (${COLS.join(', ')}) values`,
    values.join(',\n'),
    'on conflict (id) do update set',
    COLS.filter(c => c !== 'id').map(c => `  ${c} = excluded.${c}`).join(',\n') + ';',
    'commit;', '',
  ].join('\n');
  fs.writeFileSync(sqlFile, sql, 'utf8');
  console.log(`SQL for Supabase written to ${sqlFile}${replace ? ' (replaces all existing traffic arrangements)' : ''}`);
  if (dateNotes.length) console.log(`dates that are not real dates were moved to the notes: ${dateNotes.join(', ')}`);
}

console.log(`sheet "${sheetName}", header row ${headerIdx + 1}`);
console.log(`columns used: ${header.filter((_, i) => colFields[i]).map((h, i) => h).join(', ')}`);
if (unknown.length) console.log(`columns ignored: ${unknown.join(', ')}`);
console.log(`${out.length} arrangements written to ${outFile}`);
console.log(`placed on map: ${report.located}, not placed: ${report.unlocated.length}`);
report.unlocated.forEach(t => console.log(`  not placed: ${t}`));
if (ambiguous.length) { console.log('check these locations, more than one station fits:'); ambiguous.forEach(a => console.log(`  ${a}`)); }
if (report.noEnd.length) console.log(`missing end date (yellow warning): ${report.noEnd.length}`);
if (report.noTitle) console.log(`rows skipped without a name: ${report.noTitle}`);
