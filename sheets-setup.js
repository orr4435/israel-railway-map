// ═══════════════════════════════════════════════════════════════════
//  Israel Railway Map — Google Apps Script
//
//  הוראות:
//  1. פתח את הגיליון ב-Google Sheets
//  2. Extensions > Apps Script
//  3. מחק את כל הקוד הקיים, הדבק את הקוד הזה
//  4. הרץ את הפונקציה setupSheets() פעם אחת (כפתור ▶)
//  5. Deploy > New deployment > Web App
//     • Execute as: Me
//     • Who has access: Anyone
//  6. העתק את ה-URL של ה-Web App ושים אותו ב-.env
//     VITE_SHEETS_API_URL=https://script.google.com/macros/s/...../exec
// ═══════════════════════════════════════════════════════════════════

// ── Request router ────────────────────────────────────────────────────────

function doGet(e) {
  const action    = e.parameter.action || 'list';
  const sheetName = e.parameter.sheet  || 'projects';
  const id        = e.parameter.id;
  let data;
  if (e.parameter.data) {
    try { data = JSON.parse(e.parameter.data); } catch (err) {}
  }
  return respond(processAction(action, sheetName, data, id));
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {
    return respond({ error: 'Invalid JSON' });
  }
  return respond(processAction(body.action, body.sheet || 'projects', body.data, body.id));
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Core actions ──────────────────────────────────────────────────────────

function processAction(action, sheetName, data, id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(sheetName);
  if (!ws) return { error: 'Sheet not found: ' + sheetName };
  try {
    if (action === 'list')   return listRows(ws);
    if (action === 'add')    return addRow(ws, data || {});
    if (action === 'delete') return deleteRow(ws, id);
    if (action === 'update') return updateRow(ws, id, data || {});
    return { error: 'Unknown action: ' + action };
  } catch (err) {
    return { error: err.toString() };
  }
}

function listRows(ws) {
  const vals = ws.getDataRange().getValues();
  if (vals.length <= 1) return { data: [] };
  const headers = vals[0];
  const data = vals.slice(1)
    .filter(function(r) { return r[0] !== ''; })
    .map(function(r) {
      const obj = {};
      headers.forEach(function(h, i) { obj[h] = r[i]; });
      return obj;
    });
  return { data: data };
}

function addRow(ws, data) {
  if (ws.getLastRow() === 0) return { error: 'Sheet has no headers' };
  const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  const row = headers.map(function(h) {
    return data[h] !== undefined ? data[h] : '';
  });
  ws.appendRow(row);
  return { success: true, id: data.id };
}

function deleteRow(ws, id) {
  const vals = ws.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      ws.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'Row not found: ' + id };
}

function updateRow(ws, id, newData) {
  const vals    = ws.getDataRange().getValues();
  const headers = vals[0];
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      const updatedRow = headers.map(function(h, j) {
        return newData[h] !== undefined ? newData[h] : vals[i][j];
      });
      ws.getRange(i + 1, 1, 1, headers.length).setValues([updatedRow]);
      return { success: true };
    }
  }
  return { error: 'Row not found: ' + id };
}

// ── One-time setup — run once then deploy ─────────────────────────────────

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  createSheet(ss, 'projects', [
    'id', 'title', 'projectType', 'lat', 'lng', 'geometry',
    'targetYear', 'cost',
    'trafficPurpose', 'trafficClosureDate', 'trafficClosureDuration',
    'contractor', 'managementCompany',
    'image', 'notes', 'createdAt'
  ]);
  createSheet(ss, 'stations', [
    'id', 'title', 'description', 'status', 'lat', 'lng', 'geometry',
    'image', 'linkUrl', 'linkLabel', 'createdAt'
  ]);
  SpreadsheetApp.getUi().alert(
    '✅ הגיליונות נוצרו!\n\n' +
    'הצעד הבא:\n' +
    'Deploy > New deployment > Web App\n' +
    'Execute as: Me | Who has access: Anyone\n' +
    'העתק את ה-URL ל-.env כ-VITE_SHEETS_API_URL'
  );
}

function createSheet(ss, name, headers) {
  var ws = ss.getSheetByName(name);
  if (!ws) ws = ss.insertSheet(name);
  if (ws.getLastRow() > 0) return; // already has headers
  ws.appendRow(headers);
  ws.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1d4ed8')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  ws.setFrozenRows(1);
  ws.setColumnWidth(1, 160);  // id
  ws.setColumnWidth(2, 220);  // title
  ws.setColumnWidth(6, 300);  // geometry
}
