// song/script.js — web-overlays port of lenverse/modules/song/script.js.
//
// Differences from the lenverse original:
//   • No file WebSocket / file PUT server. Live state lives in a shared
//     broker (multiBrokerState, see ../js/broker.js). The legacy helpers
//     connectToFileWebSocket(path, cb) and PUT(path, body) are kept as a
//     *compatibility shim* that maps /var/... paths to broker keys, so the
//     dashboard/graphics pages barely change.
//   • The song library is a read-only directory of one file per song, served
//     as static files (songs/, resolved relative to this script). Listing it
//     directory index. Editing/importing is out of scope (read-only library).
//   • Timers that read since-src/until-src now read those reference points
//     from broker state instead of /var/timer/*.txt files.
//
// Everything else (format conversion, parseSong, date formatting, text
// formatting) is unchanged from lenverse and stays pure/dependency-free.

// Resolve sibling modules relative to THIS script, not the page (dynamic
// import in a classic script resolves relative to the calling script URL,
// but capturing currentScript makes it bullet-proof).
const _HERE = (document.currentScript && document.currentScript.src) || location.href;

// --- broker (live state) --------------------------------------------------
// One cached multiBrokerState per document. Keys mirror the lenverse
// /var/... files so the shim + dashboards share one vocabulary.

const ROOM = (() => {
  let r = location.hash.slice(1);
  if (!r && window.parent && window.parent !== window) {
    try { r = window.parent.location.hash.slice(1); } catch { /* cross-origin */ }
  }
  return r || "demo";
})();

let _statePromise;
function brokerState() {
  return (_statePromise ||= (async () => {
    const { multiBrokerState } = await import(new URL("../js/broker.js", _HERE).href);
    const s = multiBrokerState({
      songPath: "",
      verseIndex: 0,
      verse: "",        // HTML verse  (full.html)
      verseText: "",    // plain text  (main.html, zlaté písmená)
      verse1: "",
      verse2: "",
      playlist: "",     // active queue, newline-joined song paths
      playlistName: "current",
      playlists: "{}", // JSON { name: [paths...] }
      timerStart: "",
      liveStart: "",
      mediaPath: "",
    });
    await s.connect({
      space: "song",
      password: ROOM,
      ...Object.fromEntries(new URLSearchParams(location.search)),
    });
    // Drive the shared #disconnected indicator: it only shows when the
    // transport reports "disconnected". Centralized here so every song page
    // that loads script.js stays in sync.
    s.onStatus((v) => document.body.classList.toggle("disconnected", v === "disconnected"));
    return s;
  })());
}

// Map a lenverse /var/... file path to a broker key. Saved playlists
// (var/list/<custom>.txt) are handled directly by lists.html via the
// `playlists` JSON key, not through this shim.
function varKey(path) {
  const p = path.replace(/^\/+/, "");
  const map = {
    "var/song/path.txt": "songPath",
    "var/song/verseindex.txt": "verseIndex",
    "var/song/verse.html": "verse",
    "var/song/verse.txt": "verseText",
    "var/song/verse1.txt": "verse1",
    "var/song/verse2.txt": "verse2",
    "var/song/mediapath.txt": "mediaPath",
    "var/list/current.txt": "playlist",
    "var/list/tablet.txt": "playlist",
    "var/list/listpath.txt": "playlistName",
    "var/list/path.txt": "playlistName",
    "var/timer/timer-start.txt": "timerStart",
    "var/timer/live-start.txt": "liveStart",
  };
  return map[p] || null;
}

// Read a live /var/... value from broker (for timers).
async function varGet(path) {
  const s = await brokerState();
  const key = varKey(path);
  return key ? s[key] : undefined;
}

