// Web Worker that loads the prebuilt binary inverted index for a Bible
// translation and answers content-search queries off the main thread.
//
// Built by scripts/build_search_indexes.mjs, which also benchmarks the other
// engines (flexsearch, json inverted) for static/bible/search/COMPARISON.md —
// only the binary inverted index is shipped (smallest + no JSON.parse + prefix
// search via the sorted vocabulary). Indexes store only integer verse ids; the
// host resolves id -> address via {bible}.addr.bin.
//
// Message protocol (host -> worker):
//   { type: "load",   bible }              -> { type:"ready" } | { type:"error" }
//   { type: "search", query, id, bible }   -> { type:"results", id, ids:[...], ms }

import { decodeBinaryInverted } from "./binverted.mjs";

const SHARED_TOKENIZE = (s) =>
  (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

let current = null;       // { bible, search }
let loading = null;       // in-flight load promise

async function load(bible) {
  if (current && current.bible === bible) return;
  if (loading) await loading.catch(() => {});
  loading = (async () => {
    const res = await fetch(`/bible/search/${bible}.binverted.bin`);
    if (!res.ok) throw new Error(`load failed: ${res.status} ${bible}`);
    const { search } = decodeBinaryInverted(await res.arrayBuffer(), SHARED_TOKENIZE);
    current = { bible, search };
  })();
  await loading;
  loading = null;
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === "load") {
      await load(msg.bible);
      postMessage({ type: "ready", bible: msg.bible });
    } else if (msg.type === "search") {
      if (msg.bible) await load(msg.bible);
      if (!current) return postMessage({ type: "results", id: msg.id, ids: [], ms: 0 });
      const t0 = performance.now();
      const ids = await current.search(msg.query);
      postMessage({ type: "results", id: msg.id, ids, ms: performance.now() - t0 });
    }
  } catch (err) {
    postMessage({ type: "error", id: msg.id, message: String(err?.message || err) });
  }
};
