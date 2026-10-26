"""Consistentietest: vergelijkt een TriplyDB Elasticsearch-service met de SPARQL-endpoint van dezelfde dataset.

Gebruik:
    python consistentietest.py                                   # rijkscollectie-rce (token nodig)
    python consistentietest.py --dataset rce/Rijksmonumenten-sdo --service Rijksmonumenten-sdo-elas

Token: omgevingsvariabele TRIPLY_TOKEN, of (Windows) de gebruikersvariabele TRIPLY_TOKEN uit het register.
Het token wordt nooit geprint of weggeschreven.

Checks:
  1. totalen      - aantal documenten in Elastic vs. aantal subjecten in SPARQL (totaal en per rdf:type)
  2. velddekking  - per predicaat: #subjecten met dat predicaat (SPARQL) vs. #docs met dat veld (Elastic)
  3. es->sparql   - willekeurige Elastic-docs: bestaan ze in SPARQL en kloppen alle waarden?
  4. sparql->es   - willekeurige SPARQL-subjecten: staan ze in de index?
  5. facetten     - top-N termen per facetveld: aantallen Elastic vs. SPARQL
"""
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

API = "https://api.linkeddata.cultureelerfgoed.nl/datasets"
RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"


def get_token():
    tok = os.environ.get("TRIPLY_TOKEN")
    if not tok and sys.platform == "win32":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                tok = winreg.QueryValueEx(k, "TRIPLY_TOKEN")[0]
        except OSError:
            tok = None
    return tok or None


def es_key(predicate):
    """TriplyDB vervangt punten in veldnamen door spaties."""
    return predicate.replace(".", " ")


class Client:
    def __init__(self, dataset, service, token):
        self.es_url = f"{API}/{dataset}/services/{service}/_search"
        self.sparql_url = f"{API}/{dataset}/sparql"
        self.token = token
        self.calls = Counter()
        self.seconds = Counter()

    def _post(self, kind, url, data, headers):
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        t0 = time.perf_counter()
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    body = json.load(r)
                break
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")[:500]
                if e.code in (502, 503, 504) and attempt < 2:
                    time.sleep(2 * (attempt + 1))
                    continue
                raise RuntimeError(f"{kind} HTTP {e.code}: {msg}") from None
        self.calls[kind] += 1
        self.seconds[kind] += time.perf_counter() - t0
        return body

    def es(self, body):
        return self._post("es", self.es_url, json.dumps(body).encode(), {"Content-Type": "application/json"})

    def sparql(self, query):
        data = urllib.parse.urlencode({"query": query}).encode()
        res = self._post("sparql", self.sparql_url, data, {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/sparql-results+json",
        })
        return [{k: v["value"] for k, v in b.items()} for b in res["results"]["bindings"]]

    def es_count(self, query=None):
        body = {"size": 0, "track_total_hits": True}
        if query:
            body["query"] = query
        return self.es(body)["hits"]["total"]["value"]


def check_totals(c):
    es_total = c.es_count()
    sp_total = int(c.sparql("SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s ?p ?o FILTER(!isBlank(?s)) }")[0]["n"])
    es_no_type = c.es_count({"bool": {"must_not": {"exists": {"field": es_key(RDF_TYPE)}}}})

    sp_types = {r["t"]: int(r["n"]) for r in c.sparql(
        "SELECT ?t (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s a ?t FILTER(!isBlank(?s)) } GROUP BY ?t")}
    aggs = c.es({"size": 0, "aggs": {"t": {"terms": {"field": es_key(RDF_TYPE) + ".keyword", "size": 1000}}}})
    es_types = {b["key"]: b["doc_count"] for b in aggs["aggregations"]["t"]["buckets"]}
    types = [
        {"type": t, "sparql": sp_types.get(t, 0), "elastic": es_types.get(t, 0)}
        for t in sorted(set(sp_types) | set(es_types), key=lambda t: -max(sp_types.get(t, 0), es_types.get(t, 0)))
    ]
    return {
        "elastic_docs": es_total,
        "sparql_subjecten": sp_total,
        "verschil": es_total - sp_total,
        "elastic_docs_zonder_type": es_no_type,
        "per_type": types,
        "ok": es_total == sp_total and all(t["sparql"] == t["elastic"] for t in types),
    }


def check_field_coverage(c):
    sp = {r["p"]: int(r["n"]) for r in c.sparql(
        "SELECT ?p (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s ?p ?o FILTER(!isBlank(?s)) } GROUP BY ?p")}
    rows = []
    for p in sorted(sp, key=lambda p: -sp[p]):
        n_es = c.es_count({"exists": {"field": es_key(p)}})
        rows.append({"predicaat": p, "sparql": sp[p], "elastic": n_es, "verschil": n_es - sp[p]})
    return {"velden": rows, "ok": all(r["verschil"] == 0 for r in rows)}


