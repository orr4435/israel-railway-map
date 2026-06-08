/**
 * Server-side proxy → sheets-connector.vercel.app
 * Uses Node.js built-in `https` so it works on any Node version.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const API_BASE   = 'https://sheets-connector.vercel.app';
const PROJECT_ID = '8a1144db-1cbf-4141-90b2-85021a633ed5';
const API_KEY    = 'GVll2aBExGBw-1ETHG23DhtVWKmJu0Ge';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple HTTP client using Node built-ins
function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(urlStr);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers:  opts.headers || {},
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.status || res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });

    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function reply(statusCode, data) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
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

  let rawBody = event.body || '{}';
  if (event.isBase64Encoded) rawBody = Buffer.from(rawBody, 'base64').toString('utf8');

  console.log(`[sheets] ${method} ${upstreamUrl}`);

  try {
    const upstream = await request(upstreamUrl, {
      method,
      headers: {
        'x-api-key':    API_KEY,
        'Content-Type': 'application/json',
        ...(rawBody && rawBody !== '{}' ? { 'Content-Length': Buffer.byteLength(rawBody) } : {}),
      },
      body: (method === 'POST' || method === 'PATCH') ? rawBody : undefined,
    });

    console.log(`[sheets] upstream → ${upstream.status}`, upstream.body.slice(0, 200));
    return reply(upstream.status, upstream.body);
  } catch (err) {
    console.error('[sheets] error:', err);
    return reply(502, { error: String(err) });
  }
};
