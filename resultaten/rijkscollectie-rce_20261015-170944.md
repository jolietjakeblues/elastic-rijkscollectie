# Consistentietest rce/rijkscollectie-rce / rijkscollectie-rce-elastic

Uitgevoerd: 2026-10-15T17:09:44 · steekproef 300 · seed 7

| Check | Resultaat |
|---|---|
| totalen | OK |
| es_naar_sparql | OK |
| sparql_naar_es | OK |

## Totalen

- Elastic-docs: 603,467
- SPARQL-subjecten (geen blank nodes): 603,467
- Verschil: +0
- Elastic-docs zonder rdf:type: 0

| rdf:type | SPARQL | Elastic |
|---|---:|---:|
| https://schema.org/QuantitativeValue | 271,864 | 271,864 |
| https://schema.org/CreativeWork | 133,000 | 133,000 |
| https://schema.org/PropertyValue | 132,989 | 132,989 |
| https://schema.org/MediaObject | 42,753 | 42,753 |
| https://schema.org/Person | 17,537 | 17,537 |
| https://schema.org/DefinedTerm | 5,324 | 5,324 |
| https://schema.org/Place | 2,512 | 2,512 |
| https://schema.org/Product | 1,687 | 1,687 |
| https://schema.org/Occupation | 68 | 68 |

## es_naar_sparql

```json
{
 "gecontroleerd": 300,
 "identiek": 300,
 "problemen": []
}
```

## sparql_naar_es

```json
{
 "gecontroleerd": 300,
 "gevonden": 300,
 "ontbrekend": []
}
```

Aanroepen: {'es': 5, 'sparql': 307} · tijd (s): {'es': 0.8, 'sparql': 57.6}