// Compatibility shim: lenverse pages called connectToFileWebSocket(path, cb)
// and used the returned function to update that file. Here both route through
// the broker. Numbers are coerced for verseIndex so comparisons stay sane.
function connectToFileWebSocket(path, cb) {
  const key = varKey(path);
  if (key) brokerState().then(s => s.subscribe(key, cb));
  return function updateFileWS(value) {
    if (!key) return;
    brokerState().then(s => { s[key] = key === "verseIndex" ? Number(value) : value; });
  };
}

async function varSet(path, value) {
  const s = await brokerState();
  const key = varKey(path);
  if (!key) { console.warn("[song] no broker key for", path); return; }
  s[key] = key === "verseIndex" ? Number(value) : value;
}

// --- HTTP helpers ---------------------------------------------------------

async function GET(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.text() : "";
  } catch (error) {
    console.error("Error GET", path, error);
    return "";
  }
}

// Writes to the song library need a writable file backend, which the read-only
// web-overlays static server does not provide. We keep the symbol so legacy
// call sites don't throw, and log instead of silently swallowing.
async function PUT(path, body) {
  if (path && path.replace(/^\/+/, "").startsWith("var/")) return varSet(path, body);
  console.warn("[song] PUT ignored (read-only):", path);
}

function appendButton(parent, content, onclick, className) {
  const button = document.createElement("button");
  button.innerHTML = content;
  button.onclick = onclick;
  if (className) button.className = className;
  parent.appendChild(button);
}

// --- read-only song library listing (parses http.server HTML index) -------

// The song library dir, resolved relative to THIS script (static/song/songs/)
// so it works regardless of the page's depth — the dashboard pages live right
// here in static/song/ while the graphics pages live one level deeper in
// static/song/graphics/. Both fetch the same absolute dir.
const SONGS = new URL("songs/", _HERE).href;

async function fetchDirRecursive(dir, prefix) {
  if (prefix === undefined) prefix = "";
  const html = await GET(dir + prefix);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const names = [];
  for (const a of doc.querySelectorAll("a")) {
    let href = a.getAttribute("href");
    if (!href) continue;
    href = href.split("?")[0].split("#")[0];
    if (!href || href === "../" || href.startsWith("/") ) continue; // parent / absolute
    const fullName = prefix + href; // dirs keep a trailing "/"
    if (href.endsWith("/")) {
      if (typeof folders !== "undefined") folders.push(fullName);
      const sub = await fetchDirRecursive(dir, fullName);
      names.push(...sub);
    } else {
      names.push(fullName);
    }
  }
  return names;
}

// --- song parsing / conversion (delegates to format.mjs) ------------------
// Pure, isomorphic. Dynamic import resolves relative to this script
// (static/song/format.mjs).

let _formatModule;
function formatModule() {
  return (_formatModule ||= import(new URL("./format.mjs", _HERE).href));
}

// Load a song (any supported format) and return an array of HTML verse blocks
// for display in the editor / verses panel.
async function parseSong(filename, raw) {
  if (!filename) return [];
  const f = await formatModule();
  if (!raw) raw = await GET(SONGS + encodeURIComponent(filename));
  if (!raw) return [];
  return f.modelToHtml(f.readSong(raw, { filename }));
}

async function convertSong(raw, fromFormat, toFormat, filename) {
  const f = await formatModule();
  return f.convert(raw, fromFormat, toFormat, { filename });
}

async function detectSongFormat(filename, raw) {
  const f = await formatModule();
  return f.detectFormat(filename, raw);
}

async function songXmlToText(raw) {
  const f = await formatModule();
  return f.convert(raw, f.detectFormat("", raw), "text");
}

function normalizeText(text) {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .toLowerCase();
}

// --- timers ---------------------------------------------------------------
// Same logic as lenverse, except since-src/until-src resolve from broker.

function pad(num, len) {
  return String(num).padStart(len || 2, "0");
}

