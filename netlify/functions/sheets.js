/**
 * Server-side proxy to sheets-connector.vercel.app
 * Runs on Netlify Functions — no CORS issues (server-to-server).
 *
 * URL:  /.netlify/functions/sheets?table=RAIL1[&id=xxx][&limit=50&offset=0]
 * HTTP: GET / POST / PATCH / DELETE
 */

const API_BASE   = 'https://sheets-connector.vercel.app';
const PROJECT_ID = '8a1144db-1cbf-4141-90b2-85021a633ed5';
const API_KEY    = 'GVll2aBExGBw-1ETHG23DhtVWKmJu0Ge';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // Parse query params — extract table and id, forward the rest
  const params = { ...(event.queryStringParameters || {}) };
  const table  = params.table;
  const id     = params.id;
  delete params.table;
  delete params.id;

  if (!table) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing ?table= param' }),
    };
  }

  const qs = new URLSearchParams(params).toString();
  const upstreamPath = id ? `/${table}/${id}` : `/${table}`;
  const upstreamUrl  = `${API_BASE}/api/v1/projects/${PROJECT_ID}/tables${upstreamPath}${qs ? '?' + qs : ''}`;

  const method = event.httpMethod;
  const fetchOpts = {
    method,
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  };
  if (method === 'POST' || method === 'PATCH') {
    fetchOpts.body = event.body || '{}';
  }

  try {
    const upstream = await fetch(upstreamUrl, fetchOpts);
    const body     = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
