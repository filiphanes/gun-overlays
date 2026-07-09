#!/usr/bin/env node
// convert.mjs — convert songs between formats (LenVerse text, Markdown,
// OpenLyrics XML, OpenSong XML, ProPresenter JSON).
//
// All conversion logic lives in ./format.mjs; this file is a thin CLI +
// file-system wrapper around it, plus a stable export surface for
// batch-convert.mjs and other tooling. No dependencies — node:fs/path only.
// Works with `bun` too.
//
// Usage:
//   node convert.mjs <song.xml>                # → sibling .txt (auto-detected)
//   node convert.mjs <folder>                  # recurse, convert every song
//   node convert.mjs <path> --to=markdown      # write as Markdown (.md)
//   node convert.mjs <path> --to=openlyrics    # OpenLyrics XML (.xml)
//   node convert.mjs <path> --to=opensong      # OpenSong XML (.xml)
//   node convert.mjs <path> --to=propresenter  # ProPresenter JSON (.json)
//   node convert.mjs <path> --overwrite        # overwrite existing outputs

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import {
	convert,
	detectFormat,
	FORMATS,
	EXTENSION,
	decodeEntities,
	normalizeBody as normalizeVerseBody,
} from "./format.mjs";

export { decodeEntities, normalizeVerseBody, detectFormat, FORMATS, EXTENSION };

// --- legacy text-output helpers (kept for backward compatibility) ----------
// Older code imported these to convert OpenLyrics/OpenSong XML → text directly.
// They now route through the shared model.

export function openLyricsToText(raw) { return convert(raw, "openlyrics", "text"); }
export function openSongToText(raw) { return convert(raw, "opensong", "text"); }
export function xmlToText(raw) { return convert(raw, detectFormat("", raw), "text"); }
export function buildOutput(ordered, verses) {
	// Reconstruct the lenverse text format from an order + name→body map.
	return (
		ordered
			.filter((name) => verses[name])
			.map((name) => (name ? `[${name}]\n` : "") + verses[name])
			.join("\n\n") + "\n"
	);
}

// Identify which XML dialect a raw string is in ("openlyrics" | "opensong" |
// "unknown"). Kept because batch-convert tallies by dialect.
export function detectDialect(raw) {
	const f = detectFormat("", raw);
	return f === "openlyrics" || f === "opensong" ? f : "unknown";
}

// Convert one source file to a sibling with the target format's extension.
//   options.to        — target format (default "text")
//   options.overwrite — replace an existing output file
// Returns { file, out, status, format } or null if `file` is not a song we
// recognise (status: "wrote" | "skip").
export function convertFile(file, { overwrite = false, to = "text" } = {}) {
	const raw = readFileSync(file, "utf8");
	const from = detectFormat(file, raw);
	if (from === "text" && extname(file).toLowerCase() !== ".xml") {
		// Don't try to "convert" an already-plain-text file.
		return null;
	}
	const text = convert(raw, from, to, { filename: file });
	const out = file.replace(/\.[^.]+$/, "." + (EXTENSION[to] || "txt"));
	if (existsSync(out) && !overwrite) return { file, out, status: "skip", format: from };
	writeFileSync(out, text);
	return { file, out, status: "wrote", format: from };
}

// Recursively collect every file path under `dir`.
export function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		if (name.startsWith(".")) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

// --- CLI driver (only when invoked directly, not when imported) -----------

function argValue(name, fallback) {
	for (const a of process.argv.slice(2)) {
		if (a === `--${name}`) return true;
		if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
	}
	return fallback;
}

function main() {
	const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const to = argValue("to", "text") || "text";
	const overwrite = argValue("overwrite", false);
	const target = targets[0];

	if (!target) {
		console.error(
			`Usage: node convert.mjs <song | folder> [--to=${FORMATS.join("|")}] [--overwrite]`,
		);
		process.exit(1);
	}
	if (!FORMATS.includes(to)) {
		console.error(`Unknown --to format "${to}". Choose from: ${FORMATS.join(", ")}`);
		process.exit(1);
	}

	const st = statSync(target);
	const files = st.isDirectory() ? walk(resolve(target)) : [resolve(target)];

	let wrote = 0, skipped = 0;
	for (const f of files) {
		const r = convertFile(f, { overwrite, to });
		if (!r) continue;
		console.log(`${r.status === "wrote" ? "wrote" : "skip (exists)"} (${r.format}→${to}): ${r.out}`);
		if (r.status === "wrote") wrote++; else skipped++;
	}
	console.log(`done — ${wrote} wrote, ${skipped} skipped`);
}

const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (invokedDirectly) main();
