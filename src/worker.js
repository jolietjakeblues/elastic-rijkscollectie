// Cloudflare Worker voor de Rijkscollectie SDO/Elastic demo.
// 1. Eigen inlogpagina (/login) met een ondertekend sessiecookie, vóór alles behalve style.css en favicon.svg.
//    Eerst was dit HTTP Basic Auth, maar in de Rijkscollectieverkenner bleek de inlogpop-up van de browser op
//    zakelijke laptops soms stilletjes onderdrukt te worden. Een gewoon HTML-formulier werkt altijd.
// 2. /api/search stuurt de zoekvraag door naar de interne rijkscollectie-index en voegt TRIPLY_TOKEN toe.
//    Het token komt nooit in de browser. Alleen _search, alleen POST, met een begrensde request.
// 3. Statische bestanden uit web/ via de ASSETS-binding.
// Headers staan hier en niet in web/_headers: die gelden niet voor antwoorden van een Worker die eerst draait.
//
// Sessie: cookie "<verloopt-ms>.<HMAC-SHA256>", ondertekend met een sleutel afgeleid van AUTH_USER en AUTH_PASS.
// Geen opslag nodig: de handtekening is het bewijs. Een nieuw wachtwoord (wrangler secret put AUTH_PASS) maakt
// alle bestaande sessies ongeldig. Er is geen blokkade na herhaalde foute pogingen, wel een vertraging van 1 s.

const ES_URL = 'https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/rijkscollectie-rce/services/rijkscollectie-rce-elastic/_search';
const MAX_BODY = 256 * 1024; // een makerfilter kan honderden IRI's bevatten (bijv. alle personen "onbekend")
const MAX_SIZE = 500; // grootste size die de pagina vraagt (labels ophalen in blokken van 500)
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dagen
const PUBLIC_PATHS = new Set(['/style.css', '/favicon.svg']); // nodig voor de inlogpagina; niets uit de collectie

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://images.memorix.nl; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Robots-Tag': 'noindex, nofollow',
  // Alles staat achter een wachtwoord: niet in gedeelde caches bewaren.
  'Cache-Control': 'private, no-store',
};

const enc = new TextEncoder();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = (status, data, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
});
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { Location: location, ...extra } });

function withHeaders(response) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

