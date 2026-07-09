// format.mjs — isomorphic song-format conversion for LenVerse.
//
// Every supported format is converted to/from one canonical "song model".
// Adding a format costs one reader + one writer instead of N*N converters.
//
//   external format ──reader──▶ MODEL ──writer──▶ external format
//
//   model = {
//     title?, author?, copyright?,            // optional metadata
//     sections: [ { name, body, note? } ]     // ordered; name "" when absent
//   }
//
// Pure JS: no node:fs, no DOM. Runs unchanged in the browser, Node and Bun.
//
//   import { readSong, writeSong, convert, detectFormat, modelToHtml } from './format.mjs'
//   const model = readSong(raw, { filename });        // auto-detect by content
//   const txt   = writeSong(model, 'text');
//   const xml   = convert(raw, 'openlyrics', 'text');

export const FORMATS = ['text', 'markdown', 'openlyrics', 'opensong', 'propresenter'];

// File extension each format writes to (used by CLI + UI "save as").
export const EXTENSION = {
  text: 'txt',
  markdown: 'md',
  openlyrics: 'xml',
  opensong: 'xml',
  propresenter: 'json',
};

// ── XML entity helpers ────────────────────────────────────────────────────

export function decodeEntities(s) {
	return s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&'); // last, so we don't double-decode
}

export function encodeEntities(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s) {
	return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── body helpers ──────────────────────────────────────────────────────────

// Trim each line and drop blanks: a blank line inside a block would otherwise
// split it into two verses in the block-oriented formats (text / markdown).
export function normalizeBody(parts) {
	return parts
		.join('\n')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length)
		.join('\n');
}

// Legacy alias kept for callers of the old convert.mjs API.
export const normalizeVerseBody = normalizeBody;

// ── readers: external format → model ─────────────────────────────────────

// Lenverse plain text: one block per verse, blocks separated by a blank line,
// each block optionally starting with `[NAME]`. Existing .txt files may also
// contain raw HTML (`<p>`, `<h2>`); that is preserved verbatim in the body.
export function readText(raw) {
	const sections = [];
	for (const block of raw.split(/\n\s*\n/)) {
		const m = block.match(/^\s*\[([^\]]*)\]\s*([\s\S]*)/);
		const name = m ? m[1].trim() : '';
		const body = normalizeBody([m ? m[2] : block]);
		if (body || name) sections.push({ name, body });
	}
	return { sections };
}

