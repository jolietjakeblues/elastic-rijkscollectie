// Cloudflare Worker voor de Rijkscollectie SDO/Elastic demo.
// 1. Basic Auth vóór alles (ook de statische bestanden): AUTH_USER en AUTH_PASS zijn secrets.
// 2. /api/search stuurt de zoekvraag door naar de interne rijkscollectie-index en voegt TRIPLY_TOKEN toe.
//    Het token komt nooit in de browser. Alleen _search, alleen POST, met een begrensde request.
// 3. Statische bestanden uit web/ via de ASSETS-binding.
// Headers staan hier en niet in web/_headers: die gelden niet voor antwoorden van een Worker die eerst draait.

const ES_URL = 'https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/rijkscollectie-rce/services/rijkscollectie-rce-elastic/_search';
const MAX_BODY = 64 * 1024;
const MAX_SIZE = 500; // grootste size die de pagina vraagt (labels ophalen in blokken van 500)
const REALM = 'Rijkscollectie SDO/Elastic demo';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://images.memorix.nl; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Robots-Tag': 'noindex, nofollow',
  // Alles staat achter een wachtwoord: niet in gedeelde caches bewaren.
  'Cache-Control': 'private, no-store',
};

const json = (status, data, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
});

function withHeaders(response) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

// Vergelijk in constante tijd; hash eerst zodat ook de lengte niets verraadt.
async function same(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function authorized(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  let decoded;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const [userOk, passOk] = await Promise.all([same(decoded.slice(0, i), env.AUTH_USER), same(decoded.slice(i + 1), env.AUTH_PASS)]);
  return userOk && passOk;
}

async function proxySearch(request, env) {
  if (request.method !== 'POST') return json(405, { message: 'Alleen POST.' }, { Allow: 'POST' });
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return json(413, { message: 'Request te groot.' });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { message: 'Geen geldige JSON.' });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return json(400, { message: 'Verwacht een JSON-object.' });
  if ((body.size ?? 10) > MAX_SIZE) return json(400, { message: `size is maximaal ${MAX_SIZE}.` });

  const upstream = await fetch(ES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TRIPLY_TOKEN}` },
    body: JSON.stringify(body),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    // Zonder secrets dicht blijven in plaats van open.
    if (!env.AUTH_USER || !env.AUTH_PASS || !env.TRIPLY_TOKEN) {
      return withHeaders(new Response('De demo is nog niet geconfigureerd (secrets ontbreken).', { status: 503 }));
    }
    if (!(await authorized(request, env))) {
      return withHeaders(new Response('Inloggen vereist.', {
        status: 401,
        headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`, 'Content-Type': 'text/plain; charset=utf-8' },
      }));
    }
    const { pathname } = new URL(request.url);
    if (pathname === '/api/search') {
      try {
        return withHeaders(await proxySearch(request, env));
      } catch {
        return withHeaders(json(502, { message: 'De zoekservice is niet bereikbaar.' }));
      }
    }
    if (pathname.startsWith('/api/')) return withHeaders(json(404, { message: 'Onbekend endpoint.' }));
    return withHeaders(await env.ASSETS.fetch(request));
  },
};