const MMMM = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MMM  = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dddd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ddd  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function K(date, utc) {
  if (utc) return "Z";
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function formatDate(date, format, utc) {
  const get = (m) => (utc ? date[`getUTC${m}`]() : date[`get${m}`]());
  const y = get("FullYear"), M = get("Month"), d = get("Date");
  const H = get("Hours"), m = get("Minutes"), s = get("Seconds"), day = get("Day");
  const r = {
    yyyy: String(y), yy: String(y).slice(-2),
    M: M, MM: pad(M), MMM: MMM[M - 1], MMMM: MMMM[M - 1],
    d: d, dd: pad(d), ddd: ddd[day], dddd: dddd[day],
    H: String(H), HH: pad(H), h: String(H % 12 || 12), hh: pad(H % 12 || 12),
    m: String(m), mm: pad(m), s: String(s), ss: pad(s),
    TT: H < 12 ? "AM" : "PM", tt: H < 12 ? "am" : "pm",
  };
  return format.replace(/(\\.)|([a-zA-Z])\2*/g, (match, esc) =>
    esc ? esc.slice(1) : (r[match] || (match === "K" ? K(date, utc) : match)));
}

function addPeriodToDate(date, period) {
  const match = period.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+\.?\d*)S)?)?$/);
  if (!match) return date;
  const [, Y, M, W, D, Hh, Mi, S] = match;
  const t = new Date(date);
  if (Y) t.setFullYear(t.getFullYear() + +Y);
  if (M) t.setMonth(t.getMonth() + +M);
  if (W) t.setDate(t.getDate() + +W * 7);
  if (D) t.setDate(t.getDate() + +D);
  if (Hh) t.setHours(t.getHours() + +Hh);
  if (Mi) t.setMinutes(t.getMinutes() + +Mi);
  if (S) t.setSeconds(t.getSeconds() + parseFloat(S));
  return t;
}

function patchDate(date, s) {
  const iso = date.toISOString();
  return new Date(iso.substr(0, 19 - s.length) + s + iso.slice(19));
}

function doNothing() {}

const timeElements = document.getElementsByTagName("time");
const today = new Date();
today.setHours(0); today.setMinutes(0); today.setSeconds(0);

async function updateTimers() {
  const now = new Date();
  for (let i = 0; i < timeElements.length; i++) {
    const element = timeElements[i];
    if (!element.updateTextContent) {
      const format = element.textContent;
      if (!format) { element.updateTextContent = doNothing(); continue; }
      const sinceSrc = element.getAttribute("since-src");
      const since = element.hasAttribute("since") || (sinceSrc && await varGet(sinceSrc));
      const untilSrc = element.getAttribute("until-src");
      const until = element.hasAttribute("until") || (untilSrc && await varGet(untilSrc));
      const datetime = element.getAttribute("datetime");
      let target = now;
      if (!datetime) {
        target = now;
      } else if (datetime.startsWith("P")) {
        if (since) target = patchDate(today, since);
        target = addPeriodToDate(target, datetime);
      } else {
        target = patchDate(today, datetime);
      }

      if (until) {
        element.updateTextContent = function (now) {
          const diff = target - now;
          this.textContent = formatDate(new Date(diff), format);
          if (diff >= 0) this.classList.add("finished");
        };
      } else if (since) {
        element.updateTextContent = function (now) {
          const diff = now - target;
          this.textContent = formatDate(new Date(diff), format);
          if (diff <= 0) this.classList.add("finished");
        };
      } else {
        element.updateTextContent = function (now) {
          this.textContent = formatDate(now, format);
        };
      }
    }
    element.updateTextContent(now);
  }
}

/* Text editor */
function formatText(tag) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const parentElement = range.commonAncestorContainer.parentElement;

  if (parentElement.tagName === tag) {
    const unwrapped = document.createDocumentFragment();
    while (parentElement.firstChild) unwrapped.appendChild(parentElement.firstChild);
    parentElement.replaceWith(unwrapped);
  } else {
    const wrapper = document.createElement(tag);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    selection.addRange(newRange);
  }
}