// Markdown: a `#`-prefixed line starts a new section (its name); following
// non-empty lines are the body. Inline `[Chord]` notation is preserved.
export function readMarkdown(raw) {
	const sections = [];
	let cur = null;
	const flush = () => {
		if (!cur) return;
		const body = normalizeBody(cur.lines);
		if (body || cur.name) sections.push({ name: cur.name, body });
	};
	for (const line of raw.split('\n')) {
		if (line.startsWith('#')) {
			flush();
			cur = { name: line.replace(/^#+\s*/, '').trim(), lines: [] };
		} else {
			if (!cur) cur = { name: '', lines: [] };
			cur.lines.push(line);
		}
	}
	flush();
	return { sections };
}

// Inner text of an OpenLyrics <lines> element: <br> → newline, drop
// <chord>/<comment>, strip any remaining tags, decode entities.
function openLyricsLinesToText(s) {
	return decodeEntities(
		s
			.replace(/<br\s*\/?>(?:<\/br>)?/gi, '\n')
			.replace(/<chord\b[^>]*\/?>/gi, '')
			.replace(/<comment\b[^>]*>[\s\S]*?<\/comment>/gi, '')
			.replace(/<[^>]+>/g, ''),
	);
}

// OpenLyrics XML (namespaced, <verse name="..."><lines>...). The verseOrder
// element drives section order and may repeat names (e.g. V1 C V2 C); those
// repeats are expanded so display reflects the intended presentation.
export function readOpenLyrics(raw) {
	const order = (raw.match(/<verseOrder[^>]*>([\s\S]*?)<\/verseOrder>/)?.[1] || '')
		.trim()
		.toUpperCase()
		.split(/\s+/)
		.filter(Boolean);
	const verses = {}; // NAME -> body
	const docOrder = [];
	const seen = new Set();
	const note = (n) => { if (n && !seen.has(n)) { seen.add(n); docOrder.push(n); } };

	const verseRe = /<verse\b([^>]*)>([\s\S]*?)<\/verse>/g;
	let m;
	while ((m = verseRe.exec(raw))) {
		const name = (m[1].match(/name\s*=\s*"([^"]*)"/i)?.[1] || '').toUpperCase();
		const parts = [];
		const linesRe = /<lines\b[^>]*>([\s\S]*?)<\/lines>/g;
		let lm;
		while ((lm = linesRe.exec(m[2]))) parts.push(openLyricsLinesToText(lm[1]));
		const body = normalizeBody(parts);
		if (!body) continue;
		verses[name] = verses[name] ? verses[name] + '\n' + body : body;
		note(name);
	}

	const seq = order.length ? [...order, ...docOrder.filter((n) => !order.includes(n))] : docOrder;
	const sections = seq.filter((n) => verses[n]).map((n) => ({ name: n, body: verses[n] }));
	const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	return { title: title ? decodeEntities(title).trim() : undefined, sections };
}

// OpenSong XML: lyrics live as a text blob in <lyrics> with `[label]` markers
// and line-type prefixes (`.` chords, `;`/`|` comments). <presentation> gives
// the order; repeats are expanded, as with OpenLyrics.
export function readOpenSong(raw) {
	const order = (raw.match(/<presentation[^>]*>([\s\S]*?)<\/presentation>/i)?.[1] || '')
		.trim()
		.toUpperCase()
		.split(/\s+/)
		.filter(Boolean);
	const lyrics = decodeEntities(raw.match(/<lyrics[^>]*>([\s\S]*?)<\/lyrics>/i)?.[1] || '');

	const verses = {};
	const docOrder = [];
	const seen = new Set();
	const note = (n) => { if (n && !seen.has(n)) { seen.add(n); docOrder.push(n); } };

	let name = '';
	let lines = [];
	const flush = () => {
		const body = normalizeBody(lines);
		if (body) verses[name] = verses[name] ? verses[name] + '\n' + body : body;
		lines = [];
	};
	for (const lineRaw of lyrics.split('\n')) {
		if (!lineRaw.trim()) continue;
		const c = lineRaw[0];
		if (c === '[') {
			flush();
			name = lineRaw.replace(/[\[\]]/g, '').trim().toUpperCase();
			note(name);
		} else if (c === '.' || c === ';' || c === '|') {
			continue; // chords / comments
		} else {
			lines.push(lineRaw);
		}
	}
	flush();

	const seq = order.length ? [...order, ...docOrder.filter((n) => !order.includes(n))] : docOrder;
	const sections = seq.filter((n) => verses[n]).map((n) => ({ name: n, body: verses[n] }));
	const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	return { title: title ? decodeEntities(title).trim() : undefined, sections };
}

// ProPresenter presentation JSON: groups → slides. Each enabled slide becomes
// a section (name from slide.label, falling back to group.name); slide.text is
// `\r`-separated fields, flattened to newline-separated body lines. slide.notes
// are carried through as the section `note`.
export function readProPresenter(data) {
	const obj = typeof data === 'string' ? JSON.parse(data) : data;
	const sections = [];
	for (const group of obj?.presentation?.groups || []) {
		for (const slide of group.slides || []) {
			if (slide.enabled === false) continue;
			const body = normalizeBody([(slide.text || '').replace(/\r/g, '\n')]);
			const note = (slide.notes || '').trim();
			const name = (slide.label || group.name || '').trim();
			if (body || note) sections.push({ name, body, note: note || undefined });
		}
	}
	return { title: obj?.presentation?.id?.name || undefined, sections };
}

// ── format detection ─────────────────────────────────────────────────────

// Best-effort detection by content first, then filename. Works even when the
// extension is wrong or missing.
export function detectFormat(filename, raw) {
	const name = (filename || '').toLowerCase();
	const s = typeof raw === 'string' ? raw : '';

	if (/^\s*<\?xml/.test(s) || /<song\b/i.test(s) || /<lyrics\b/i.test(s)) {
		if (/openlyrics\.info\/namespace/.test(s)) return 'openlyrics';
		if (/<verse\b[^>]*\bname\s*=/.test(s)) return 'openlyrics';
		return 'opensong';
	}
	if (name.endsWith('.xml')) {
		return /openlyrics/i.test(s) ? 'openlyrics' : 'opensong';
	}
	if (s.trim().startsWith('{') && /"presentation"\s*:/.test(s) && /"groups"\s*:/.test(s)) {
		return 'propresenter';
	}
	if (name.endsWith('.json') || name.endsWith('.pro.json')) return 'propresenter';
	if (name.endsWith('.md')) return 'markdown';
	return 'text';
}

// Read any supported format into a model.
export function readSong(raw, opts = {}) {
	const format = opts.format || detectFormat(opts.filename || '', raw);
	switch (format) {
		case 'openlyrics': return readOpenLyrics(raw);
		case 'opensong': return readOpenSong(raw);
		case 'markdown': return readMarkdown(raw);
		case 'propresenter': return readProPresenter(raw);
		default: return readText(raw);
	}
}

// ── writers: model → external format ─────────────────────────────────────

// Collapse a section list to one entry per unique name (first body wins),
// synthesising a name like V1/V2/… for unnamed sections. OpenLyrics/OpenSong
// verse identifiers must be unique, so their writers use this.
function uniqueNamed(model) {
	const seen = new Set();
	const out = [];
	let n = 0;
	for (const s of model.sections) {
		const name = s.name || `V${out.length + 1}`;
		if (seen.has(name)) continue;
		seen.add(name);
		out.push({ ...s, name });
	}
	return out;
}

export function writeText(model) {
	return (
		model.sections
			.map((s) => (s.name ? `[${s.name}]\n` : '') + (s.body || ''))
			.filter(Boolean)
			.join('\n\n') + '\n'
	);
}

export function writeMarkdown(model) {
	return (
		model.sections
			.map((s) => {
				let out = `# ${s.name || ''}\n`;
				if (s.note) out += `> ${s.note}\n`;
				out += s.body || '';
				return out;
			})
			.join('\n') + '\n'
	);
}

export function writeOpenLyrics(model) {
	const unique = uniqueNamed(model);
	const order = unique.map((s) => s.name).join(' ');
	const titles = model.title
		? `  <properties>\n    <titles>\n      <title>${encodeEntities(model.title)}</title>\n    </titles>\n` +
			(order ? `    <verseOrder>${order}</verseOrder>\n` : '') +
			`  </properties>\n`
		: order
			? `  <properties>\n    <verseOrder>${order}</verseOrder>\n  </properties>\n`
			: '';
	const verses = unique
		.map((s) => {
			const lines = (s.body || '').split('\n').map(encodeEntities).join('<br/>');
			return `    <verse name="${encodeEntities(s.name)}">\n      <lines>${lines}</lines>\n    </verse>`;
		})
		.join('\n');
	return (
		`<?xml version='1.0' encoding='UTF-8'?>\n` +
		`<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">\n` +
		titles +
		`  <lyrics>\n${verses}\n  </lyrics>\n</song>\n`
	);
}

export function writeOpenSong(model) {
	const unique = uniqueNamed(model);
	const order = unique.map((s) => s.name).join(' ');
	const lyrics = unique.map((s) => `[${s.name}]\n${s.body || ''}`).join('\n\n');
	return (
		`<song>\n` +
		`  <title>${encodeEntities(model.title || '')}</title>\n` +
		`  <author>${encodeEntities(model.author || '')}</author>\n` +
		(order ? `  <presentation>${order}</presentation>\n` : '') +
		`  <lyrics>${encodeEntities(lyrics)}</lyrics>\n` +
		`</song>\n`
	);
}

function uuid() {
	try {
		if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	} catch { /* fall through */ }
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export function writeProPresenter(model) {
	const groups = model.sections.map((s) => ({
		name: s.name || '',
		color: { red: 0.4, green: 0.4, blue: 0.4, alpha: 1 },
		slides: [
			{
				enabled: true,
				notes: s.note || '',
				text: (s.body || '').replace(/\r/g, ''),
				label: s.name || '',
				size: { width: 1920, height: 1080 },
			},
		],
	}));
	return (
		JSON.stringify(
			{
				presentation: {
					id: { uuid: uuid(), name: model.title || '', index: 0 },
					groups,
				},
			},
			null,
			2,
		) + '\n'
	);
}

export function writeSong(model, format) {
	switch ((format || 'text').toLowerCase()) {
		case 'markdown': return writeMarkdown(model);
		case 'openlyrics': return writeOpenLyrics(model);
		case 'opensong': return writeOpenSong(model);
		case 'propresenter':
		case 'projson': return writeProPresenter(model);
		default: return writeText(model);
	}
}

// any → any through the model.
export function convert(raw, from, to, opts = {}) {
	return writeSong(readSong(raw, { format: from, ...opts }), to);
}

// ── display: model → HTML verse strings ───────────────────────────────────
// Returns an array (one HTML block per section) so the editor / verses panel
// can render each section as its own slide, matching the legacy parse* API.

function chordsToHtml(line) {
	return line.replace(/\[([^\]]+)\]/g, '<sup>$1</sup>');
}

function bodyToHtml(body) {
	if (!body) return '';
	// Legacy .txt files store raw HTML blocks (`<p>`, `<h2>`) — pass through
	// untouched so they keep rendering as before.
	if (/<p\b|<h[1-6]\b|<div\b/i.test(body)) return body;
	return body
		.replace(/<br\s*\/?>/gi, '\n') // markdown bodies may contain literal <br>
		.split('\n')
		.filter((l) => l.length)
		.map((l) => `<p>${chordsToHtml(escapeHtml(l))}</p>`)
		.join('\n');
}

export function modelToHtml(model) {
	return model.sections.map((s) => {
		let html = '';
		if (s.name) html += `<h1>${escapeHtml(s.name)}</h1>\n`;
		if (s.note) html += `<blockquote>${escapeHtml(s.note)}</blockquote>\n`;
		html += bodyToHtml(s.body);
		return html.trimEnd();
	});
}