def sparql_values(c, iri):
    vals = defaultdict(set)
    for r in c.sparql(f"SELECT ?p ?o WHERE {{ <{iri}> ?p ?o }}"):
        vals[es_key(r["p"])].add(r["o"])
    return vals


def es_values(src):
    vals = defaultdict(set)
    for k, v in src.items():
        if k.startswith("@"):
            continue
        for x in v if isinstance(v, list) else [v]:
            vals[k].add(x if isinstance(x, str) else json.dumps(x))
    return vals


def check_es_to_sparql(c, n, seed):
    hits = c.es({"size": n, "query": {"function_score": {"random_score": {"seed": seed, "field": "_seq_no"}}}})["hits"]["hits"]
    problems, ok = [], 0
    for h in hits:
        iri = h["_source"].get("@id", h["_id"])
        ev, sv = es_values(h["_source"]), sparql_values(c, iri)
        if not sv:
            problems.append({"id": iri, "probleem": "niet gevonden in SPARQL"})
            continue
        diffs = []
        for k in sorted(set(ev) | set(sv)):
            only_es, only_sp = ev[k] - sv[k], sv[k] - ev[k]
            if only_es or only_sp:
                diffs.append({"veld": k, "alleen_elastic": sorted(only_es)[:5], "alleen_sparql": sorted(only_sp)[:5]})
        if diffs:
            problems.append({"id": iri, "probleem": "waarden wijken af", "verschillen": diffs})
        else:
            ok += 1
    return {"gecontroleerd": len(hits), "identiek": ok, "problemen": problems, "ok": not problems}


