# Rijkscollectie SDO/Elastic demo

> **Dit is een demo.** Bouw hier geen applicaties of andere afhankelijkheden op. De scripts, index en service kunnen zonder aankondiging wijzigen of verdwijnen.

Een zoekpagina op de Elasticsearch-service van de RCE-dataset `rijkscollectie-rce`: ruim 133.000 kunstwerken en objecten uit de Rijkscollectie. De pagina kan vrij zoeken op titel, objectnaam en beschrijving (met de `query_string`-syntax: AND, OR, NOT, quotes, `*`, `~`), heeft facetten voor objectnaam, materiaal en genre, toont thumbnails uit de RCE-beeldbank en heeft een detailweergave met alle afbeeldingen, afmetingen en objectnummer.

Zusterdemo's in dezelfde huisstijl: de [Erfgoed SDO/Elastic demo](https://erfgoed-sdo-elastic-demo.jolietjakeblues64.workers.dev/) en de [Archeologie SDO/Elastic demo](https://elastic-archeologie.jolietjakeblues64.workers.dev/).

## Verschil met de andere demo's: wachtwoord en proxy

`rijkscollectie-rce` is een **interne** dataset. De Elasticsearch-service geeft zonder TriplyDB-token `Not found or unauthorized`. Daarom praat de browser hier niet rechtstreeks met de service, zoals in de andere demo's, maar via een proxy:

```text
browser ──Basic Auth──▶ Cloudflare Worker (src/worker.js) ──Bearer TRIPLY_TOKEN──▶ rijkscollectie-rce-elastic/_search
```

De Worker:

- vraagt voor **alles** een gebruikersnaam en wachtwoord (HTTP Basic Auth), ook voor de statische bestanden;
- stuurt `POST /api/search` door naar de index en voegt daar het token toe. Het token komt nooit in de browser;
- laat alleen `_search` toe, alleen `POST`, met een JSON-body van maximaal 64 kB en `size` van maximaal 500;
- blijft dicht (HTTP 503) als een van de secrets ontbreekt;
- zet de beveiligingsheaders zelf (CSP, `noindex`, `Cache-Control: private, no-store`). Een `web/_headers`-bestand werkt hier niet: dat geldt niet voor antwoorden van een Worker die vóór de statische bestanden draait (`run_worker_first`).

| Secret | Inhoud |
|---|---|
| `AUTH_USER` | gebruikersnaam voor de demo |
| `AUTH_PASS` | wachtwoord voor de demo (lang en willekeurig) |
| `TRIPLY_TOKEN` | TriplyDB-token met leesrechten op `rce/rijkscollectie-rce` |

Iedereen die het wachtwoord heeft, kan via de Worker de hele index bevragen, niet alleen deze pagina gebruiken. Deel het wachtwoord alleen met mensen die de interne dataset mogen zien.

## Lokaal draaien

Er zijn twee manieren. Beide gebruiken dezelfde bestanden in `web/`.

**Snel, zonder wachtwoord** (Python, leest `TRIPLY_TOKEN` uit de omgeving of uit je Windows-gebruikersvariabelen):

```bash
python server.py
```

Open daarna <http://127.0.0.1:8765>. `server.py` stuurt dezelfde beveiligingsheaders als de Worker (gelezen uit `src/worker.js`), zodat CSP-fouten ook lokaal zichtbaar zijn.

**Precies zoals online** (de Worker zelf, met Basic Auth):

```bash
cp .dev.vars.example .dev.vars
```

Vul in `.dev.vars` de drie waarden in (`.dev.vars` staat in `.gitignore`) en start:

```bash
npx wrangler dev
```

Open <http://127.0.0.1:8787>. De browser vraagt om gebruikersnaam en wachtwoord.

## Publiceren

