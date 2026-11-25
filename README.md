# circuit-maps-3d

Racing circuits as surveyed GeoJSON: OpenStreetMap's map data in, one geometry per circuit out — the lap's centreline with how far round the lap every point stands and, where a source covers the circuit, the ground's height at each point, plus the pit lane.
Each circuit's inputs — the spec the geometry was laid from, and the evidence it was surveyed from — are kept in the repository, so every published byte can be reproduced.

| Word | Circuit | Heights |
| --- | --- | --- |
| `barcelona` | Circuit de Barcelona-Catalunya | ICGC MET-2 |
| `cota` | Circuit of the Americas | USGS 3DEP |
| `fuji` | Fuji Speedway | GSI |
| `imola` | Autodromo Internazionale Enzo e Dino Ferrari | Emilia-Romagna DTM |
| `le_mans` | Circuit de la Sarthe | IGN LiDAR HD |
| `monza` | Autodromo Nazionale di Monza | Lombardia DTM 5x5 |
| `sao_paulo` | Autódromo José Carlos Pace | PMSP LiDAR 2017 |
| `spa` | Circuit de Spa-Francorchamps | SPW MNT |

## Layout

| Path | What it is |
| --- | --- |
| `geometry/<word>.geojson` | **The output.** The published geometry, what a consumer loads; written by `--write`. |
| `circuits/<word>/` | **The inputs.** Everything the survey reads for one circuit: |
| `circuits/<word>/spec.json` | the circuit's spec — lap length, timing lines, sectors, corners — read by hand off the series' circuit map; the survey stretches the lap to them; |
| `circuits/<word>/overpass.json` | the Overpass answer the geometry was written from, kept by `--fetch`; |
| `circuits/<word>/elevation.json` | the heights its places were sampled at, kept by `elevation --fetch`. |
| `src/`, `test/` | The pipeline, a Flix project (`flix.toml`). |
| `docs/adding-a-circuit.md` | The steps of adding a circuit, or taking a newer map for one. |

## Using the data

