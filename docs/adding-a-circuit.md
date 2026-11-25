# Adding a circuit

A circuit is one word and two published files read by that word: its map record and its geometry.
`README.md` says *why* each part is what it is; this says *what to run, in what order, and what catches you when you skip a step*.

The word is snake_case, and is the word consumers ask for the circuit by (elm-motorsport-analysis uses the stem its round ids share: `fuji_6h` → `fuji`).
It names the map record, the evidence directory and the published geometry.
Choose it before anything else.

Paths below are relative to the repository root; the flake resolves every path from where the command is run.

## 1. Write the map record — `circuit-maps/<word>.json`

The record is the one place the lap and its lines are written: the survey stretches the lap to it, the geometry carries its stretches, and a consumer may lay its timing lines from it.
Write it before surveying; `survey` and `regenerate` read it and fail without it.

Read the series' circuit map (the PDF stays out of the repository) into the shape the other records keep; `README.md`'s maps section says what each part holds.
What the code reads, and so must be right:

- `season` — the season of the map.
- `lengths.centerline.metres` — the lap the survey is stretched to and the geometry is checked against.
- `lines.intermediate1.metres` and `lines.intermediate2.metres` — both or neither: both imply the three stretches written as the geometry's `sectors`; neither leaves the circuit publishing no lines.

Every figure is written twice, as `metres` and as the map printed it.
Before going on, check by hand what no reader checks: each `printed` figure reads as its `metres`, and Lap by Pits comes back from the centreline, Pit In, Pit Out and the pit lane — a miss is recorded in the README, not corrected.
The lines' order is checked: a record whose lines do not run 0 < i1 < i2 < centreline is refused.

## 2. Probe before authoring

```bash
nix run .#geometry -- probe <lat>,<lon> [--radius <km>]
```

Prints each candidate relation with its roles' ways measured.
The length is what tells the full circuit from the GP circuit standing beside it; the default 5 km box holds COTA and not a 13.6 km one — widen it for long circuits.
The report is for a human, not for a name: read it before writing a config, and note how the relation tags its start/finish line — no two of the kept circuits tag it alike.

**When the probe comes back empty,** OpenStreetMap holds that circuit as loose `highway=raceway` ways rather than a relation — Fuji is mapped that way.
Author the box grounding instead: `relation = None`, a `box` around the ground, and a `timingLine` at the line's place.
`survey <word> --fetch` reads the ground and names every refusal by way id: author the box loosely and let the refusals tell you what else the box holds.

## 3. Author the config — `src/Circuit.flix`

Add one `def <word>(): Circuit` and append it to `circuits()`.
Its doc-comment is where *how the relation is actually tagged*, and where its line's place came from, belong.
Its `file` is `geometry/<word>.geojson`; `TestCircuit` holds it to the word.

- `relation` / `box` / `pit` — exactly one grounding: the relation the ways are named by, or the box whose raceway ways are chained by standing at the line. A box at a racing complex may hang more than one line off the lap, and the survey reads geometry and one-way tags rather than any way's `name`; `pit` names the pit lane's ways by id then, as a relation's members do.
- `bypassed` — where a relation lists ground under no role that the lap no longer runs (Imola's bypassed Variante Bassa chicane), its ways' ids. The chain takes every unroled way and a failure to chain names what it left out; this is how a name answers it.
- `timedFrom` — the relation member naming the line the lap is timed across; every metre is measured from it. Leave it `""` where the relation tags no member at the finish line (Monza's roles name the pit-exit light): the lap is then turned at `timingLine`'s place, as a box's is.
- `timingLine` — the finish line's place (and the `within` the survey may allow). With a `timedFrom` it checks the tagged node; without one it *is* the zero.
- `elevation` — the height source that covers the circuit's country, if any (`Elevation.Source`).

**The finish line's place.** The map gives every distance from its finish line and none of its degrees.
Check a tagged line against the map's Start Line Offset: the relation's `start` node should stand that far after `finish` (Barcelona 127 m against 128, COTA 296.6 against 297).
Where nothing tags the line, the place is read off the map's drawing laid over the survey, its drawn lines read against their printed distances; Monza's and Fuji's config comments say how, and that it is good to some 20 m.
A place taken off OpenStreetMap or a third-party dataset checks the survey against nothing but itself — say so in the comment.

## 4. Keep the evidence, lay the geometry

```bash
nix run .#geometry -- survey <word> --fetch
```

asks OpenStreetMap and keeps `circuits/<word>/overpass.json`, writing nothing else.
Where the config names a height source, sample the kept answer before laying the geometry:

```bash
nix run .#geometry -- elevation <word> --fetch
```

keeps `circuits/<word>/elevation.json`; every later `--fetch` of the answer needs it re-sampled.
Then lay the geometry from what is kept:

```bash
nix run .#geometry -- survey <word> --write
```

Commit the kept answer, the heights and the `.geojson` together: the first two are re-runnable evidence, the last the published file.
To read a fresh survey against the old one: `nix run .#geometry -- diff <a.geojson> <b.geojson> [--svg ...]`.

## 5. The lists that name every circuit

These freeze the inventory, so a new circuit fails each by name until it joins:

- `test/TestSurvey.flix` — the `known are …` refusal message.
- `test/TestRegenerate.flix` — the `drawn`/`words` lists over `Circuit.circuits()`.
- `README.md`'s table of circuits.

## 6. Verify

| Command | What it catches |
| --- | --- |
| `nix run .#test` | the project's readings off fixtures; the source facts no `@Test` can see |
| `nix run .#geometry -- survey <word>` | byte fence: the published file must come back identical, run with **no** `--write` |
| `nix run .#fence` | the byte fence over every circuit, then the property fence — a new circuit must not move another |

Then release (tag) the change, and draw it consumer-side: in elm-motorsport-analysis that is the circuit's word on its wire enum, a `Layout` module, and an arm in `Shared.drawingFor`.

## A newer map for a circuit already here

1. Replace the record's figures, `season` and `issued` with the new map's, and check them as in step 1.
2. `nix run .#geometry -- regenerate <word> --write` re-lays the geometry on the new lap and stretches; commit both files together. A record changed alone is a geometry whose lap and sectors no longer match it, and the fence fails.
3. `nix run .#fence`.

## Hazards

- **An Overpass proxy answers a timed-out request as 200 with an HTML page.** `Service.answered` is the one reading of what a service answered with; never add a second reading that asks only the status.
- **An unreadable file is a failure, not an absence.** New file-reading branches via `Util/Files`' `exists`/`isDirectory` or reports via `Cli/Errors`; a discarded `Err(_)` fails `check-sources.mjs`.
- **The geometry files carry the ODbL attribution** in their own properties — keep the writer's `claims` list and the fence's exemption list answering to `TestRegenerate` if a property is added.
- **A survey that moves an existing circuit's bytes is its own change**: every consumer drawing on those degrees moves with it, and the move is measured in metres by `diff`.
