// Rijkscollectie SDO/Elastic demo. Zoekt via /api/search (online de Worker in src/worker.js, lokaal server.py),
// die het TriplyDB-token toevoegt.
// TriplyDB vervangt punten in veldnamen door spaties: schema.org/name heet hier "https://schema org/name".

const TYPE = 'http://www w3 org/1999/02/22-rdf-syntax-ns#type';
const S = k => `https://schema org/${k}`;
const KW = k => S(k) + '.keyword';
const PAGE_SIZE = 24;
const MAX_WINDOW = 10000; // index.max_result_window
const FACETS = [
  { key: 'objectnaam', field: 'alternateName', label: 'Objectnaam', iri: false },
  { key: 'materiaal', field: 'material', label: 'Materiaal', iri: true },
  { key: 'genre', field: 'genre', label: 'Genre', iri: true },
];
const FIELDS = {
  Alles: [S('name') + '^3', S('alternateName') + '^3', S('description')],
  Titel: [S('name')],
  Objectnaam: [S('alternateName')],
  Beschrijving: [S('description')],
};

const blank = () => ({ query: '', field: 'Alles', img: false, page: 0, filters: Object.fromEntries(FACETS.map(f => [f.key, []])) });
const state = blank();
const labels = new Map(); // IRI -> _source van het gelinkte document (DefinedTerm, Product, Person, MediaObject, ...)
let controller;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const format = n => n.toLocaleString('nl-NL');
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isIri = v => typeof v === 'string' && /^https?:\/\//.test(v);
const first = (src, k) => arr(src?.[S(k)])[0];
const label = v => (isIri(v) ? first(labels.get(v), 'name') ?? first(labels.get(v), 'value') ?? v : v);
const safeUrl = u => (/^https:\/\//.test(u ?? '') ? u : null);
// Een schuine streep start in query_string een reguliere expressie; maak er een gewoon teken van.
const veiligeZoekvraag = q => q.replace(/(?<!\\)\//g, '\\/');

async function search(body, signal) {
  const r = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const reason = j.error?.root_cause?.[0]?.reason ?? j.error?.reason ?? j.message ?? `HTTP ${r.status}`;
    throw new Error(/parse|syntax|Cannot parse/i.test(reason) ? `De zoekvraag klopt niet: controleer haakjes, quotes en operatoren. (${reason})` : `Zoeken niet gelukt: ${reason}`);
  }
  return r.json();
}

// Labels en thumbnails van gelinkte IRI's ophalen die nog niet bekend zijn.
async function resolve(iris, signal) {
  const todo = [...new Set(iris.filter(i => isIri(i) && !labels.has(i)))];
  for (let i = 0; i < todo.length; i += 500) {
    const chunk = todo.slice(i, i + 500);
    const r = await search({
      size: chunk.length,
      _source: ['name', 'value', 'unitText', 'valueReference', 'thumbnailUrl', 'contentUrl'].map(S),
      query: { ids: { values: chunk } },
    }, signal);
    for (const h of r.hits.hits) labels.set(h._id, h._source);
    for (const id of chunk) if (!labels.has(id)) labels.set(id, {});
  }
}

function buildQuery() {
  const filter = [{ term: { [TYPE + '.keyword']: 'https://schema.org/CreativeWork' } }];
  if (state.img) filter.push({ exists: { field: S('associatedMedia') } });
  const text = state.query
    ? { query_string: { query: veiligeZoekvraag(state.query), fields: FIELDS[state.field], allow_leading_wildcard: false } }
    : { match_all: {} };
  const ff = Object.fromEntries(FACETS.map(f => [f.key, state.filters[f.key].length ? { terms: { [KW(f.field)]: state.filters[f.key] } } : null]));
  // Multi-select: elke facet telt met de filters van de andere facetten, niet met die van zichzelf.
  const aggs = Object.fromEntries(FACETS.map(f => [f.key, {
    filter: { bool: { filter: FACETS.filter(o => o.key !== f.key && ff[o.key]).map(o => ff[o.key]) } },
    aggs: { waarden: { terms: { field: KW(f.field), size: 100 } } },
  }]));
  return {
    from: state.page * PAGE_SIZE, size: PAGE_SIZE, track_total_hits: true,
    query: { bool: { must: [text], filter, should: [{ exists: { field: S('associatedMedia'), boost: 0.5 } }] } },
    post_filter: { bool: { filter: Object.values(ff).filter(Boolean) } },
    aggs,
    highlight: {
      encoder: 'html', pre_tags: ['<mark>'], post_tags: ['</mark>'],
      fields: { [S('name')]: { number_of_fragments: 0 }, [S('description')]: { fragment_size: 160, number_of_fragments: 1 } },
    },
    _source: ['name', 'alternateName', 'description', 'creator', 'temporal', 'associatedMedia'].map(S),
  };
}

// ---------- weergave ----------

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

function renderFilters(aggregations) {
  const chips = [];
  if (state.img) chips.push(`<button type="button" data-remove="img" aria-label="Verwijder filter Alleen met afbeelding">Alleen met afbeelding ×</button>`);
  for (const f of FACETS) for (const v of state.filters[f.key]) {
    chips.push(`<button type="button" data-remove="${f.key}" data-value="${esc(v)}" aria-label="Verwijder filter ${esc(f.label)}: ${esc(label(v))}">${esc(f.label)}: ${esc(label(v))} ×</button>`);
  }
  if (chips.length) chips.push('<button type="button" data-remove="all">Wis alle filters</button>');
  $('active-filters').innerHTML = chips.join('');

  $('facets').innerHTML = FACETS.map(f => {
    const agg = aggregations?.[f.key]?.waarden;
    const selected = state.filters[f.key];
    const summary = selected.length ? `${f.label} (${selected.length} gekozen)` : f.label;
    if (!agg) return `<details open><summary>${summary}</summary><p class="hint">Deze facet is niet beschikbaar.</p></details>`;
    // Gekozen waarden blijven zichtbaar, ook als ze niet bij de 100 meest voorkomende horen.
    const buckets = [...agg.buckets];
    for (const v of selected) if (!buckets.some(b => b.key === v)) buckets.unshift({ key: v, doc_count: null });
    const items = buckets.map(b => `<li><label class="facet-option">
      <input type="checkbox" data-facet="${f.key}" value="${esc(b.key)}" ${selected.includes(b.key) ? 'checked' : ''}>
      <span class="facet-name">${esc(label(b.key))}</span><span class="facet-count">${b.doc_count == null ? '' : format(b.doc_count)}</span></label></li>`).join('');
    return `<details open><summary>${summary}</summary>
      ${buckets.length ? `<ul class="facet-list">${items}</ul>` : '<p class="hint">Geen waarden bij deze zoekvraag.</p>'}
      ${agg.sum_other_doc_count > 0 ? '<p class="hint">De 100 meest voorkomende waarden. Verfijn je zoekvraag voor andere waarden.</p>' : ''}</details>`;
  }).join('');
}

async function run(urlMode = 'push') {
  controller?.abort(); const current = new AbortController(); controller = current;
  syncUrl(urlMode);
  $('error').hidden = true; $('status').textContent = 'Zoeken…'; $('workspace').setAttribute('aria-busy', 'true');
  try {
    const body = buildQuery();
    $('query-json').textContent = JSON.stringify(body, null, 2);
    const data = await search(body, current.signal);
    const hits = data.hits.hits;
    const iris = hits.flatMap(h => [...arr(h._source[S('creator')]), arr(h._source[S('associatedMedia')])[0]]);
    for (const f of FACETS.filter(f => f.iri)) iris.push(...data.aggregations[f.key].waarden.buckets.map(b => b.key), ...state.filters[f.key]);
    await resolve(iris, current.signal);
    if (controller !== current) return;
    const total = data.hits.total.value;
    renderResults(hits); renderFilters(data.aggregations);
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
    $('error').textContent = error instanceof TypeError ? 'De zoekservice is niet bereikbaar. Controleer je verbinding en probeer opnieuw.' : error.message;
    $('error').hidden = false;
    $('results').innerHTML = ''; renderFilters(null);
  } finally { if (controller === current) $('workspace').setAttribute('aria-busy', 'false'); }
}

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
    const rows = [
      ['Objectnaam', get('alternateName').join(', ')],
      ['Objectsoort', get('additionalType').map(label).join(', ')],
      ['Genre', get('genre').map(label).join(', ')],
      ['Vervaardiger', get('creator').map(label).join(', ')],
      ['Datering', get('temporal').join(', ')],
      ['Plaats', get('locationCreated').map(label).join(', ')],
      ['Materiaal', get('material').map(label).join(', ')],
      ['Afmetingen', sizeText],
      ['Objectnummer', get('identifier').map(label).join(', ')],
      ['Rechten', [...get('license'), ...get('copyrightHolder').map(label)].join(' · ')],
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
        <dl class="metadata">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="links">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Bekijk in de RCE-beeldbank</a>` : ''}</div>
        <p class="uri muted">${esc(id)}</p>
      </div></div>`;
  } catch (e) {
    $('detail-body').innerHTML = `<div id="error">${esc(e.message)}</div>`;
  }
}

