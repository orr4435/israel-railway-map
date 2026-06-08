/* eslint-disable @typescript-eslint/no-var-requires */
const fetch = require('node-fetch');

const API_BASE   = 'https://sheets-connector.vercel.app';
const PROJECT_ID = '8a1144db-1cbf-4141-90b2-85021a633ed5';
const API_KEY    = 'GVll2aBExGBw-1ETHG23DhtVWKmJu0Ge';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function ok(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return ok(204, '');

  const q     = event.queryStringParameters || {};
  const table = q.table;
  const id    = q.id;
  if (!table) return ok(400, JSON.stringify({ error: 'Missing ?table' }));

  // Forward remaining query params (limit, offset…)
  const fwd = Object.entries(q)
    .filter(([k]) => k !== 'table' && k !== 'id')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const path = `${API_BASE}/api/v1/projects/${PROJECT_ID}/tables/${table}` +
               (id  ? `/${encodeURIComponent(id)}` : '') +
               (fwd ? `?${fwd}` : '');

  const method = event.httpMethod;
  let   body   = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || null);

  console.log('[sheets]', method, path);

  try {
    const res  = await fetch(path, {
      method,
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: (method === 'POST' || method === 'PATCH') ? body : undefined,
    });
    const text = await res.text();
    console.log('[sheets] status', res.status, text.slice(0, 200));
    return ok(res.status, text);
  } catch (e) {
    console.error('[sheets] error', e);
    return ok(502, JSON.stringify({ error: String(e) }));
  }
};
