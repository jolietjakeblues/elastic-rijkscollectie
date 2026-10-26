// Rijkscollectie SDO/Elastic demo. Zoekt via /api/search (online de Worker in src/worker.js, lokaal server.py),
// die het TriplyDB-token toevoegt.
// TriplyDB vervangt punten in veldnamen door spaties: schema.org/name heet hier "https://schema org/name".

const TYPE = 'http://www w3 org/1999/02/22-rdf-syntax-ns#type';
const S = k => `https://schema org/${k}`;
const KW = k => S(k) + '.keyword';
const PAGE_SIZE = 24;
const MAX_WINDOW = 10000; // index.max_result_window
const PERSON = 'https://schema.org/Person';
const RKD = 'https://rkd.nl/artists/';
const MAKER_MAX = 1000; // maximaal aantal persoonsrecords per maker in het filter
const PERSON_FIELDS = ['name', 'sameAs', 'birthDate', 'deathDate', 'hasOccupation'].map(S);

// schema:temporal is tekst ("1923", "1923-02", "1975-05-11"). Een range op het keyword-veld sorteert als tekst;
// dat klopt met het jaartal zolang het vier cijfers heeft. Kortere jaartallen ("550", "-901") horen bij vóór 1800.
const TEMPORAL = KW('temporal');
const yearRange = (gte, lt) => ({ range: { [TEMPORAL]: { gte: String(gte), lt: String(lt) } } });
const PERIODES = [
  { id: '1', label: 'vóór 1800', clause: { bool: { should: [yearRange(1000, 1800), { regexp: { [TEMPORAL]: '-?[0-9]{1,3}(-[0-9]{2}){0,2}' } }], minimum_should_match: 1 } } },
  { id: '2', label: '1800–1899', clause: yearRange(1800, 1900) },
  { id: '3', label: '1900–1949', clause: yearRange(1900, 1950) },
  { id: '4', label: '1950–1979', clause: yearRange(1950, 1980) },
  { id: '5', label: '1980–1999', clause: yearRange(1980, 2000) },
  { id: '6', label: '2000 en later', clause: yearRange(2000, 2100) },
];
const FACETS = [
  { key: 'maker', label: 'Maker', kind: 'maker' },
  { key: 'periode', label: 'Periode', kind: 'periode' },
  { key: 'objectnaam', label: 'Objectnaam', field: 'alternateName' },
  { key: 'materiaal', label: 'Materiaal', field: 'material' },
  { key: 'genre', label: 'Genre', field: 'genre' },
  { key: 'plaats', label: 'Plaats', field: 'locationCreated' },
  // Geen facet in de zijbalk maar een eigen zoekbalk met autoaanvullen (zie "trefwoorden" hieronder).
  { key: 'trefwoord', label: 'Trefwoord', field: 'additionalType', hidden: true },
];
const SIDEBAR = FACETS.filter(f => !f.hidden);
const FIELDS = {
  Alles: [S('name') + '^3', S('alternateName') + '^3', S('description')],
  Titel: [S('name')],
  Objectnaam: [S('alternateName')],
  Beschrijving: [S('description')],
};

