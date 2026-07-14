# Bible full-text search indexer comparison

Built by `scripts/build_search_indexes.mjs`. Indexes store only a sequential integer doc id per verse (no `bible/abbr/ch/v` strings, no verse text). The id→address mapping lives in a shared packed binary table `{bible}.addr.bin` = **3 bytes per verse** `[bookIdx, chapter, verse]` (bible implicit). "Index gz" is the index alone; total payload = index gz + addr gz. **Binary inverted** (`binverted`) replaces JSON with a packed ArrayBuffer (sorted vocab + varint-delta postings) that loads as typed-array views — no `JSON.parse` — and its sorted vocabulary answers prefix queries via binary search, so no trie is needed.

| Bible | Indexer | Verses | Build | Index raw | Index gz | +addr gz | Total gz | Query median |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| ampc | FlexSearch | 26310 | 493ms | 4049KB | 1616KB | 52KB | 1669KB | 0.007ms |
| ampc | Custom inverted (json) | 26310 | 183ms | 4305KB | 1456KB | 52KB | 1508KB | 0.002ms |
| ampc | Binary inverted | 26310 | 231ms | 1096KB | 670KB | 52KB | 722KB | 0.073ms |
| bot | FlexSearch | 35577 | 871ms | 5495KB | 1934KB | 70KB | 2004KB | 0.008ms |
| bot | Custom inverted (json) | 35577 | 272ms | 4157KB | 1651KB | 70KB | 1721KB | 0.002ms |
| bot | Binary inverted | 35577 | 381ms | 1614KB | 979KB | 70KB | 1049KB | 0.091ms |
| csp | FlexSearch | 31169 | 750ms | 4635KB | 1649KB | 62KB | 1710KB | 0.005ms |
| csp | Custom inverted (json) | 31169 | 227ms | 3590KB | 1415KB | 62KB | 1477KB | 0.001ms |
| csp | Binary inverted | 31169 | 313ms | 1332KB | 819KB | 62KB | 880KB | 0.032ms |
| kjv | FlexSearch | 30953 | 532ms | 4044KB | 1659KB | 61KB | 1720KB | 0.008ms |
| kjv | Custom inverted (json) | 30953 | 184ms | 4463KB | 1508KB | 61KB | 1569KB | 0.001ms |
| kjv | Binary inverted | 30953 | 232ms | 1054KB | 650KB | 61KB | 711KB | 0.068ms |
| roh | FlexSearch | 31172 | 809ms | 4868KB | 1728KB | 62KB | 1789KB | 0.009ms |
| roh | Custom inverted (json) | 31172 | 235ms | 3903KB | 1491KB | 62KB | 1553KB | 0.001ms |
| roh | Binary inverted | 31172 | 300ms | 1411KB | 855KB | 62KB | 916KB | 0.033ms |
| seb | FlexSearch | 35675 | 857ms | 5448KB | 1921KB | 71KB | 1991KB | 0.008ms |
| seb | Custom inverted (json) | 35675 | 255ms | 4120KB | 1635KB | 71KB | 1705KB | 0.001ms |
| seb | Binary inverted | 35675 | 340ms | 1594KB | 966KB | 71KB | 1037KB | 0.045ms |
| sep | FlexSearch | 31165 | 733ms | 4790KB | 1667KB | 62KB | 1728KB | 0.007ms |
| sep | Custom inverted (json) | 31165 | 222ms | 3589KB | 1417KB | 62KB | 1479KB | 0.001ms |
| sep | Binary inverted | 31165 | 290ms | 1407KB | 845KB | 62KB | 907KB | 0.042ms |
| ssv | FlexSearch | 35822 | 890ms | 5553KB | 1942KB | 71KB | 2013KB | 0.007ms |
| ssv | Custom inverted (json) | 35822 | 258ms | 4194KB | 1654KB | 71KB | 1725KB | 0.001ms |
| ssv | Binary inverted | 35822 | 339ms | 1627KB | 977KB | 71KB | 1048KB | 0.084ms |

_Queries_: boh, láska, svetlo, spasenie, Duch, viera, kraj / God, love, light, salvation, faith, blood. Median over 5 runs × 13 queries.