// Vergelijk in constante tijd; hash eerst zodat ook de lengte niets verraadt.
async function same(a, b) {
  const [ha, hb] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

// ---------- sessie ----------

// __Host- dwingt Secure, Path=/ en geen Domain af; werkt alleen via https. Lokaal (wrangler dev, http) zonder voorvoegsel.
const cookieName = url => (url.protocol === 'https:' ? '__Host-rc_sessie' : 'rc_sessie');
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const sessionKey = env => crypto.subtle.importKey('raw', enc.encode(`rc-sessie\n${env.AUTH_USER}\n${env.AUTH_PASS}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function sessionCookie(env, url) {
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000);
  const sig = await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(expires));
  return `${cookieName(url)}=${expires}.${b64url(sig)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
const clearCookie = url => `${cookieName(url)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`;

async function hasSession(request, env, url) {
  const name = cookieName(url);
  const raw = (request.headers.get('Cookie') ?? '').split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1);
  const m = /^(\d+)\.([A-Za-z0-9_-]+)$/.exec(raw ?? '');
  if (!m || Number(m[1]) < Date.now()) return false;
  try {
    return await crypto.subtle.verify('HMAC', await sessionKey(env), fromB64url(m[2]), enc.encode(m[1]));
  } catch {
    return false;
  }
}

// Alleen terugsturen naar een pad op deze site (geen //andere-site of /\andere-site).
const safeNext = next => (typeof next === 'string' && /^\/(?![/\\])/.test(next) && !next.startsWith('/login') ? next : '/');

function loginPage(next, error) {
  return new Response(`<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inloggen | Rijkscollectie SDO/Elastic demo</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <a class="skip" href="#gebruiker">Direct naar inloggen</a>
  <header class="site-header">
    <div class="brand"><p><strong>Rijkscollectie SDO/Elastic demo</strong><br>Technische demonstrator op data van de RCE</p></div>
    <nav class="bar" aria-label="Kruimelpad"><div class="wrap"><ol class="crumbs"><li>Demo</li><li aria-current="page">Inloggen</li></ol></div></nav>
  </header>
  <main>
    <div class="search-band"><div class="wrap">
      <h1>Inloggen</h1>
      <p class="intro">Deze demo gebruikt een interne dataset van de Rijksdienst voor het Cultureel Erfgoed en is alleen toegankelijk met een gebruikersnaam en wachtwoord.</p>
      <form class="login" method="post" action="/login">
        ${error ? '<div id="error" role="alert">Onjuiste gebruikersnaam of wachtwoord.</div>' : ''}
        <input type="hidden" name="next" value="${esc(next)}">
        <div><label for="gebruiker">Gebruikersnaam</label><input id="gebruiker" name="username" type="text" autocomplete="username" required autofocus></div>
        <div><label for="wachtwoord">Wachtwoord</label><input id="wachtwoord" name="password" type="password" autocomplete="current-password" required></div>
        <div class="actions"><button type="submit" class="primary">Inloggen</button></div>
      </form>
    </div></div>
  </main>
  <footer class="site-footer"><div class="bar"><div class="wrap"><p><strong>Dit is een demo.</strong> Bouw hier geen applicaties of andere afhankelijkheden op. De scripts, index en service kunnen zonder aankondiging wijzigen of verdwijnen.</p></div></div></footer>
</body>
</html>`, { status: error ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function login(request, env, url) {
  // Alleen formulieren van deze site zelf (eenvoudige bescherming tegen inloggen via een andere site).
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response('Verboden.', { status: 403 });
  let form;
  try {
    form = await request.formData();
  } catch {
    return loginPage('/', true);
  }
  const next = safeNext(form.get('next'));
  const [userOk, passOk] = await Promise.all([same(String(form.get('username') ?? ''), env.AUTH_USER), same(String(form.get('password') ?? ''), env.AUTH_PASS)]);
  if (userOk && passOk) return redirect(next, { 'Set-Cookie': await sessionCookie(env, url) });
  await new Promise(resolve => setTimeout(resolve, 1000)); // raden trager maken
  return loginPage(next, true);
}

// ---------- zoekproxy ----------

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

async function handle(request, env) {
  // Zonder secrets dicht blijven in plaats van open.
  if (!env.AUTH_USER || !env.AUTH_PASS || !env.TRIPLY_TOKEN) {
    return new Response('De demo is nog niet geconfigureerd (secrets ontbreken).', { status: 503 });
  }
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/login') {
    if (request.method === 'POST') return login(request, env, url);
    const next = safeNext(url.searchParams.get('next'));
    return (await hasSession(request, env, url)) ? redirect(next) : loginPage(next, false);
  }
  if (pathname === '/logout') return redirect('/login', { 'Set-Cookie': clearCookie(url) });
  if (PUBLIC_PATHS.has(pathname)) return env.ASSETS.fetch(request);

  if (!(await hasSession(request, env, url))) {
    if (pathname.startsWith('/api/') || request.method !== 'GET') return json(401, { message: 'Niet ingelogd of sessie verlopen.' });
    return redirect(`/login?next=${encodeURIComponent(pathname + url.search)}`);
  }

  if (pathname === '/api/search') {
    try {
      return await proxySearch(request, env);
    } catch {
      return json(502, { message: 'De zoekservice is niet bereikbaar.' });
    }
  }
  if (pathname.startsWith('/api/')) return json(404, { message: 'Onbekend endpoint.' });
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    return withHeaders(await handle(request, env));
  },
};
