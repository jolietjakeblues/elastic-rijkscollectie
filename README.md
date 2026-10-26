# Rijkscollectie SDO/Elastic demo

> **Dit is een demo.** Bouw hier geen applicaties of andere afhankelijkheden op. De scripts, index en service kunnen zonder aankondiging wijzigen of verdwijnen.

Een zoekpagina op de Elasticsearch-service van de RCE-dataset `rijkscollectie-rce`: ruim 133.000 kunstwerken en objecten uit de Rijkscollectie. De pagina kan vrij zoeken op titel, objectnaam en beschrijving (met de `query_string`-syntax: AND, OR, NOT, quotes, `*`, `~`), heeft facetten voor maker, periode (met een van/tot-jaartalfilter), objectnaam, materiaal, genre en plaats, toont thumbnails uit de RCE-beeldbank en heeft een detailweergave met alle afbeeldingen, afmetingen en objectnummer. Een klik op een maker, genre, materiaal, plaats of objectnaam in het detail toont alle werken met die waarde. Bij één gekozen maker staat er een makerblok boven de resultaten met levensjaren, beroep of rol en een link naar RKDartists.

Zusterdemo's in dezelfde huisstijl: de [Erfgoed SDO/Elastic demo](https://erfgoed-sdo-elastic-demo.jolietjakeblues64.workers.dev/) en de [Archeologie SDO/Elastic demo](https://elastic-archeologie.jolietjakeblues64.workers.dev/).

## Verschil met de andere demo's: wachtwoord en proxy

`rijkscollectie-rce` is een **interne** dataset. De Elasticsearch-service geeft zonder TriplyDB-token `Not found or unauthorized`. Daarom praat de browser hier niet rechtstreeks met de service, zoals in de andere demo's, maar via een proxy:

```text
browser ──inlogpagina + sessiecookie──▶ Cloudflare Worker (src/worker.js) ──Bearer TRIPLY_TOKEN──▶ rijkscollectie-rce-elastic/_search
```

De Worker:

- toont een eigen inlogpagina (`/login`) en zet na het inloggen een ondertekend sessiecookie (7 dagen geldig, `HttpOnly`, `SameSite=Lax`, online met het voorvoegsel `__Host-`). Zonder geldige sessie gaat elke pagina naar `/login` en geeft `/api/search` HTTP 401. Alleen `style.css` en `favicon.svg` zijn zonder inlog bereikbaar, voor de inlogpagina zelf;
- gebruikt geen HTTP Basic Auth. In de Rijkscollectieverkenner bleek de inlogpop-up van de browser op zakelijke laptops soms stilletjes onderdrukt te worden, waardoor bezoekers niet konden inloggen. Een gewoon formulier heeft dat probleem niet;
- vertraagt een foute inlogpoging met 1 seconde en accepteert alleen inlogformulieren van de eigen site;
- stuurt `POST /api/search` door naar de index en voegt daar het token toe. Het token komt nooit in de browser;
- laat alleen `_search` toe, alleen `POST`, met een JSON-body van maximaal 256 kB (een makerfilter kan tot 1.000 persoonsrecords bevatten) en `size` van maximaal 500;
- blijft dicht (HTTP 503) als een van de secrets ontbreekt;
- zet de beveiligingsheaders zelf (CSP, `noindex`, `Cache-Control: private, no-store`). Een `web/_headers`-bestand werkt hier niet: dat geldt niet voor antwoorden van een Worker die vóór de statische bestanden draait (`run_worker_first`).

| Secret | Inhoud |
|---|---|
| `AUTH_USER` | gebruikersnaam voor de demo |
| `AUTH_PASS` | wachtwoord voor de demo (lang en willekeurig, minstens 20 tekens) |
| `TRIPLY_TOKEN` | TriplyDB-token met leesrechten op `rce/rijkscollectie-rce` |

Iedereen die het wachtwoord heeft, kan via de Worker de hele index bevragen, niet alleen deze pagina gebruiken. Deel het wachtwoord alleen met mensen die de interne dataset mogen zien.

## Lokaal draaien

Er zijn twee manieren. Beide gebruiken dezelfde bestanden in `web/`.

**Snel, zonder wachtwoord** (Python, leest `TRIPLY_TOKEN` uit de omgeving of uit je Windows-gebruikersvariabelen):

```bash
python server.py
```

Open daarna <http://127.0.0.1:8765>. Er is dan geen inlog; `/login` en `/logout` gaan naar de zoekpagina. `server.py` stuurt dezelfde beveiligingsheaders als de Worker (gelezen uit `src/worker.js`), zodat CSP-fouten ook lokaal zichtbaar zijn.

**Precies zoals online** (de Worker zelf, met de inlogpagina):

```bash
cp .dev.vars.example .dev.vars
```

Vul in `.dev.vars` de drie waarden in (`.dev.vars` staat in `.gitignore`) en start:

```bash
npx wrangler dev
```