Eenmalig, met [Wrangler](https://developers.cloudflare.com/workers/wrangler/) en ingelogd op het juiste Cloudflare-account (`npx wrangler whoami`):

1. Maak in TriplyDB een token met **alleen leesrechten**, liefst van een apart account en niet je persoonlijke. Alles wat bezoekers opvragen gebeurt namens het account van het token.
2. Deploy de Worker:

   ```bash
   npx wrangler deploy
   ```

3. Zet de drie secrets. Wrangler vraagt elke waarde interactief, zodat ze niet in je shellgeschiedenis komen. Elke `secret put` maakt meteen een nieuwe versie live.

   ```bash
   npx wrangler secret put AUTH_USER
   ```

   ```bash
   npx wrangler secret put AUTH_PASS
   ```

   ```bash
   npx wrangler secret put TRIPLY_TOKEN
   ```

   Tussen stap 2 en 3 geeft de demo HTTP 503: hij blijft dicht tot alle secrets er zijn.

4. Controleer op `https://rijkscollectie-elastic-demo.<jouw-subdomein>.workers.dev`: zonder inloggen HTTP 401, met inloggen de zoekpagina.

Daarna is `npx wrangler deploy` genoeg voor nieuwe versies; de secrets blijven staan.

**Wachtwoord wijzigen of iemand de toegang ontnemen:** zet een nieuw `AUTH_PASS` met `npx wrangler secret put AUTH_PASS` en deel dat alleen met wie nog toegang mag hebben. Er is één gedeeld wachtwoord; per persoon toegang beheren kan met [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/) in plaats van Basic Auth.

**Uitloggen:** Basic Auth kent geen uitlogknop. De browser onthoudt de inlog tot hij helemaal wordt afgesloten.

## Wat niet in de repo hoort

De repository is openbaar. Zet er nooit in:

- `.dev.vars` of `.env` (lokale secrets);
- `resultaten/`: de uitvoer van de consistentietest, met tellingen en IRI's uit de interne dataset;
- een TriplyDB-token, in welk bestand dan ook.

Deze staan in `.gitignore`. Een bestand dat al gecommit is, blijft echter getrackt. Haal het dan uit de index met `git rm -r --cached <pad>` en commit dat. Het staat daarna nog wel in de geschiedenis.

## Consistentietest

`consistentietest.py` vergelijkt de Elasticsearch-index met het SPARQL-endpoint van dezelfde dataset: totalen per `rdf:type`, velddekking per predicaat, een willekeurige steekproef van documenten in beide richtingen (waarde voor waarde) en facettellingen. Het rapport komt in `resultaten/` (Markdown en JSON).

```bash
python consistentietest.py --sample 100 --seed 42 --facet https://schema.org/additionalType --facet https://schema.org/genre --facet https://schema.org/material
```

Uitkomst in oktober 2026: index en SPARQL komen volledig overeen. 603.467 documenten (waarvan 133.000 `schema:CreativeWork`), alle 30 predicaten met gelijke aantallen, 400 documenten per richting identiek, alle facetten gelijk.

Het script werkt ook op andere TriplyDB-datasets met een Elasticsearch-service, bijvoorbeeld:

```bash
python consistentietest.py --dataset rce/Rijksmonumenten-sdo --service Rijksmonumenten-sdo-elas
```

## Bestanden

| Pad | Wat |
|---|---|
| `web/` | de zoekpagina: `index.html`, `style.css`, `app.js`, `favicon.svg` |
| `src/worker.js` | Cloudflare Worker: Basic Auth, proxy naar de index, beveiligingsheaders |
| `wrangler.jsonc` | Worker-configuratie (`run_worker_first`, ASSETS-binding, verplichte secrets) |
| `server.py` | lokale proxy zonder wachtwoord, voor snel ontwikkelen |
| `consistentietest.py` | vergelijking Elasticsearch ↔ SPARQL |
| `.dev.vars.example` | voorbeeld voor de lokale secrets van `wrangler dev` |

## Index: goed om te weten

- In veldnamen staat een spatie in plaats van een punt: `https://schema org/name`. Voor facetten en filters gebruik je het subveld `.keyword`.
- Elk RDF-subject is een eigen document. Een kunstwerk verwijst naar materialen, genres, makers, afmetingen en afbeeldingen via IRI's. De labels daarvan haalt de pagina in een tweede request op met een `ids`-query.
- Afbeeldingen: `schema:associatedMedia` → `MediaObject` met `thumbnailUrl` (200×200) en `contentUrl`, allemaal op `images.memorix.nl` (daarom staat alleen dat domein in de CSP).
- `index.max_result_window` is 10.000: verder bladeren dan de eerste 10.000 resultaten kan niet.
