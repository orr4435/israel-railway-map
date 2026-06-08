const API_BASE   = 'https://sheets-connector.vercel.app';
const PROJECT_ID = '8a1144db-1cbf-4141-90b2-85021a633ed5';
const API_KEY    = 'GVll2aBExGBw-1ETHG23DhtVWKmJu0Ge';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function reply(statusCode, data, extra = {}) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
    body: typeof data === 'string' ? data : JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(204, '');

  const params = { ...(event.queryStringParameters || {}) };
  const table  = params.table;
  const id     = params.id;
  delete params.table;
  delete params.id;

  if (!table) return reply(400, { error: 'Missing ?table= param' });

  const qs           = new URLSearchParams(params).toString();
  const upstreamPath = id ? `/${table}/${encodeURIComponent(id)}` : `/${table}`;
  const upstreamUrl  = `${API_BASE}/api/v1/projects/${PROJECT_ID}/tables${upstreamPath}${qs ? '?' + qs : ''}`;
  const method       = event.httpMethod;

  // Decode body (Netlify may base64-encode binary payloads)
  let rawBody = event.body || '{}';
  if (event.isBase64Encoded) rawBody = Buffer.from(rawBody, 'base64').toString('utf8');

  console.log(`[sheets-fn] ${method} ${upstreamUrl}`);
  if (method === 'POST' || method === 'PATCH') console.log('[sheets-fn] body:', rawBody.slice(0, 300));

  const fetchOpts = {
    method,
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    ...(method === 'POST' || method === 'PATCH' ? { body: rawBody } : {}),
  };

  try {
    const upstream   = await fetch(upstreamUrl, fetchOpts);
    const bodyText   = await upstream.text();
    console.log(`[sheets-fn] upstream status: ${upstream.status}`, bodyText.slice(0, 200));
    return reply(upstream.status, bodyText);
  } catch (err) {
    console.error('[sheets-fn] fetch error:', err);
    return reply(502, { error: String(err) });
  }
};