Open <http://127.0.0.1:8787>. Je komt eerst op de inlogpagina.

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

4. Controleer op <https://rijkscollectie-elastic-demo.jolietjakeblues64.workers.dev/>: zonder inloggen kom je op de inlogpagina, na het inloggen op de zoekpagina. Krijg je HTTP 503, dan ontbreekt nog een secret.

Daarna is `npx wrangler deploy` genoeg voor nieuwe versies; de secrets blijven staan.

**Wachtwoord wijzigen of iemand de toegang ontnemen:** zet een nieuw `AUTH_PASS` met `npx wrangler secret put AUTH_PASS` en deel dat alleen met wie nog toegang mag hebben. Dat maakt meteen alle bestaande sessies ongeldig, want de sessiesleutel is afgeleid van `AUTH_USER` en `AUTH_PASS`. Er is één gedeeld wachtwoord; per persoon toegang beheren kan met [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/).

**Uitloggen:** via de link **Uitloggen** rechts in de gele balk (`/logout`). Dat wist het sessiecookie in die browser. Een sessie loopt na 7 dagen vanzelf af.

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
| `src/worker.js` | Cloudflare Worker: inlogpagina en sessiecookie, proxy naar de index, beveiligingsheaders |
| `wrangler.jsonc` | Worker-configuratie (`run_worker_first`, ASSETS-binding, verplichte secrets) |
| `server.py` | lokale proxy zonder wachtwoord, voor snel ontwikkelen |
| `consistentietest.py` | vergelijking Elasticsearch ↔ SPARQL |
| `.dev.vars.example` | voorbeeld voor de lokale secrets van `wrangler dev` |

## Index: goed om te weten

- In veldnamen staat een spatie in plaats van een punt: `https://schema org/name`. Voor facetten en filters gebruik je het subveld `.keyword`.
- Elk RDF-subject is een eigen document. Een kunstwerk verwijst naar materialen, genres, makers, afmetingen en afbeeldingen via IRI's. De labels daarvan haalt de pagina in een tweede request op met een `ids`-query.
- Afbeeldingen: `schema:associatedMedia` → `MediaObject` met `thumbnailUrl` (200×200) en `contentUrl`, allemaal op `images.memorix.nl` (daarom staat alleen dat domein in de CSP).
- `index.max_result_window` is 10.000: verder bladeren dan de eerste 10.000 resultaten kan niet.
- Scripts zijn uitgeschakeld (`cannot execute scripts using [aggs] context`): jaartallen uit tekst halen of rekenen tijdens het zoeken kan niet.

### Makers

Een werk verwijst met `schema:creator` naar een `Person`. Dezelfde kunstenaar heeft vaak meerdere persoonsrecords: 17.537 personen, maar 9.971 verschillende namen. De demo voegt ze zo samen:

- **Precies één link naar RKDartists** (`schema:sameAs`, 6.097 personen): samenvoegen op dat RKD-nummer. In de URL: `maker=rkd:https://rkd.nl/artists/31221`.
- **Anders**: samenvoegen op de naam (naamgenoten vallen dan samen). In de URL: `maker=naam:onbekend`.
- De personen "Onbekend" en "onbekend" hebben elk tientallen RKD-links (tot 85), die bij verschillende kunstenaars horen. Daarom gaan personen met meer dan één RKD-link **niet** op RKD samen; anders zouden bijna 37.000 werken van een onbekende maker bij bekende kunstenaars terechtkomen.

Het makerfilter zoekt eerst alle persoonsrecords van de gekozen maker op (maximaal 1.000) en filtert dan met `terms` op `creator.keyword`. Die lijst kan lang worden, dus hij staat één keer in de `query`, niet in `post_filter` en in elk facet. Het makerfacet telt via een `global`-aggregatie met dezelfde zoekvraag en de overige filters, zodat je meerdere makers tegelijk kunt kiezen. Het zoekveld in het makerfacet zoekt personen met `match_phrase_prefix` op de naam (achternaam eerst, bijv. *Gestel*) en telt hun werken bij de huidige zoekvraag.

Facetaantallen per maker zijn opgeteld over de samengevoegde records. Een werk met twee records van dezelfde maker telt daardoor dubbel; dat komt zelden voor.

### Periode

`schema:temporal` is tekst: `1923` (116.741 werken), `1975-05-11` (3.606), `1923-02` (508) en 102 kortere jaartallen zoals `550` of `-901`. 12.039 werken hebben geen datering. De zes periodes en het van/tot-filter gebruiken `range` op `temporal.keyword`: tekst sorteert hier net als het jaartal, zolang dat vier cijfers heeft. Kortere jaartallen vallen via een `regexp` onder "vóór 1800". Van/tot accepteert jaartallen van 1000 tot 2099.

### Plaats

`schema:locationCreated` (37.069 werken) verwijst naar een `Place` met alleen een naam. Maar 37 van de 2.512 plaatsen hebben een GeoNames-link, dus een kaart is nog niet zinvol.