// ---------- URL en formulier ----------

function toParams() {
  const p = new URLSearchParams();
  if (state.query) p.set('q', state.query);
  if (state.field !== 'Alles') p.set('zoek', state.field);
  if (state.img) p.set('afbeelding', '1');
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

// ---------- events ----------

$('search-form').addEventListener('submit', e => {
  e.preventDefault();
  state.query = $('query').value.trim(); state.field = $('field').value; state.page = 0; run();
});
$('reset').addEventListener('click', () => { Object.assign(state, blank()); syncForm(); run(); });
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
$('active-filters').addEventListener('click', e => {
  const b = e.target.closest('button[data-remove]');
  if (!b) return;
  const k = b.dataset.remove;
  if (k === 'all') { state.filters = blank().filters; state.img = false; }
  else if (k === 'img') state.img = false;
  else state.filters[k] = state.filters[k].filter(v => v !== b.dataset.value);
  state.page = 0; syncForm(); run();
});
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
  if (e.target === $('detail')) $('detail').close(); // klik op de achtergrond
  const b = e.target.closest('.strip button');
  if (!b) return;
  $('detail-main').src = b.dataset.full;
  $('detail').querySelectorAll('.strip button').forEach(x => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'true');
});

window.addEventListener('popstate', () => { fromParams(); syncForm(); run('none'); });
fromParams(); syncForm(); run('replace');