const blank = () => ({ query: '', field: 'Alles', img: false, page: 0, van: '', tot: '', filters: Object.fromEntries(FACETS.map(f => [f.key, []])) });
const state = blank();
const labels = new Map();     // IRI -> _source van het gelinkte document (DefinedTerm, Product, Person, MediaObject, ...)
const makers = new Map();     // makersleutel -> Promise<{ iris, sources, truncated }>
const makerNames = new Map(); // makersleutel -> naam
const closedFacets = new Set();
let controller;
let lastParts = null;         // query-onderdelen van de laatste zoekactie, voor het zoeken naar makers
let lastItems = {};           // facetwaarden van de laatste zoekactie
let makerQuery = '';          // tekst in het zoekveld van het makerfacet (niet in de URL)

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const format = n => n.toLocaleString('nl-NL');
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const uniq = a => [...new Set(a)];
const isIri = v => typeof v === 'string' && /^https?:\/\//.test(v);
const first = (src, k) => arr(src?.[S(k)])[0];
const label = v => (isIri(v) ? first(labels.get(v), 'name') ?? first(labels.get(v), 'value') ?? v : v);
const safeUrl = u => (/^https:\/\//.test(u ?? '') ? u : null);
// Een schuine streep start in query_string een reguliere expressie; maak er een gewoon teken van.
const veiligeZoekvraag = q => q.replace(/(?<!\\)\//g, '\\/');
const parseYear = v => (/^\d{4}$/.test(v) && +v >= 1000 && +v <= 2099 ? +v : null);

class LoginError extends Error {}

async function search(body, signal) {
  const r = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (r.status === 401) throw new LoginError('Je bent niet (meer) ingelogd.');
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const reason = j.error?.root_cause?.[0]?.reason ?? j.error?.reason ?? j.message ?? `HTTP ${r.status}`;
    throw new Error(/parse|syntax|Cannot parse/i.test(reason) ? `De zoekvraag klopt niet: controleer haakjes, quotes en operatoren. (${reason})` : `Zoeken niet gelukt: ${reason}`);
  }
  return r.json();
}

function errorHtml(error) {
  if (error instanceof LoginError) return `Je sessie is verlopen. <a href="/login?next=${esc(encodeURIComponent(location.pathname + location.search))}">Log opnieuw in</a>.`;
  if (error instanceof TypeError) return 'De zoekservice is niet bereikbaar. Controleer je verbinding en probeer opnieuw.';
  return esc(error.message);
}

// Labels, thumbnails en persoonsgegevens van gelinkte IRI's ophalen die nog niet bekend zijn.
async function resolve(iris, signal) {
  const todo = uniq(iris.filter(i => isIri(i) && !labels.has(i)));
  for (let i = 0; i < todo.length; i += 500) {
    const chunk = todo.slice(i, i + 500);
    const r = await search({
      size: chunk.length,
      _source: [...['name', 'value', 'unitText', 'valueReference', 'thumbnailUrl', 'contentUrl'].map(S), ...PERSON_FIELDS],
      query: { ids: { values: chunk } },
    }, signal);
    for (const h of r.hits.hits) labels.set(h._id, h._source);
    for (const id of chunk) if (!labels.has(id)) labels.set(id, {});
  }
}

// ---------- makers ----------
// Dezelfde kunstenaar heeft vaak meerdere persoonsrecords. Met precies één RKDartists-link is dat de sleutel;
// anders de naam. Records met meerdere RKD-links ("onbekend" heeft er tientallen) gaan dus niet op RKD samen.

const rkdLinks = src => arr(src?.[S('sameAs')]).filter(u => u.startsWith(RKD));
function makerKey(iri) {
  const src = labels.get(iri);
  const rkd = rkdLinks(src);
  const name = first(src, 'name');
  const key = rkd.length === 1 ? `rkd:${rkd[0]}` : name ? `naam:${name}` : `iri:${iri}`;
  if (name && !makerNames.has(key)) makerNames.set(key, name);
  return key;
}
const makerLabel = key => makerNames.get(key) ?? key.replace(/^(rkd|naam|iri):/, '');
const years = (srcs, k) => uniq(srcs.map(s => first(s, k)?.slice(0, 4)).filter(Boolean)).join('/');
function lifespan(srcs) {
  const b = years(srcs, 'birthDate'), d = years(srcs, 'deathDate');
  return b || d ? `${b || '?'}–${d}` : '';
}

function makerInfo(key) {
  if (!makers.has(key)) makers.set(key, loadMaker(key).catch(e => { makers.delete(key); throw e; }));
  return makers.get(key);
}
async function loadMaker(key) {
  const i = key.indexOf(':');
  const kind = key.slice(0, i), value = key.slice(i + 1);
  if (kind === 'iri') {
    await resolve([value]);
    return { iris: [value], sources: [labels.get(value)], truncated: false };
  }
  const term = kind === 'rkd' ? { [KW('sameAs')]: value } : { [KW('name')]: value };
  const found = [];
  for (let from = 0; from < MAKER_MAX; from += 500) {
    const r = await search({ from, size: 500, sort: ['_doc'], _source: PERSON_FIELDS, query: { bool: { filter: [{ term: { [TYPE + '.keyword']: PERSON } }, { term }] } } });
    for (const h of r.hits.hits) { labels.set(h._id, h._source); found.push(h._id); }
    if (r.hits.hits.length < 500) break;
  }
  const iris = found.filter(iri => makerKey(iri) === key);
  return { iris, sources: iris.map(iri => labels.get(iri)), truncated: found.length >= MAKER_MAX };
}

function groupMakers(buckets) {
  const counts = new Map();
  for (const b of buckets) {
    const k = makerKey(b.key);
    counts.set(k, (counts.get(k) ?? 0) + b.doc_count);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

// ---------- query ----------

async function filterClause(f, values) {
  if (!values.length) return null;
  if (f.kind === 'periode') {
    return { bool: { should: values.map(v => PERIODES.find(p => p.id === v)?.clause).filter(Boolean), minimum_should_match: 1 } };
  }
  if (f.kind === 'maker') {
    const iris = (await Promise.all(values.map(makerInfo))).flatMap(info => info.iris);
    return { terms: { [KW('creator')]: iris.length ? iris : ['-'] } };
  }
  return { terms: { [KW(f.field)]: values } };
}

async function queryParts() {
  const base = [{ term: { [TYPE + '.keyword']: 'https://schema.org/CreativeWork' } }];
  if (state.img) base.push({ exists: { field: S('associatedMedia') } });
  const van = parseYear(state.van), tot = parseYear(state.tot);
  if (van != null || tot != null) base.push(yearRange(van ?? 1000, (tot ?? 2099) + 1));
  const text = state.query
    ? { query_string: { query: veiligeZoekvraag(state.query), fields: FIELDS[state.field], allow_leading_wildcard: false } }
    : { match_all: {} };
  const ff = Object.fromEntries(await Promise.all(FACETS.map(async f => [f.key, await filterClause(f, state.filters[f.key])])));
  return { text, base, ff };
}
// Filters van de andere facetten, zonder het makerfilter (dat staat al in de query).
const othersOf = (ff, key) => FACETS.filter(o => o.key !== key && o.key !== 'maker' && ff[o.key]).map(o => ff[o.key]);

function buildQuery({ text, base, ff }) {
  // Het makerfilter kan honderden IRI's bevatten. Daarom staat het één keer in de query (en telt het dus mee
  // voor alle facetten), in plaats van in post_filter en in elk facet. Het makerfacet zelf telt via global met
  // dezelfde zoekvraag en de overige filters, zodat je meerdere makers kunt aanvinken.
  const aggs = Object.fromEntries(SIDEBAR.map(f => {
    if (f.kind === 'maker') {
      return [f.key, { global: {}, aggs: { binnen: { filter: { bool: { must: [text], filter: [...base, ...othersOf(ff, f.key)] } },
        aggs: { waarden: { terms: { field: KW('creator'), size: 150 } } } } } }];
    }
    const inner = f.kind === 'periode'
      ? { filters: { filters: Object.fromEntries(PERIODES.map(p => [p.id, p.clause])) } }
      : { terms: { field: KW(f.field), size: 100 } };
    return [f.key, { filter: { bool: { filter: othersOf(ff, f.key) } }, aggs: { waarden: inner } }];
  }));
  return {
    from: state.page * PAGE_SIZE, size: PAGE_SIZE, track_total_hits: true,
    query: { bool: { must: [text], filter: [...base, ...(ff.maker ? [ff.maker] : [])], should: [{ exists: { field: S('associatedMedia'), boost: 0.5 } }] } },
    post_filter: { bool: { filter: othersOf(ff, null) } },
    aggs,
    highlight: {
      encoder: 'html', pre_tags: ['<mark>'], post_tags: ['</mark>'],
      fields: { [S('name')]: { number_of_fragments: 0 }, [S('description')]: { fragment_size: 160, number_of_fragments: 1 } },
    },
    _source: ['name', 'alternateName', 'description', 'creator', 'temporal', 'associatedMedia'].map(S),
  };
}
// JSON-weergave: lange IRI-lijsten (makerfilter) inkorten, zodat de query leesbaar blijft.
const readable = body => JSON.stringify(body, (k, v) => (Array.isArray(v) && v.length > 12 && v.every(x => typeof x === 'string') ? [...v.slice(0, 8), `… en nog ${v.length - 8}`] : v), 2);

// ---------- facetten ----------

function itemsOf(f, agg) {
  if (!agg) return null;
  if (f.kind === 'periode') return PERIODES.map(p => ({ value: p.id, count: agg.waarden.buckets[p.id]?.doc_count ?? 0 }));
  if (f.kind === 'maker') return groupMakers(agg.binnen.waarden.buckets);
  return agg.waarden.buckets.map(b => ({ value: b.key, count: b.doc_count }));
}
function labelOf(f, value) {
  if (f.kind === 'periode') return PERIODES.find(p => p.id === value)?.label ?? value;
  if (f.kind === 'maker') return makerLabel(value);
  return label(value);
}
function facetIris(aggregations) {
  const iris = aggregations.maker.binnen.waarden.buckets.map(b => b.key);
  for (const f of SIDEBAR.filter(f => f.field)) iris.push(...aggregations[f.key].waarden.buckets.map(b => b.key), ...state.filters[f.key]);
  return [...iris, ...state.filters.trefwoord];
}

function listHtml(f, items) {
  const selected = state.filters[f.key];
  // Gekozen waarden blijven zichtbaar, ook als ze niet bij de meest voorkomende horen.
  const list = [...items];
  for (const v of selected) if (!list.some(x => x.value === v)) list.unshift({ value: v, count: null });
  if (!list.length) return '<p class="hint">Geen waarden bij deze zoekvraag.</p>';
  return `<ul class="facet-list">${list.map(x => `<li><label class="facet-option">
    <input type="checkbox" data-facet="${f.key}" value="${esc(x.value)}" ${selected.includes(x.value) ? 'checked' : ''}>
    <span class="facet-name">${esc(labelOf(f, x.value))}</span><span class="facet-count">${x.count == null ? '' : format(x.count)}</span></label></li>`).join('')}</ul>`;
}

function renderFacets(aggregations) {
  lastItems = Object.fromEntries(SIDEBAR.map(f => [f.key, itemsOf(f, aggregations?.[f.key])]));
  $('facets').innerHTML = SIDEBAR.map(f => {
    const n = state.filters[f.key].length;
    const items = lastItems[f.key];
    let body;
    if (!items) body = '<p class="hint">Deze facet is niet beschikbaar.</p>';
    else if (f.kind === 'maker') {
      body = `<input type="search" class="facet-filter" data-zoek="maker" value="${esc(makerQuery)}" placeholder="Zoek een maker, bijv. Gestel" aria-label="Zoek een maker" autocomplete="off">
        <div class="facet-body">${listHtml(f, items)}</div>
        <p class="hint" data-hint="maker">De makers met de meeste werken. Zoek op achternaam voor andere makers.</p>`;
    } else if (f.kind === 'periode') {
      body = `${listHtml(f, items)}
        <div class="jaren"><div><label for="van">Van</label><input id="van" inputmode="numeric" maxlength="4" value="${esc(state.van)}" placeholder="1900"></div>
          <div><label for="tot">Tot en met</label><input id="tot" inputmode="numeric" maxlength="4" value="${esc(state.tot)}" placeholder="1950"></div>
          <button type="button" id="jaren-toepassen">Toepassen</button></div>
        <p class="hint" id="jaren-hint">Jaartallen van 1000 tot 2099, te combineren met de periodes. Werken zonder datering vallen dan weg.</p>`;
    } else {
      const more = aggregations[f.key].waarden.sum_other_doc_count > 0;
      body = listHtml(f, items) + (more ? '<p class="hint">De 100 meest voorkomende waarden. Verfijn je zoekvraag voor andere waarden.</p>' : '');
    }
    return `<details data-facet="${f.key}" ${closedFacets.has(f.key) ? '' : 'open'}><summary>${f.label}${n ? ` (${n} gekozen)` : ''}</summary>${body}</details>`;
  }).join('');
  if (makerQuery.trim()) searchMakers();
}

// Makers zoeken op naam: personen met een naam die zo begint, en hun aantal werken binnen de huidige zoekvraag.
let makerSeq = 0, makerTimer;
async function searchMakers() {
  const f = FACETS.find(x => x.key === 'maker');
  const box = document.querySelector('[data-facet="maker"] .facet-body');
  const hint = document.querySelector('[data-hint="maker"]');
  if (!box || !lastParts) return;
  const text = makerQuery.trim();
  const my = ++makerSeq;
  if (!text) {
    box.innerHTML = listHtml(f, lastItems.maker ?? []);
    hint.textContent = 'De makers met de meeste werken. Zoek op achternaam voor andere makers.';
    return;
  }
  hint.textContent = 'Zoeken…';
  try {
    const people = await search({ size: 200, _source: PERSON_FIELDS, query: { bool: {
      filter: [{ term: { [TYPE + '.keyword']: PERSON } }],
      must: [{ match_phrase_prefix: { [S('name')]: { query: text, max_expansions: 200 } } }],
    } } });
    for (const h of people.hits.hits) labels.set(h._id, h._source);
    const iris = people.hits.hits.map(h => h._id);
    let items = [];
    if (iris.length) {
      const { text: q, base, ff } = lastParts;
      const r = await search({ size: 0, query: { bool: { must: [q], filter: [...base, ...othersOf(ff, 'maker')] } },
        aggs: { m: { terms: { field: KW('creator'), include: iris, size: iris.length } } } });
      items = groupMakers(r.aggregations.m.buckets);
    }
    if (my !== makerSeq) return;
    box.innerHTML = items.length ? listHtml(f, items) : `<p class="hint">Geen maker gevonden die begint met “${esc(text)}” bij deze zoekvraag.</p>`;
    hint.textContent = items.length ? `Makers waarvan de naam begint met “${text}”, met hun aantal werken bij deze zoekvraag.` : '';
  } catch (e) {
    if (my === makerSeq) { hint.innerHTML = errorHtml(e); }
  }
}

// ---------- resultaten ----------

function renderResults(hits) {
  $('results').innerHTML = hits.length ? hits.map(h => {
    const s = h._source, hl = h.highlight ?? {};
    const title = hl[S('name')]?.[0] ?? esc(first(s, 'name') ?? 'Zonder titel');
    const thumb = safeUrl(first(labels.get(arr(s[S('associatedMedia')])[0]), 'thumbnailUrl'));
    const meta = [first(s, 'alternateName'), first(s, 'temporal')].filter(Boolean).map(esc).join(' · ');
    const maker = arr(s[S('creator')]).map(label).filter(x => !isIri(x)).map(esc).join(', ');
    const match = hl[S('description')]?.[0];
    return `<li><article tabindex="0" data-id="${esc(h._id)}" aria-label="${esc(first(s, 'name') ?? 'Zonder titel')}">
      <div class="thumb">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="no-image">Geen afbeelding</span>'}</div>
      <div class="card-body"><h3>${title}</h3>
        ${meta ? `<p class="card-meta">${meta}</p>` : ''}${maker ? `<p class="card-meta">${maker}</p>` : ''}
        ${match ? `<p class="match">${match}</p>` : ''}</div>
    </article></li>`;
  }).join('') : '<li class="empty">Geen resultaten. Probeer een andere zoekvraag of minder filters.</li>';
}

function renderChips() {
  const chips = [];
  if (state.img) chips.push('<button type="button" data-remove="img" aria-label="Verwijder filter Alleen met afbeelding">Alleen met afbeelding ×</button>');
  if (state.van || state.tot) chips.push(`<button type="button" data-remove="jaren" aria-label="Verwijder filter jaartallen">Jaartallen: ${esc(state.van || '…')}–${esc(state.tot || '…')} ×</button>`);
  for (const f of FACETS) for (const v of state.filters[f.key]) {
    chips.push(`<button type="button" data-remove="${f.key}" data-value="${esc(v)}" aria-label="Verwijder filter ${esc(f.label)}: ${esc(labelOf(f, v))}">${esc(f.label)}: ${esc(labelOf(f, v))} ×</button>`);
  }
  if (chips.length) chips.push('<button type="button" data-remove="all">Wis alle filters</button>');
  $('active-filters').innerHTML = chips.join('');
}

// Makerpagina: bij precies één gekozen maker een blok met levensjaren, beroep en de link naar RKDartists.
async function renderContext() {
  const keys = state.filters.maker;
  if (keys.length !== 1) { $('context').hidden = true; return; }
  const key = keys[0];
  const info = await makerInfo(key);
  const occupations = uniq(info.sources.flatMap(s => arr(s?.[S('hasOccupation')])));
  await resolve(occupations);
  if (state.filters.maker.length !== 1 || state.filters.maker[0] !== key) return;
  const life = lifespan(info.sources);
  const allJobs = uniq(occupations.map(label).filter(x => !isIri(x)));
  const jobs = allJobs.slice(0, 8).join(', ') + (allJobs.length > 8 ? ` en nog ${allJobs.length - 8}` : '');
  const rkd = key.startsWith('rkd:') ? safeUrl(key.slice(4)) : null;
  const records = info.iris.length;
  $('context').innerHTML = `
    <p><strong>Maker: ${esc(makerLabel(key))}</strong>${life ? ` (${esc(life)})` : ''}</p>
    ${jobs ? `<p>Beroep of rol: ${esc(jobs)}</p>` : ''}
    <p class="hint">${records > 1 ? `${format(records)} persoonsrecords samengevoegd ${rkd ? 'op hetzelfde RKD-nummer' : 'op dezelfde naam (naamgenoten vallen hierbij samen)'}.` : 'Eén persoonsrecord.'}${info.truncated ? ` Alleen de eerste ${format(MAKER_MAX)} records worden gebruikt.` : ''}</p>
    <div class="links">${rkd ? `<a href="${esc(rkd)}" target="_blank" rel="noopener noreferrer">Bekijk in RKDartists</a>` : ''}<button type="button" data-remove="maker" data-value="${esc(key)}">Weer overal zoeken</button></div>`;
  $('context').hidden = false;
}

async function run(urlMode = 'push') {
  controller?.abort(); const current = new AbortController(); controller = current;
  syncUrl(urlMode);
  $('error').hidden = true; $('status').textContent = 'Zoeken…'; $('workspace').setAttribute('aria-busy', 'true');
  try {
    const parts = await queryParts();
    const body = buildQuery(parts);
    $('query-json').textContent = readable(body);
    const data = await search(body, current.signal);
    const hits = data.hits.hits;
    const iris = hits.flatMap(h => [...arr(h._source[S('creator')]), arr(h._source[S('associatedMedia')])[0]]);
    await resolve([...iris, ...facetIris(data.aggregations)], current.signal);
    if (controller !== current) return;
    lastParts = parts;
    const total = data.hits.total.value;
    renderResults(hits); renderFacets(data.aggregations); renderChips();
    renderContext().catch(e => console.error(e));
    $('status').textContent = `Totaal gevonden: ${format(total)} | Getoond: ${hits.length}`;
    $('page-info').textContent = hits.length ? `${format(state.page * PAGE_SIZE + 1)} tot ${format(state.page * PAGE_SIZE + hits.length)}` : '';
    const pages = Math.max(1, Math.ceil(Math.min(total, MAX_WINDOW) / PAGE_SIZE));
    $('pagination').hidden = total <= PAGE_SIZE;
    $('previous').disabled = state.page === 0;
    $('next').disabled = state.page + 1 >= pages;
    $('page-number').textContent = `Pagina ${state.page + 1} van ${format(pages)}`;
    if (total > MAX_WINDOW) $('results').insertAdjacentHTML('beforeend', '<li class="empty">Je kunt maximaal de eerste 10.000 resultaten bekijken. Verfijn je zoekvraag voor de overige resultaten.</li>');
  } catch (error) {
    if (controller !== current || error.name === 'AbortError') return;
    $('status').textContent = 'Zoeken niet gelukt.';
    $('error').innerHTML = errorHtml(error);
    $('error').hidden = false;
    $('results').innerHTML = ''; $('context').hidden = true; renderFacets(null); renderChips();
  } finally { if (controller === current) $('workspace').setAttribute('aria-busy', 'false'); }
}

// ---------- detail ----------

const pick = (facet, value, text) => `<button type="button" class="link-button" data-pick="${facet}" data-value="${esc(value)}">${esc(text)}</button>`;

async function openDetail(id) {
  const dlg = $('detail');
  $('detail-title').textContent = 'Object';
  $('detail-body').innerHTML = '<p>Laden…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const s = (await search({ size: 1, query: { ids: { values: [id] } } })).hits.hits[0]?._source;
    if (!s) throw new Error('Object niet gevonden.');
    await resolve(Object.entries(s).filter(([k]) => !k.startsWith('@') && k !== TYPE).flatMap(([, v]) => arr(v)));
    const get = k => arr(s[S(k)]);
    const sizes = get('size').filter(v => !isIri(v));
    const sizeText = sizes.length ? sizes.join('\n') : get('size').map(v => {
      const q = labels.get(v) ?? {};
      return `${first(q, 'valueReference') ?? ''}: ${first(q, 'value') ?? ''} ${first(q, 'unitText') ?? ''}`.trim();
    }).join('\n');
    const makersHtml = get('creator').map(iri => {
      const key = makerKey(iri), life = lifespan([labels.get(iri)]);
      return pick('maker', key, `${makerLabel(key)}${life ? ` (${life})` : ''}`);
    }).join(', ');
    const picks = (facet, values) => values.map(v => pick(facet, v, label(v))).join(', ');
    const rows = [
      ['Objectnaam', picks('objectnaam', get('alternateName'))],
      ['Trefwoord', picks('trefwoord', get('additionalType'))],
      ['Genre', picks('genre', get('genre'))],
      ['Vervaardiger', makersHtml],
      ['Datering', esc(get('temporal').join(', '))],
      ['Plaats', picks('plaats', get('locationCreated'))],
      ['Materiaal', picks('materiaal', get('material'))],
      ['Afmetingen', esc(sizeText)],
      ['Objectnummer', esc(get('identifier').map(label).join(', '))],
      ['Rechten', esc([...get('license'), ...get('copyrightHolder').map(label)].join(' · '))],
    ].filter(([, v]) => v);
    const media = get('associatedMedia').map(m => labels.get(m)).filter(m => safeUrl(first(m, 'contentUrl')));
    const url = safeUrl(get('url')[0]);
    $('detail-title').textContent = first(s, 'name') ?? 'Zonder titel';
    $('detail-body').innerHTML = `<div class="detail">
      <div>
        <div class="detail-image">${media.length ? `<img id="detail-main" src="${esc(first(media[0], 'contentUrl'))}" alt="${esc(first(s, 'name') ?? '')}">` : '<span class="no-image">Geen afbeelding</span>'}</div>
        ${media.length > 1 ? `<div class="strip">${media.map((m, i) => `<button type="button" data-full="${esc(first(m, 'contentUrl'))}" aria-label="Afbeelding ${i + 1}" ${i ? '' : 'aria-current="true"'}><img src="${esc(first(m, 'thumbnailUrl'))}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div>
        ${get('description').map(d => `<p class="description">${esc(d)}</p>`).join('')}
        <dl class="metadata">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <p class="hint">Klik op een maker, trefwoord, genre, materiaal, plaats of objectnaam voor alle werken met die waarde.</p>
        <div class="links">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Bekijk in de RCE-beeldbank</a>` : ''}</div>
        <p class="uri muted">${esc(id)}</p>
      </div></div>`;
  } catch (e) {
    $('detail-body').innerHTML = `<div id="detail-error" class="error-box">${errorHtml(e)}</div>`;
  }
}

// ---------- trefwoorden ----------
// Autoaanvullen op de termen van schema:additionalType (onderwerpen en objectsoorten door elkaar; de data maakt
// geen onderscheid). De termen met hun namen worden één keer geladen en in de browser gefilterd. Het aantal werken
// per suggestie bij de huidige zoekvraag en filters komt uit één kleine terms-aggregatie met include.

const SUGGESTIONS = 12;
const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let termsLoaded = null; // Promise<[{ iri, name, norm }]>
function loadTerms() {
  termsLoaded ??= (async () => {
    const r = await search({ size: 0, query: { term: { [TYPE + '.keyword']: 'https://schema.org/CreativeWork' } },
      aggs: { t: { terms: { field: KW('additionalType'), size: 2000 } } } });
    const iris = r.aggregations.t.buckets.map(b => b.key);
    await resolve(iris);
    return iris.map(iri => ({ iri, name: label(iri) })).filter(t => !isIri(t.name)).map(t => ({ ...t, norm: normalize(t.name) }));
  })().catch(e => { termsLoaded = null; throw e; });
  return termsLoaded;
}

// Rangorde: precies gelijk, begint ermee, een woord begint ermee, komt erin voor.
function matchTerms(terms, text) {
  const q = normalize(text.trim());
  const rank = t => (t.norm === q ? 0 : t.norm.startsWith(q) ? 1 : t.norm.split(/[\s\-(/,]+/).some(w => w.startsWith(q)) ? 2 : t.norm.includes(q) ? 3 : -1);
  return terms.map(t => ({ ...t, rank: rank(t) })).filter(t => t.rank >= 0 && !state.filters.trefwoord.includes(t.iri));
}

async function termCounts(iris) {
  if (!lastParts) return null;
  const { text, base, ff } = lastParts;
  const r = await search({ size: 0, query: { bool: { must: [text], filter: [...base, ...(ff.maker ? [ff.maker] : []), ...othersOf(ff, 'trefwoord')] } },
    aggs: { t: { terms: { field: KW('additionalType'), include: iris, size: iris.length } } } });
  return new Map(r.aggregations.t.buckets.map(b => [b.key, b.doc_count]));
}

const combo = { items: [], active: -1, message: '', seq: 0, timer: null };

function markMatch(name, text) {
  const i = name.toLowerCase().indexOf(text.trim().toLowerCase());
  if (i < 0 || !text.trim()) return esc(name);
  const j = i + text.trim().length;
  return `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, j))}</mark>${esc(name.slice(j))}`;
}

function renderSuggestions() {
  const list = $('trefwoord-lijst'), input = $('trefwoord');
  const text = input.value;
  list.innerHTML = combo.items.length
    ? combo.items.map((x, i) => `<li role="option" id="tw-${i}" data-i="${i}" aria-selected="${i === combo.active}"${x.count === 0 ? ' class="zero"' : ''}>
        <span>${markMatch(x.name, text)}</span><span class="facet-count">${x.count == null ? '' : `${format(x.count)} ${x.count === 1 ? 'werk' : 'werken'}`}</span></li>`).join('')
    : combo.message ? `<li class="message" role="presentation">${esc(combo.message)}</li>` : '';
  const open = !!list.innerHTML;
  list.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (combo.active >= 0) {
    input.setAttribute('aria-activedescendant', `tw-${combo.active}`);
    $(`tw-${combo.active}`)?.scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}

function closeSuggestions() {
  combo.seq++; combo.items = []; combo.message = ''; combo.active = -1;
  renderSuggestions();
}

async function updateSuggestions() {
  const text = $('trefwoord').value;
  const my = ++combo.seq;
  if (!text.trim()) { closeSuggestions(); return; }
  let matches;
  try {
    matches = matchTerms(await loadTerms(), text);
  } catch (e) {
    if (my !== combo.seq) return;
    combo.items = []; combo.message = e instanceof LoginError ? 'Je sessie is verlopen. Log opnieuw in.' : 'Trefwoorden laden is niet gelukt.';
    renderSuggestions(); return;
  }
  if (my !== combo.seq) return;
  if (!matches.length) {
    combo.items = []; combo.active = -1; combo.message = `Geen trefwoord met “${text.trim()}”.`;
    renderSuggestions(); return;
  }
  // Eerst de beste 40 op rangorde en naam, daarvan het aantal werken ophalen, dan de 12 beste tonen.
  matches.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'nl'));
  const candidates = matches.slice(0, 40);
  let counts = null;
  try { counts = await termCounts(candidates.map(t => t.iri)); } catch { /* dan zonder aantallen */ }
  if (my !== combo.seq) return;
  combo.items = candidates.map(t => ({ ...t, count: counts ? counts.get(t.iri) ?? 0 : null }))
    .sort((a, b) => (a.count === 0) - (b.count === 0) || a.rank - b.rank || (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name, 'nl'))
    .slice(0, SUGGESTIONS);
  combo.active = -1; combo.message = '';
  renderSuggestions();
}

function chooseTerm(item) {
  if (!state.filters.trefwoord.includes(item.iri)) state.filters.trefwoord = [...state.filters.trefwoord, item.iri];
  $('trefwoord').value = '';
  closeSuggestions();
  state.page = 0; run();
}

$('trefwoord').addEventListener('focus', () => { loadTerms().catch(() => {}); });
$('trefwoord').addEventListener('input', () => {
  clearTimeout(combo.timer);
  combo.timer = setTimeout(updateSuggestions, 120);
});
$('trefwoord').addEventListener('keydown', e => {
  const n = combo.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!n) { updateSuggestions(); return; }
    combo.active = e.key === 'ArrowDown' ? (combo.active + 1) % n : (combo.active <= 0 ? n - 1 : combo.active - 1);
    renderSuggestions();
  } else if (e.key === 'Enter') {
    e.preventDefault(); // nooit het zoekformulier versturen vanuit dit veld
    if (n) chooseTerm(combo.items[Math.max(combo.active, 0)]);
  } else if (e.key === 'Escape') {
    if (!$('trefwoord-lijst').hidden) { e.preventDefault(); closeSuggestions(); } else $('trefwoord').value = '';
  }
});
$('trefwoord').addEventListener('blur', () => { closeSuggestions(); });
// mousedown niet laten doorgaan, anders verliest het veld de focus en sluit de lijst vóór de klik.
$('trefwoord-lijst').addEventListener('mousedown', e => e.preventDefault());
$('trefwoord-lijst').addEventListener('click', e => {
  const li = e.target.closest('li[data-i]');
  if (li) chooseTerm(combo.items[+li.dataset.i]);
});

// ---------- URL en formulier ----------

function toParams() {
  const p = new URLSearchParams();
  if (state.query) p.set('q', state.query);
  if (state.field !== 'Alles') p.set('zoek', state.field);
  if (state.img) p.set('afbeelding', '1');
  if (state.van) p.set('van', state.van);
  if (state.tot) p.set('tot', state.tot);
  for (const f of FACETS) for (const v of state.filters[f.key]) p.append(f.key, v);
  if (state.page) p.set('pagina', state.page + 1);
  return p;
}
function fromParams() {
  const p = new URLSearchParams(location.search);
  Object.assign(state, blank(), {
    query: p.get('q') ?? '',
    field: FIELDS[p.get('zoek')] ? p.get('zoek') : 'Alles',
    img: p.get('afbeelding') === '1',
    van: parseYear(p.get('van') ?? '') ? p.get('van') : '',
    tot: parseYear(p.get('tot') ?? '') ? p.get('tot') : '',
    page: Math.max(0, (parseInt(p.get('pagina'), 10) || 1) - 1),
  });
  for (const f of FACETS) state.filters[f.key] = p.getAll(f.key);
}
function syncUrl(mode) {
  const q = toParams().toString();
  const url = `${location.pathname}${q ? `?${q}` : ''}`;
  if (mode === 'push' && url !== `${location.pathname}${location.search}`) history.pushState(null, '', url);
  else if (mode === 'replace') history.replaceState(null, '', url);
}
function syncForm() { $('query').value = state.query; $('field').value = state.field; $('img-only').checked = state.img; }

function applyYears() {
  const van = $('van').value.trim(), tot = $('tot').value.trim();
  const bad = [van, tot].some(v => v && parseYear(v) == null) || (van && tot && +van > +tot);
  if (bad) {
    $('jaren-hint').textContent = 'Vul jaartallen in van vier cijfers, van 1000 tot 2099, met “van” niet later dan “tot en met”.';
    $('jaren-hint').classList.add('invalid');
    return;
  }
  state.van = van; state.tot = tot; state.page = 0; run();
}

// ---------- events ----------

$('search-form').addEventListener('submit', e => {
  e.preventDefault();
  state.query = $('query').value.trim(); state.field = $('field').value; state.page = 0; run();
});
$('reset').addEventListener('click', () => { Object.assign(state, blank()); makerQuery = ''; syncForm(); run(); });
document.querySelector('.examples').addEventListener('click', e => {
  const b = e.target.closest('button[data-example]');
  if (!b) return;
  Object.assign(state, blank(), { query: b.dataset.example, img: b.dataset.img === '1' });
  if (b.dataset.filter) { const [k, ...v] = b.dataset.filter.split('='); state.filters[k] = [v.join('=')]; }
  syncForm(); run();
});
$('img-only').addEventListener('change', e => { state.img = e.target.checked; state.page = 0; run(); });
$('facets').addEventListener('change', e => {
  const box = e.target.closest('input[data-facet]');
  if (!box) return;
  const list = state.filters[box.dataset.facet];
  state.filters[box.dataset.facet] = box.checked ? [...list, box.value] : list.filter(v => v !== box.value);
  state.page = 0; run();
});
$('facets').addEventListener('input', e => {
  if (e.target.dataset.zoek !== 'maker') return;
  makerQuery = e.target.value;
  clearTimeout(makerTimer);
  makerTimer = setTimeout(searchMakers, 300);
});
$('facets').addEventListener('click', e => { if (e.target.id === 'jaren-toepassen') applyYears(); });
$('facets').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.target.id === 'van' || e.target.id === 'tot')) { e.preventDefault(); applyYears(); }
});
// 'toggle' bubbelt niet; via capture onthouden welke facetten dichtgeklapt zijn.
$('facets').addEventListener('toggle', e => {
  const key = e.target.dataset?.facet;
  if (key) e.target.open ? closedFacets.delete(key) : closedFacets.add(key);
}, true);

function removeFilter(b) {
  const k = b.dataset.remove;
  if (k === 'all') { state.filters = blank().filters; state.img = false; state.van = ''; state.tot = ''; }
  else if (k === 'img') state.img = false;
  else if (k === 'jaren') { state.van = ''; state.tot = ''; }
  else state.filters[k] = state.filters[k].filter(v => v !== b.dataset.value);
  state.page = 0; syncForm(); run();
}
$('active-filters').addEventListener('click', e => { const b = e.target.closest('button[data-remove]'); if (b) removeFilter(b); });
$('context').addEventListener('click', e => { const b = e.target.closest('button[data-remove]'); if (b) removeFilter(b); });
$('previous').addEventListener('click', () => { state.page--; run(); $('status').scrollIntoView({ behavior: 'smooth' }); });
$('next').addEventListener('click', () => { state.page++; run(); $('status').scrollIntoView({ behavior: 'smooth' }); });
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Link gekopieerd'; }
  catch { window.prompt('Kopieer deze link:', location.href); }
  setTimeout(() => { $('share').textContent = 'Kopieer link'; }, 2500);
});

$('results').addEventListener('click', e => { const a = e.target.closest('article'); if (a) openDetail(a.dataset.id); });
$('results').addEventListener('keydown', e => {
  const a = e.target.closest('article');
  if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(a.dataset.id); }
});
$('results').addEventListener('error', e => {
  if (e.target.tagName === 'IMG') e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'no-image', textContent: 'Afbeelding niet beschikbaar' }));
}, true);
$('detail-close').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('click', e => {
  if (e.target === $('detail')) { $('detail').close(); return; } // klik op de achtergrond
  const p = e.target.closest('button[data-pick]');
  if (p) {
    // Een klik op een waarde opent de "pagina" van die waarde: alle werken met alleen dat filter.
    Object.assign(state, blank());
    state.filters[p.dataset.pick] = [p.dataset.value];
    makerQuery = '';
    $('detail').close(); syncForm(); run();
    $('status').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const b = e.target.closest('.strip button');
  if (!b) return;
  $('detail-main').src = b.dataset.full;
  $('detail').querySelectorAll('.strip button').forEach(x => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'true');
});

window.addEventListener('popstate', () => { fromParams(); syncForm(); run('none'); });
fromParams(); syncForm(); run('replace');