def check_sparql_to_es(c, n, total, rng):
    ids, blocks = [], 5
    per_block = max(1, n // blocks)
    for _ in range(blocks):
        off = rng.randrange(max(1, total - per_block))
        ids += [r["s"] for r in c.sparql(
            f"SELECT DISTINCT ?s WHERE {{ ?s ?p ?o FILTER(!isBlank(?s)) }} OFFSET {off} LIMIT {per_block}")]
    ids = list(dict.fromkeys(ids))
    found = {h["_id"] for h in c.es({"size": len(ids), "_source": False, "query": {"ids": {"values": ids}}})["hits"]["hits"]}
    missing = [i for i in ids if i not in found]
    return {"gecontroleerd": len(ids), "gevonden": len(ids) - len(missing), "ontbrekend": missing, "ok": not missing}


def check_facets(c, predicates, top):
    out = []
    for p in predicates:
        aggs = c.es({"size": 0, "aggs": {"f": {"terms": {"field": es_key(p) + ".keyword", "size": top}}}})
        es_buckets = {b["key"]: b["doc_count"] for b in aggs["aggregations"]["f"]["buckets"]}
        sp = {r["o"]: int(r["n"]) for r in c.sparql(
            f"SELECT ?o (COUNT(DISTINCT ?s) AS ?n) WHERE {{ ?s <{p}> ?o FILTER(!isBlank(?s)) }} "
            f"GROUP BY ?o ORDER BY DESC(?n) LIMIT {top}")}
        # Bij gelijke aantallen op de grens van de top-N kiezen beide kanten soms een andere term:
        # tel termen die aan één kant ontbreken exact na.
        for v in set(es_buckets) - set(sp):
            lit = f"<{v}>" if v.startswith(("http://", "https://")) else json.dumps(v)
            sp[v] = int(c.sparql(f"SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE {{ ?s <{p}> {lit} FILTER(!isBlank(?s)) }}")[0]["n"])
        for v in set(sp) - set(es_buckets):
            es_buckets[v] = c.es_count({"term": {es_key(p) + ".keyword": v}})
        rows = [{"waarde": v, "sparql": sp[v], "elastic": es_buckets[v]}
                for v in sorted(sp, key=lambda v: -sp[v])]
        out.append({"predicaat": p, "termen": rows, "ok": all(r["sparql"] == r["elastic"] for r in rows)})
    return {"facetten": out, "ok": all(f["ok"] for f in out)}


def to_markdown(meta, res):
    L = [f"# Consistentietest {meta['dataset']} / {meta['service']}", "",
         f"Uitgevoerd: {meta['tijd']} · steekproef {meta['steekproef']} · seed {meta['seed']}", "",
         "| Check | Resultaat |", "|---|---|"]
    for name, r in res.items():
        L.append(f"| {name} | {'OK' if r.get('ok') else 'AFWIJKING' if 'ok' in r else 'FOUT: ' + r.get('fout', '')} |")
    t = res.get("totalen", {})
    if "elastic_docs" in t:
        L += ["", "## Totalen", "",
              f"- Elastic-docs: {t['elastic_docs']:,}", f"- SPARQL-subjecten (geen blank nodes): {t['sparql_subjecten']:,}",
              f"- Verschil: {t['verschil']:+,}", f"- Elastic-docs zonder rdf:type: {t['elastic_docs_zonder_type']:,}", "",
              "| rdf:type | SPARQL | Elastic |", "|---|---:|---:|"]
        L += [f"| {x['type']} | {x['sparql']:,} | {x['elastic']:,} |" for x in t["per_type"]]
    v = res.get("velddekking", {})
    if "velden" in v:
        L += ["", "## Velddekking", "", "| Predicaat | SPARQL | Elastic | Verschil |", "|---|---:|---:|---:|"]
        L += [f"| {x['predicaat']} | {x['sparql']:,} | {x['elastic']:,} | {x['verschil']:+,} |" for x in v["velden"]]
    for name in ("es_naar_sparql", "sparql_naar_es"):
        r = res.get(name, {})
        if "gecontroleerd" in r:
            L += ["", f"## {name}", "", "```json", json.dumps({k: v for k, v in r.items() if k != "ok"}, ensure_ascii=False, indent=1)[:4000], "```"]
    for f in res.get("facetten", {}).get("facetten", []):
        L += ["", f"## Facet {f['predicaat']}", "", "| Waarde | SPARQL | Elastic |", "|---|---:|---:|"]
        L += [f"| {x['waarde']} | {x['sparql']} | {x['elastic']} |" for x in f["termen"]]
    L += ["", f"Aanroepen: {dict(meta['aanroepen'])} · tijd (s): {meta['seconden']}"]
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="rce/rijkscollectie-rce")
    ap.add_argument("--service", default="rijkscollectie-rce-elastic")
    ap.add_argument("--sample", type=int, default=50)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--facet", action="append", default=[], help="predicaat-IRI voor facetvergelijking (herhaalbaar)")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--skip", action="append", default=[], help="check overslaan: totalen, velddekking, es_naar_sparql, sparql_naar_es, facetten")
    ap.add_argument("--out", default="resultaten")
    a = ap.parse_args()

    seed = a.seed if a.seed is not None else random.randrange(1_000_000)
    rng = random.Random(seed)
    token = get_token()
    c = Client(a.dataset, a.service, token)
    print(f"{a.dataset} / {a.service} · token: {'ja' if token else 'nee'} · seed {seed}")

    checks = {
        "totalen": lambda: check_totals(c),
        "velddekking": lambda: check_field_coverage(c),
        "es_naar_sparql": lambda: check_es_to_sparql(c, a.sample, seed),
        "sparql_naar_es": lambda: check_sparql_to_es(c, a.sample, res["totalen"].get("sparql_subjecten") or c.es_count(), rng),
        "facetten": lambda: check_facets(c, [RDF_TYPE] + a.facet, a.top),
    }
    res = {}
    for name, fn in checks.items():
        if name in a.skip:
            continue
        t0 = time.perf_counter()
        print(f"- {name} ...", end=" ", flush=True)
        try:
            res[name] = fn()
            print(("OK" if res[name]["ok"] else "AFWIJKING"), f"({time.perf_counter() - t0:.1f}s)")
        except Exception as e:  # één falende check mag de rest niet tegenhouden
            res[name] = {"fout": str(e)}
            print("FOUT:", e)

    meta = {"dataset": a.dataset, "service": a.service, "tijd": datetime.now().isoformat(timespec="seconds"),
            "steekproef": a.sample, "seed": seed, "aanroepen": dict(c.calls),
            "seconden": {k: round(v, 1) for k, v in c.seconds.items()}}
    out = Path(a.out)
    out.mkdir(exist_ok=True)
    stem = f"{a.dataset.split('/')[-1]}_{datetime.now():%Y%m%d-%H%M%S}"
    (out / f"{stem}.json").write_text(json.dumps({"meta": meta, "resultaten": res}, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / f"{stem}.md").write_text(to_markdown(meta, res), encoding="utf-8")
    print(f"Rapport: {out / stem}.md")
    sys.exit(0 if all(r.get("ok") for r in res.values()) else 1)


if __name__ == "__main__":
    main()
