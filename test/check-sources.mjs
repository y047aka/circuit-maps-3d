#!/usr/bin/env node
// What the project cannot see from inside itself, read out of its sources.
//
// The project's Flix tests hand their fixtures: an @Test is a pure function,
// so it reaches no network, builds no `HttpResponse`, and asks nothing of the
// file system. The project-wide facts are therefore invisible to both Flix
// compilers and are read here, from outside the compilers but inside the
// project: one reading of what a service answered with, one spelling of the
// sphere its metres are measured on, one way a filesystem failure is answered.
// A failure they hide is quiet: a second reading of a response that asked only
// the status would hand a proxy's 200-with-HTML-page on as a geometry; a second
// spelling of the radius on the equatorial one prints 13,627 m for the lap the
// survey measures at 13,612, and the measured lap is the one reading a config
// is authored from; a read's failure decided as an absence exits 0.
//
// Run by `nix run .#test` after `flix test`. It reads only `../src` and needs
// nothing beyond `node:fs`.

import { readdirSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deepStrictEqual, doesNotMatch, equal, match } from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const sourcesDir = new URL('../src/', import.meta.url);
const from = fileURLToPath(root);
const here = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** The project's own sources, by the path a message names them by. */
const sources = readdirSync(sourcesDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.flix'))
  .map((entry) => relative(from, `${entry.parentPath ?? entry.path}/${entry.name}`))
  .sort();

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The sources that spell `re` somewhere, by the path a message names them by. */
function spelling(re) {
  return sources.filter((path) => re.test(text(path)));
}

const utilFiles = 'src/Util/Files.flix';
const cliErrors = 'src/Cli/Errors.flix';
const regenerate = 'src/Regenerate.flix';
const service = 'src/Service.flix';
const geodesy = 'src/Geodesy.flix';

const checks = [];
function check(name, body) {
  try {
    body();
    console.log(`ok   ${name}`);
  } catch (failure) {
    checks.push(name);
    console.error(`FAIL ${name}\n${failure.message}`);
  }
}

// The sphere. A second spelling disagrees while the project builds, and its
// cost is not a rounding: on the equatorial radius the probe prints 13,627 m
// for the lap the survey measures at 13,612 — and the measured lap is the one
// reading a config is authored from.
check('the project spells its sphere once', () => {
  deepStrictEqual(spelling(/63\d{5}/), [geodesy],
    'the earth radius is not spelled in exactly one source');
  const stated = here('Geodesy.flix').match(/63\d{5}/g) ?? [];
  equal(stated.length, 1, 'the earth radius is spelled more than once even in Geodesy.flix');
  match(here('Geodesy.flix'), /pub def earthMetres\(\): Float64 = 6371008\.8/);
});

// The response. What a service answered with is one reading, in one source: a
// proxy answers a request it let time out as 200 with an HTML page, so a
// reading that asked only the status would hand that page on as a geometry.
check('one source reads what a service answered with', () => {
  const reading = spelling(/Net\.HttpResponse\./);
  deepStrictEqual(reading, [service]);
});

check('every service is sent its request through that one source', () => {
  deepStrictEqual(spelling(/Https\.send\(/), [service]);
});

check('the sentence a failed answer is printed in is spelled once', () => {
  const spelled = spelling(/answered( \$\{| with something that is not JSON)/);
  deepStrictEqual(spelled, [service]);
});

// The failure. A read's failure cannot tell a missing file from one that would
// not read; a run that branches on absence asks `Util.Files` first, and a run
// that only reports keeps its path with what the filesystem said.
check('no run answers a failure by throwing it away', () => {
  const discarded = sources.flatMap((path) =>
    text(path)
      .split('\n')
      .filter((line) => line.includes('Err(_)'))
      .map((line) => `${path}: ${line.trim()}`),
  );
  deepStrictEqual(discarded, []);
});

check('a run asking whether a file is there asks the path it was given', () => {
  const files = text(utilFiles);
  match(files, /pub def exists\(path: String\): Result\[String, Bool\] \\ IO/);
  match(files, /pub def isDirectory\(dir: String\): Result\[String, Bool\] \\ IO/);
  // Resolved before the filesystem is asked, the way a read and a write resolve
  // it: a run from outside the project branches about the file it named, not
  // about one under the directory `flix` happened to start in.
  match(files, /let at = placed\(path\);\n\s*Fs\.FileStat\.runWithIO\(\(\) -> Fs\.FileStat\.exists\(at\)\)/);
  match(files, /let at = placed\(dir\);\n\s*Fs\.FileStat\.runWithIO\(\(\) -> Fs\.FileStat\.isDirectory\(at\)\)/);
  // A stat that answered nothing is a failure and not a `false`, because
  // `false` is the answer that ends a walk quietly.
  doesNotMatch(files, /mapErr\([^)]*=>\s*Ok\(false\)/);
  match(files, /cannot tell whether \$\{path\}/);
});

check('every command reads and writes a file through the one reporting of it', () => {
  // The commands read through `Cli.Errors`, which carries the path with the
  // failure; reaching past it to `Util.Files.read` leaves the failure naming
  // nothing.
  deepStrictEqual(spelling(/Util\.Files\.read\(/), [cliErrors]);
  deepStrictEqual(spelling(/Util\.Files\.write\(/), [cliErrors]);
});

check('a look the warning cannot make fails the run rather than passing it', () => {
  const fence = text(regenerate);
  match(fence, /def warnUnlisted\(\): Result\[String, List\[String\]\] \\ IO/);
  const asking = fence.slice(fence.indexOf('def asking('), fence.indexOf('def warnUnlisted('));
  match(asking, /case Err\(problem\) => Outcome\.Failed\(problem\)/);
  // A plain file among the directories is not a directory that keeps nothing,
  // so the walk asks which it is rather than listing it and reading the failure
  // for an empty one.
  match(fence, /Util\.Files\.isDirectory\(at\)/);
});

if (checks.length > 0) {
  console.error(`\n${checks.length} of these readings failed.`);
  process.exit(1);
}
