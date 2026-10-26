# Consistentietest rce/rijkscollectie-rce / rijkscollectie-rce-elastic

Uitgevoerd: 2026-10-15T17:08:41 · steekproef 100 · seed 42

| Check | Resultaat |
|---|---|
| totalen | OK |
| velddekking | OK |
| es_naar_sparql | OK |
| sparql_naar_es | OK |
| facetten | OK |

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

## Velddekking

| Predicaat | SPARQL | Elastic | Verschil |
|---|---:|---:|---:|
| http://www.w3.org/1999/02/22-rdf-syntax-ns#type | 603,467 | 603,467 | +0 |
| https://schema.org/value | 404,633 | 404,633 | +0 |
| https://schema.org/valueReference | 271,864 | 271,864 | +0 |
| https://schema.org/unitText | 271,717 | 271,717 | +0 |
| https://schema.org/description | 260,454 | 260,454 | +0 |
| https://schema.org/name | 153,347 | 153,347 | +0 |
| https://schema.org/creator | 133,000 | 133,000 | +0 |
| https://schema.org/isPartOf | 133,000 | 133,000 | +0 |
| https://schema.org/identifier | 132,989 | 132,989 | +0 |
| https://schema.org/url | 132,989 | 132,989 | +0 |
| https://schema.org/propertyID | 132,989 | 132,989 | +0 |
| https://schema.org/sdPublisher | 132,318 | 132,318 | +0 |
| https://schema.org/genre | 130,264 | 130,264 | +0 |
| https://schema.org/license | 129,886 | 129,886 | +0 |
| https://schema.org/material | 129,471 | 129,471 | +0 |
| https://schema.org/alternateName | 128,805 | 128,805 | +0 |
| https://schema.org/temporal | 120,961 | 120,961 | +0 |
| https://schema.org/additionalType | 119,887 | 119,887 | +0 |
| https://schema.org/size | 118,398 | 118,398 | +0 |
| https://schema.org/contentUrl | 42,753 | 42,753 | +0 |
| https://schema.org/encodesCreativeWork | 42,753 | 42,753 | +0 |
| https://schema.org/thumbnailUrl | 42,753 | 42,753 | +0 |
| https://schema.org/locationCreated | 37,069 | 37,069 | +0 |
| https://schema.org/associatedMedia | 30,881 | 30,881 | +0 |
| https://schema.org/hasOccupation | 8,258 | 8,258 | +0 |
| https://schema.org/birthDate | 8,076 | 8,076 | +0 |
| https://schema.org/birthPlace | 7,585 | 7,585 | +0 |
| https://schema.org/sameAs | 6,746 | 6,746 | +0 |
| https://schema.org/copyrightHolder | 6,318 | 6,318 | +0 |
| https://schema.org/deathDate | 4,487 | 4,487 | +0 |

## es_naar_sparql

```json
{
 "gecontroleerd": 100,
 "identiek": 100,
 "problemen": []
}
```

## sparql_naar_es

```json
{
 "gecontroleerd": 100,
 "gevonden": 100,
 "ontbrekend": []
}
```

## Facet http://www.w3.org/1999/02/22-rdf-syntax-ns#type

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| https://schema.org/QuantitativeValue | 271864 | 271864 |
| https://schema.org/CreativeWork | 133000 | 133000 |
| https://schema.org/PropertyValue | 132989 | 132989 |
| https://schema.org/MediaObject | 42753 | 42753 |
| https://schema.org/Person | 17537 | 17537 |
| https://schema.org/DefinedTerm | 5324 | 5324 |
| https://schema.org/Place | 2512 | 2512 |
| https://schema.org/Product | 1687 | 1687 |
| https://schema.org/Occupation | 68 | 68 |

## Facet https://schema.org/additionalType

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/0c04bb91-3f1e-3673-a816-f8be8900efc9 | 62773 | 62773 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/1070f453-16a8-3308-9f30-661aae6e6094 | 18677 | 18677 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/ca28fc39-0752-3ee8-a746-4715b566e897 | 16511 | 16511 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/635df502-5639-3c5f-8717-fa473573b9ce | 13256 | 13256 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/38b0a576-e749-30d4-8b49-ab66072cd5c1 | 12863 | 12863 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/8dfbeb42-5e2a-307e-9cde-72654f8ea0cc | 7249 | 7249 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/ac371720-d8e4-342a-83b9-1902973bdda3 | 5568 | 5568 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/9ff9f4a9-c64a-351b-96a9-3a591006bbf6 | 5426 | 5426 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/1e55adbd-3a80-3f54-9070-77ad1d48b9d9 | 3224 | 3224 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/f47d2668-2a55-38da-81dd-15bfbeadee6b | 3144 | 3144 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/892daa2c-4868-33a9-ac48-d13bb6fb81d0 | 3102 | 3102 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/e790120e-fefd-3241-93c8-5382ca8e439c | 2471 | 2471 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/bccca8ed-55a5-3bab-8207-856ce67dd56c | 2303 | 2303 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/8543d0fb-fa04-3783-ad38-d32590e74a25 | 2230 | 2230 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/67e3ea96-b9dc-3b25-aaca-85a7c3369355 | 2111 | 2111 |