Consumers need only the files under `geometry/` (and, if they lay timing lines, each circuit's `spec.json`). Pin a tag or commit and copy them in by whichever route suits:

- **Nix flake** — `inputs.circuit-maps-3d.url = "github:y047aka/circuit-maps-3d";` and `circuit-maps-3d.packages.${system}.default` is a store path holding `geometry/<word>.geojson` and the specs laid out flat as `circuit-maps/<word>.json`.
- **HTTP** — the raw files at a pinned ref, e.g. `https://raw.githubusercontent.com/y047aka/circuit-maps-3d/<ref>/geometry/le_mans.geojson`.

### The GeoJSON profile

One `FeatureCollection` in EPSG:4326, holding:

- one `outline` `LineString`: the lap, closed, starting at the line the circuit times from and running in the race's direction. Its properties:
  - `circuit`, `basis`, `source` (the OpenStreetMap relation), `license` (`ODbL`), `surveyed_at`, `direction`;
  - `lap_length_m` — the published lap; `surveyed_length_m` — what OpenStreetMap's line measured before it was stretched to it;
  - `metres` — point for point, how far round the lap each stands, in the published metres;
  - `sectors` — the stretches the map's intermediate lines imply, and the map they came from, where the map gives them;
  - `frame` — the origin and parallel every point is projected through to metres; a consumer projecting the degrees itself uses this frame rather than choosing its own (`src/Geodesy.flix`, on a sphere of 6,371,008.8 m);
  - where the circuit has heights, `elevation` — their source, licence and datum — and `elevation_m`, point for point, the height of each.
- one `pit_lane` `LineString`, with no metres, and `elevation_m` where the outline carries heights.

`src/Geometry/Write.flix` is the writer and `src/Geometry.flix` the reader that refuses what the profile forbids: metres not ascending to the published lap, sectors not adding up to it, a height per point where a file carries any.

## Licence

The code is under the Apache License 2.0 (`LICENSE`).
OpenStreetMap data is © OpenStreetMap contributors, under the ODbL; every geometry and every kept answer here is a derivative of it, and the written files carry the source relation and the licence in their own properties.
Each height source's licence is written into the `elevation` property of the geometry it was sampled for.

## Commands

All commands run through the Nix flake, from anywhere in the checkout; paths resolve from where the command is run.

| Command | Purpose |
| --- | --- |
| `nix run .#geometry -- survey <word> [--answer <file>] [--fetch] [--write]` | Survey a circuit from its kept answer and compare against the published bytes; `--fetch` asks OpenStreetMap now, `--write` lays the geometry |
| `nix run .#geometry -- regenerate [<word> ...] [--write \| --freeze]` | The property fence over every kept answer |
| `nix run .#geometry -- diff <a.geojson> <b.geojson> [--every <m>] [--svg <out.svg>]` | Two geometries laid against each other in metres |
| `nix run .#geometry -- elevation <word> [--fetch]` | Sample the surveyed places' heights from the circuit's source |
| `nix run .#geometry -- probe <lat>,<lon> [--radius <km>]` | Ask OpenStreetMap what relations stand at a place, before a circuit has a config |
| `nix run .#test` | `flix test` — readings off fixtures, no network, no files written — then `test/check-sources.mjs` |
| `nix run .#fence` | `survey` over every kept answer, then `regenerate`; what CI runs |

Each module's header says what it reads and refuses; what follows is what crosses them.

## One pipeline, one thin config per circuit

A circuit joins as a record in `src/Circuit.flix` — the relation, or a box of raceway ground where OpenStreetMap tags no relation, the member role naming the line the lap is measured from, and the timing line's published coordinates — and as a directory named by the circuit's word under `circuits/`, holding its map record (`map.json`), whose centreline is the length the surveyed line is stretched to.
How each circuit is actually tagged is its config comment's to say.
A relation may list ground under no role that the lap no longer runs — Imola's bypassed Variante Bassa chicane — and `bypassed` names those ways by id, as `pit` names the pit lane's; a chain that walked the lap and the bypassed chicane both would have to split a way.
The config's timing-line coordinates are what make a run answering the wrong role fail before it writes anything, rather than drawing every car early.

What the pipeline writes is a published file, not a build artifact: it is committed, and nothing is generated from it at build time.

## The fence

A consumer's tests cannot hold a survey: the pipeline stretches whatever degrees it gets to the published lap length, so a point moved 20 m passes every test laid on the drawing.
`nix run .#geometry -- survey <word>` holds it instead, re-running the pipeline over the kept Overpass answer and failing unless it reproduces the published bytes exactly; `regenerate` does the same over every circuit, comparing every fenced property exactly and exempting `surveyed_at` alone.
CI runs both for every circuit and never passes `--write`: a fence that rewrites what it fences passes by construction.

The fence's property list is the writer's own (`Geometry.Write.claims`) less that one exemption; `TestRegenerate` holds both directions — every claim the writer lays is fenced or exempt, and every fenced name is a claim the writer lays.

A regeneration is read with `diff`, which lays the moved file against the kept one in metres.
A survey that moved is a change for every consumer drawing on those degrees; the size of a move is measured on the GeoJSON.

`--fetch` asks OpenStreetMap now and keeps the answer only once the survey can read it — an answer that surveys nothing is evidence nobody can re-run. Keeping an answer is `--fetch`'s alone and laying the geometry `--write`'s alone, so `--fetch` without `--write` answers whether a fresh survey moves the published bytes and writes nothing else.

## What the bytes are kept to

Every surveyed point is held in OpenStreetMap's degrees with how far round the lap it stands, and a consumer projects them through the `frame` written beside them.
The frame's origin is the survey's north-west corner, so the drawing never falls below zero.

## The spec, kept as read

`circuits/<word>/spec.json` is what the latest of the series' circuit maps prints, read off it by hand; the PDF stays out of the repository, since the maps are not to be redistributed, and the spec keeps the season, the date the map was issued and the circuit's full name.
A new map replaces the spec, and the geometry is re-laid from it with `regenerate --write`.
`Circuit.figuresOf` refuses a spec whose lines do not stand in the order a car reaches them, every one before the finish line closes the lap.
A map gives its finish line no degrees, so where OpenStreetMap tags none at the line the authored place is read off the map's drawing laid over the survey; the config of each such circuit (Monza, Fuji) says how, and how near. Where the relation tags its own line, the map's Start Line Offset is its own check on the reading: the two nodes should stand that far apart along the lap, as São Paulo's tagged `start` and `finish` do at 60.04 m against the map's 60.2 m, as Barcelona's and COTA's tagged pair do at 127 against 128 and 296.6 against 297, and as the node behind Spa's lone `start` node does at 123.9 against 122.
A lone `start` node is not always the map's Start Line — Imola's is its finish line, with the map's Start Line and Pit Out falling 210 m and 228 m after it against the 218 m and 222.8 m the map prints — so which of the two a lone `start` names is the map's drawing's to say, and the config comment records it.
Every figure is kept twice, as `metres` and as the map printed it, because the print carries the precision the map was written to (0.01 m at Le Mans, whole metres elsewhere) and its decimal comma.
`lengths` and `lines` hold only what the map gives a distance for, every line measured from the finish line; `drawn` names what it draws without one, and lists such as Le Mans's timing loops are kept in the map's own order.
`sectors` and Le Mans's `zones` are the stretches the map colours, each bounded by the drawn labels its colour changes at.
A map's figures need not agree with one another: Lap by Pits should be the centreline less the track between Pit In and Pit Out plus the pit lane, and 2026's Fuji map misses that by 9 m and Barcelona's by 5.2 m. São Paulo's 2026 map misses it by 3 m and Spa's by 48 m, and at Spa Pit In - Pit Out (386.6 m) is all but the track between its own Pit In and Pit Out lines (386.4 m); the spec keeps what the map prints either way.

## The heights

`elevation <word> --fetch` samples the places a survey walks (`Elevation.placesOf`) from the source the circuit's config names, and keeps the source's own values as `circuits/<word>/elevation.json`.
The survey and the fence read them as they read the kept answer; how they are despiked, smoothed and thinned is `Survey.laidOut`'s, and a circuit keeping none is drawn without heights.

**São Paulo's source is a point cloud no service answers a place of**, so `--fetch` reads every one of the city's 5,544 LiDAR tiles' headers to find the few the lap stands on, then streams those through `laszip4j` (LGPL-2.1) and keeps only the ground returns near a place; no tile is written to disk.
The places are found on the tiles' SIRGAS 2000 / UTM 23S grid by `proj4j` (Apache 2.0); those two are the project's only Maven dependencies.
A height there is the median of the ground returns within 1 m of the place, or 1.5 m under a bridge, so it is read here rather than taken off a model; `resolution_m` says which radius.

**The samples are keyed by the degrees they were asked at.** An answer re-fetched with any node moved leaves that place unsampled, and the survey and the fence refuse the circuit until `elevation <word> --fetch` samples it again; re-fetching an answer and re-sampling it are one change.

**Sampling a circuit adds points to its drawing**: a crest or a dip on a line straight on the plan is a point the thinning keeps.

## The probe, and OpenStreetMap's answers

`Overpass.flix` spells the runners and the backoff once, for the probe's question and the survey's alike; its `flix test` pins that only the survey asks for `node(w)`.
`Service.flix` spells a run's name, its pace and the reading of what a service answered with, for Overpass and the elevation sources alike.
**A proxy answers a timed-out request as 200 with an HTML page**, so that reading — beside `Geodesy.earthMetres` — is held to one spelling by `test/check-sources.mjs`: a second reading asking only the status would hand HTML on as a geometry.

## Wiring a test cannot see

**The runner changes directory.** `flix` must start where `flix.toml` is, while a reader names paths from wherever they stand, so the flake exports `GEOMETRY_FROM` as the directory the command was asked from and `Util/Files.flix` resolves every path there. Rename the variable in either place and every typed path is a file not found.

**A file that will not read is a failure, not an absence.** `Util/Files.flix`'s `exists` and `isDirectory` answer a stat that answers nothing as a failure rather than `false`: an unreadable kept answer must not read as a circuit "not surveyed yet", nor an unlistable published directory as a warning with nothing to say, both of which would exit 0. `test/check-sources.mjs` holds that shape, because no test here meets a file.

**The repository's layout is said once, in `Circuit.flix`**: the input directory, the published directory and the names a circuit's directory keeps its inputs under. The warning listing kept files that answer no circuit reads those functions; a name spelled again beside a writer is a directory the warning stops calling out. `TestCircuit` holds a circuit's geometry path to its word.

**One place decides an exit code**: every command is `arguments` over its own flag table and `asking` over its readings, and `Cli.Args.comeTo` turns either into a code. A `Verdict` — the drawing moved — is the negative answer the reader came for, said on stdout at 1; `Failed` is a run that never got to answer, said on stderr.
`--help` is a value in `Parsed`, so `TestUsage.flix` asserts which answer a run of tokens comes to without running anything.

Every tool is the asking and the reading of an answer; the asking stays in the command, and the reading sits in a module that opens nothing, so `nix run .#test` hands it a fixture.
What is judged against the repository's real bytes is the fence.
