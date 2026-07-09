#!/usr/bin/env node
// batch-convert.mjs — convert every OpenLyrics / OpenSong XML song in the
// library to lenverse plain text, in one pass.
//
//   node batch-convert.mjs                       # whole songs/ library → .txt
//   node batch-convert.mjs --dir=path/to/songs   # custom library root
//   node batch-convert.mjs --to=markdown         # write Markdown (.md) instead
//   node batch-convert.mjs --to=openlyrics       # write OpenLyrics XML (.xml)
//   node batch-convert.mjs --dry-run             # report only, write nothing
//   node batch-convert.mjs --overwrite           # overwrite existing outputs
//   node batch-convert.mjs --only-openlyrics     # skip OpenSong XML
//
// Reuses the converters from ./convert.mjs (→ ./format.mjs). No deps.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { convertFile, detectDialect } from "./convert.mjs";

// --- args ------------------------------------------------------------------

function argValue(name, fallback) {
	for (const a of process.argv.slice(2)) {
		if (a === `--${name}`) return true;
		if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
	}
	return fallback;
}
function hasFlag(name) {
	for (const a of process.argv.slice(2)) {
		if (a === `--${name}` || a.startsWith(`--${name}=`)) return true;
	}
	return false;
}

// Default to the (now-removed) legacy <repo>/songs/ XML library — this script
// lives in static/song/, so two levels up + "songs". That library was retired,
// so pass --dir=<path> (or set LENVERSE_SONGS_DIR) to point at an XML song
// library you want to convert in place.
const DEFAULT_SONGS = fileURLToPath(new URL("../../songs/", import.meta.url));
const root = argValue("dir", "") || process.env.LENVERSE_SONGS_DIR || DEFAULT_SONGS;
const to = argValue("to", "text") || "text";
const dryRun = hasFlag("dry-run");
const overwrite = hasFlag("overwrite");
const onlyOpenLyrics = hasFlag("only-openlyrics");

// --- scan ------------------------------------------------------------------

function walkXml(dir, out) {
	let entries;
	try { entries = readDirSafe(dir); }
	catch { return; } // unreadable subdir — skip
	for (const name of entries) {
		if (name.startsWith(".")) continue;
		const p = join(dir, name);
		let st;
		try { st = statSync(p); } catch { continue; }
		if (st.isDirectory()) walkXml(p, out);
		else if (extname(name).toLowerCase() === ".xml") out.push(p);
	}
}

// readdirSync wrapped so a single unreadable folder doesn't abort the run.
function readDirSafe(dir) { return readdirSync(dir); }

const xmlFiles = [];
walkXml(root, xmlFiles);
xmlFiles.sort();

if (!xmlFiles.length) {
	console.log(`No .xml songs found under ${relative(".", root) || root}`);
	process.exit(0);
}

// --- convert ---------------------------------------------------------------

const tally = { openlyrics: 0, opensong: 0, unknown: 0 };
const results = { wrote: [], skip: [], skippedFilter: [] };

for (const file of xmlFiles) {
	let dialect;
	try { dialect = detectDialect(readFileSync(file, "utf8")); }
	catch { dialect = "unknown"; }
	tally[dialect] = (tally[dialect] || 0) + 1;

	const rel = relative(root, file);

	if (onlyOpenLyrics && dialect !== "openlyrics") {
		results.skippedFilter.push(file);
		console.log(`skip (${dialect}, filtered): ${rel}`);
		continue;
	}

	if (dryRun) {
		console.log(`would convert (${dialect}): ${rel}`);
		results.wrote.push(file); // count intended writes
		continue;
	}

	const r = convertFile(file, { overwrite, to });
	if (!r) continue;
	if (r.status === "wrote") {
		results.wrote.push(file);
		console.log(`wrote (${dialect}→${to}): ${relative(root, r.out)}`);
	} else {
		results.skip.push(file);
		console.log(`skip (exists): ${rel}`);
	}
}

// --- summary ---------------------------------------------------------------

const line = "─".repeat(60);
console.log(`\n${line}`);
console.log(`Scanned  ${relative(".", root) || root}`);
console.log(`XML      ${xmlFiles.length}  (openlyrics ${tally.openlyrics}, opensong ${tally.opensong}, other ${tally.unknown})`);
console.log(`Wrote    ${results.wrote.length}`);
console.log(`Skipped  ${results.skip.length} existing` +
	(results.skippedFilter.length ? `, ${results.skippedFilter.length} filtered` : ""));
if (to !== "text") console.log(`Output format: ${to}`);
if (dryRun) console.log("(dry-run — nothing was written)");