## Facet https://schema.org/genre

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/1e4770f8-cc21-34ee-8965-b1a6a00efa96 | 58808 | 58808 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/426290cf-d008-30a2-8de2-913640939e12 | 44383 | 44383 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/628fd943-c60e-3986-ab11-4fbe437ac35a | 18219 | 18219 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/66ff153f-25c8-3f1b-a228-d6790b700ca2 | 7855 | 7855 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/635df502-5639-3c5f-8717-fa473573b9ce | 534 | 534 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/d9871f46-d9f4-3b48-a859-ea1148a567ae | 215 | 215 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/be2a5666-3969-3afb-94fd-15e8a52fbff8 | 139 | 139 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/348ff0d1-48c5-30ea-b45a-845fb13d38e8 | 91 | 91 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/9ff9f4a9-c64a-351b-96a9-3a591006bbf6 | 32 | 32 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/0c99debc-56f6-36f1-a94e-46304b511071 | 22 | 22 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/069acabc-6a59-33f5-a036-43ee4b6d0610 | 5 | 5 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/2982d723-3131-323d-b0bc-b8b9ac9d2598 | 4 | 4 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/23accaff-f9cd-39fc-9cc5-ad7fdb7d0a3d | 4 | 4 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/7b2a4e44-c4e3-3928-a252-e4193643a423 | 3 | 3 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/d9303016-03ae-3b1b-b9b2-e5adbb7c8f86 | 3 | 3 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/definedterm/7fcbc106-29df-3593-9012-123ed0f7825d | 3 | 3 |

## Facet https://schema.org/material

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/bc1f81fc-f237-328f-81f9-934dfd03c198 | 63325 | 63325 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/404f5908-602d-348d-b20b-de555eea83a3 | 23514 | 23514 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/7cd4f9dd-746a-38d9-a4e1-3a36d528fe4c | 12184 | 12184 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/04ccdd0f-42ab-397b-97cc-70d770a4e757 | 10444 | 10444 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/957aae59-3df0-3528-a873-851f8e098512 | 9330 | 9330 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/ccfc226b-9cc1-35b1-881b-2c7b8efb3fa7 | 9177 | 9177 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/3ce11a17-56c4-3051-b77c-7addb60631b6 | 8492 | 8492 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/a67966ae-bdab-3fa6-ba50-5236ab0edeed | 6067 | 6067 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/7890d4af-c592-3a85-a96c-62b170760729 | 5405 | 5405 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/5c5e62eb-28a1-3e84-af15-692ec1f9d569 | 5398 | 5398 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/01970186-d778-3ae1-9781-413270c94321 | 4690 | 4690 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/89c39b3a-32ab-3515-886f-34e087990f52 | 4299 | 4299 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/74ce19ed-3041-3ed9-99e5-c4bbb8aecdbf | 3412 | 3412 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/ccec524f-f715-317e-91fb-831010a2b91f | 3029 | 3029 |
| https://linkeddata.cultureelerfgoed.nl/rce/rijkscollectie-rce/id/product/402a06b0-f708-31e7-ad12-3508d12b8d14 | 2826 | 2826 |

## Facet https://schema.org/isPartOf

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| https://linkeddata.cultureelerfgoed.nl/rce/datacatalog/id/dataset/18c334d5-7fe9-3eb1-b389-99711495c1ce | 133000 | 133000 |

## Facet https://schema.org/alternateName

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| schilderij | 12404 | 12404 |
| grafische kunst | 8170 | 8170 |
| affiche | 6249 | 6249 |
| bromide | 5098 | 5098 |
| pentekening | 4887 | 4887 |
| tekening | 3771 | 3771 |
| sculptuur | 3742 | 3742 |
| potloodtekening | 3209 | 3209 |
| krijttekening | 2972 | 2972 |
| ets | 2621 | 2621 |
| ontwerptekening | 2386 | 2386 |
| spotprent | 2383 | 2383 |
| vaas | 2232 | 2232 |
| gouache | 2057 | 2057 |
| stoel | 2052 | 2052 |

## Facet https://schema.org/sdPublisher

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| Rijksdienst voor het Cultureel Erfgoed | 130475 | 130475 |
| --- | 1169 | 1169 |
| Rijksmuseum | 665 | 665 |
| Nederlands Openluchtmuseum | 4 | 4 |
| Gevangenpoort | 3 | 3 |
| Het Koninklijk Penningkabinet | 1 | 1 |
| Van Gogh Museum | 1 | 1 |

## Facet https://schema.org/temporal

| Waarde | SPARQL | Elastic |
|---|---:|---:|
| 1940 | 9452 | 9452 |
| 1899 | 3898 | 3898 |
| 1980 | 2904 | 2904 |
| 1975 | 2699 | 2699 |
| 1981 | 2632 | 2632 |
| 1982 | 2591 | 2591 |
| 1977 | 2371 | 2371 |
| 1979 | 2325 | 2325 |
| 1976 | 2238 | 2238 |
| 1999 | 2196 | 2196 |
| 1978 | 2131 | 2131 |
| 1950 | 2037 | 2037 |
| 1974 | 1963 | 1963 |
| 1973 | 1826 | 1826 |
| 1972 | 1759 | 1759 |

Aanroepen: {'es': 44, 'sparql': 117} · tijd (s): {'es': 4.4, 'sparql': 13.1}
