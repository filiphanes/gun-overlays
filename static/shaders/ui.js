// Shared helpers + UI factories for the shader dashboard.
//
// Extracted from dashboard.js so the integrated controller (index.html) and the
// split panels (preview.html / presets.html / controls.html) share ONE source of
// truth. Everything here is either a pure helper or a factory that takes its
// dependencies explicitly (cfg, commit, DOM containers), so each page wires only
// the slice it needs and all of them stay in sync over the broker.
//
// Outline:
//   1. DOM + format helpers
//   2. broker connection
//   3. parameter controls (one builder per param type) + transform
//   4. thumbnails (lazy + serialized through one WebGL context)
//   5. looks (official per-shader presets) + user presets
//   6. live preview (hideable + pinnable)
//   7. randomize

import { multiBrokerState } from "../js/broker.js";
import {
  SHADERS, byId, makeConfig, createShaderView, renderConfigThumbnail,
  ENUMS, ShaderFitOptions,
} from "./shaders.js";
import { OFFICIAL } from "./presets.js";

// ---- 1. DOM + format helpers ----
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clone = (v) => JSON.parse(JSON.stringify(v));

// color helpers (support #rrggbbaa)
export const rgbPart = (hex) => (hex || "").slice(0, 7);
export const aPart = (hex) => ((hex || "").length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1);
export const withAlpha = (rgb, a) => rgb + Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, "0");
export const fmtV = (v, step) => (step >= 1 ? Math.round(v) : (+v).toFixed(2));

// ---- 2. broker connection ----
// Connect to the bg broker room using the page's hash (password) + query overrides.
// Does NOT auto-push the seed values (construction/connect never broadcasts), so
// opening a page never clobbers a running overlay.
//
// State model (two config channels + a live toggle + overlay visibility):
//   preview  — JSON config the operator is shaping (shown in preview.html)
//   program  — JSON config currently "on air" in full.html
//   live     — when true, every preview edit is also pushed to program
//   show     — overlay visibility (Show/Hide buttons)
export function connectBroker(seed = { show: true, preview: "", program: "", live: false }) {
  const s = multiBrokerState(seed);
  s.connect({
    space: "bg",
    password: location.hash.slice(1) || "demo",
    ...Object.fromEntries(new URLSearchParams(location.search)),
  });
  return s;
}

// ---- 3. parameter controls (one builder per param type) ----
// `numControl` is pure: (spec, value, onChange) -> element, so the transform
// panel reuses it. The type-specific builders take (spec, cfg, commit) since
// they're only used by the params panel.

// numeric range slider — also used by the transform panel.
export function numControl(spec, value, onChange) {
  const valEl = h("span", { class: "val" }, fmtV(value, spec.step));
  const inp = h("input", {
    type: "range", min: spec.min, max: spec.max, step: spec.step, value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      valEl.textContent = fmtV(v, spec.step);
      onChange(v);
    },
  });
  return h("div", { class: "ctrl" }, h("div", { class: "head" }, h("label", {}, spec.label), valEl), inp);
}

// dot-less radio button group: real <input type="radio"> (visually hidden)
// wrapped in <label>s styled as pill buttons; the checked pill fills with
// the accent color. Keeps native radio semantics (keyboard arrows/space).
export function radioGroup(options, current, onPick, namePrefix) {
  const name = namePrefix + "_" + Math.random().toString(36).slice(2, 8);
  const group = h("div", { class: "radio-group", role: "radiogroup" });
  for (const o of options) {
    const inp = h("input", { type: "radio", name, value: o });
    if (o === current) inp.checked = true;
    inp.addEventListener("change", () => onPick(o));
    group.append(h("label", { class: "radio-opt" }, inp, h("span", {}, o)));
  }
  return group;
}

function colorControl(spec, cfg, commit) {
  const hexEl = h("code", { class: "hex" });
  const pick = h("input", { type: "color", value: rgbPart(cfg.params[spec.key]),
    oninput: (e) => { cfg.params[spec.key] = withAlpha(e.target.value, aPart(cfg.params[spec.key])); hexEl.textContent = cfg.params[spec.key]; commit(); } });
  const al = h("input", { type: "range", class: "alpha", min: 0, max: 1, step: 0.01, value: aPart(cfg.params[spec.key]),
    oninput: (e) => { cfg.params[spec.key] = withAlpha(rgbPart(cfg.params[spec.key]), parseFloat(e.target.value)); hexEl.textContent = cfg.params[spec.key]; commit(); } });
  hexEl.textContent = cfg.params[spec.key];
  return h("div", { class: "ctrl" }, h("div", { class: "head" }, h("label", {}, spec.label)),
    h("div", { class: "colorinp" }, pick, al, hexEl));
}

function colorsControl(spec, cfg, commit) {
  const listEl = h("div", { class: "colorlist" });
  const countEl = h("span", { class: "count" });
  const addBtn = h("button", { class: "mini", title: "Add color",
    onclick: () => { cfg.params[spec.key].push("#ffffff"); rebuild(); commit(); } }, "+");
  const item = (i) => {
    const hx = h("code", { class: "hex" });
    const cur = () => cfg.params[spec.key][i];
    const pick = h("input", { type: "color", value: rgbPart(cur()),
      oninput: (e) => { cfg.params[spec.key][i] = withAlpha(e.target.value, aPart(cur())); hx.textContent = cur(); commit(); } });
    const al = h("input", { type: "range", class: "alpha", min: 0, max: 1, step: 0.01, value: aPart(cur()),
      oninput: (e) => { cfg.params[spec.key][i] = withAlpha(rgbPart(cur()), parseFloat(e.target.value)); hx.textContent = cur(); commit(); } });
    hx.textContent = cur();
    const rm = h("button", { class: "mini rm", title: "Remove",
      onclick: () => { cfg.params[spec.key].splice(i, 1); rebuild(); commit(); } }, "×");
    return h("div", { class: "row color" }, h("div", { class: "colorinp" }, pick, al, hx), rm);
  };
  function rebuild() {
    listEl.replaceChildren(...cfg.params[spec.key].map((_, i) => item(i)));
    countEl.textContent = `${cfg.params[spec.key].length}/${spec.max}`;
    addBtn.disabled = cfg.params[spec.key].length >= spec.max;
  }
  rebuild();
  return h("div", { class: "ctrl colors" },
    h("div", { class: "head" }, h("label", {}, spec.label), h("div", {}, countEl, addBtn)), listEl);
}

function selectControl(spec, cfg, commit) {
  return h("div", { class: "ctrl radio" },
    h("div", { class: "head" }, h("label", {}, spec.label)),
    radioGroup(Object.keys(ENUMS[spec.enum]), cfg.params[spec.key],
      (v) => { cfg.params[spec.key] = v; commit(); }, spec.key));
}

function boolControl(spec, cfg, commit) {
  const cb = h("input", { type: "checkbox" });
  cb.checked = !!cfg.params[spec.key];
  cb.addEventListener("change", () => { cfg.params[spec.key] = cb.checked; commit(); });
  return h("div", { class: "ctrl check" }, h("label", {}, cb, h("span", {}, spec.label)));
}

function imageControl(spec, cfg, commit) {
  const thumb = h("img", { class: "thumb", alt: "", src: cfg.params[spec.key] || "" });
  thumb.onerror = () => { thumb.style.visibility = "hidden"; };
  const inp = h("input", { type: "text", value: cfg.params[spec.key] || "", placeholder: "https://…/image.jpg",
    onchange: () => apply(inp.value) });
  function apply(val) {
    const url = (val || "").trim();
    cfg.params[spec.key] = url;
    thumb.src = url; thumb.style.visibility = "";
    commit();
  }
  const load = h("button", { class: "mini", title: "Load this image URL", onclick: () => apply(inp.value) }, "Load");
  return h("div", { class: "ctrl image" }, h("div", { class: "head" }, h("label", {}, spec.label)),
    h("div", { class: "imageinp" }, thumb, inp, load),
    h("div", { class: "hint-mini" }, "Host must allow CORS (WebGL reads pixels cross-origin)."));
}

// dispatch a param spec to the right builder
export function paramControl(spec, cfg, commit) {
  if (spec.type === "image") return imageControl(spec, cfg, commit);
  if (spec.type === "colors") return colorsControl(spec, cfg, commit);
  if (spec.type === "color") return colorControl(spec, cfg, commit);
  if (spec.type === "select") return selectControl(spec, cfg, commit);
  if (spec.type === "boolean") return boolControl(spec, cfg, commit);
  return numControl(spec, cfg.params[spec.key], (v) => { cfg.params[spec.key] = v; commit(); });
}

export function renderParams(cfg, commit, container) {
  const def = byId.get(cfg.shader);
  container.replaceChildren();
  for (const spec of def.params) container.append(paramControl(spec, cfg, commit));
}

// ---- transform controls (shared sizing uniforms) ----
const SIZING_NUMS = [
  ["scale", "Scale", 0.01, 4, 0.01],
  ["rotation", "Rotation", 0, 360, 1],
  ["originX", "Origin X", 0, 1, 0.01],
  ["originY", "Origin Y", 0, 1, 0.01],
  ["offsetX", "Offset X", -1, 1, 0.01],
  ["offsetY", "Offset Y", -1, 1, 0.01],
  ["worldWidth", "World width", 0, 2000, 1],
  ["worldHeight", "World height", 0, 2000, 1],
];

export function renderTransform(cfg, commit, container) {
  container.replaceChildren();
  const fitGroup = radioGroup(Object.keys(ShaderFitOptions), cfg.sizing.fit,
    (v) => { cfg.sizing.fit = v; commit(); }, "fit");
  container.append(h("div", { class: "ctrl radio" }, h("div", { class: "head" }, h("label", {}, "Fit")), fitGroup));
  for (const [key, label, min, max, step] of SIZING_NUMS) {
    container.append(numControl(
      { label, min, max, step },
      cfg.sizing[key],
      (v) => { cfg.sizing[key] = v; commit(); },
    ));
  }
}

// ---- 4. thumbnails: lazy (IntersectionObserver) + serialized (one WebGL context) ----
export function createThumbRenderer() {
  const cache = new Map();
  const queue = [];
  let busy = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.target._thumb) {
        queue.push(e.target._thumb);
        e.target._thumb = null;
        io.unobserve(e.target);
        pump();
      }
    }
  }, { rootMargin: "300px" });

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const { el, key, config } = queue.shift();
      if (cache.has(key)) { el.style.backgroundImage = `url("${cache.get(key)}")`; continue; }
      const url = await renderConfigThumbnail(config);
      if (url) { cache.set(key, url); el.style.backgroundImage = `url("${url}")`; }
      await new Promise((r) => requestAnimationFrame(r)); // let GC reclaim the WebGL context
    }
    busy = false;
  }

  function attachThumb(el, key, config) {
    if (cache.has(key)) { el.style.backgroundImage = `url("${cache.get(key)}")`; return; }
    el._thumb = { el, key, config };
    io.observe(el);
  }

  return { attachThumb };
}

// ---- 5a. looks: official per-shader presets ----
// Every shader contributes at least a Default look. Official presets come from
// presets.js; shaders without any (the image filters) get a synthetic Default
// so they're still selectable from the Looks grid.
export const LOOKS = [];
for (const sh of SHADERS) {
  const list = OFFICIAL[sh.id] || [];
  if (list.length === 0) {
    LOOKS.push({ shader: sh.id, index: 0, name: sh.label, synthetic: true });
  } else {
    list.forEach((p, i) => LOOKS.push({ shader: sh.id, index: i, name: i === 0 ? sh.label : p.name }));
  }
}

export const lookIndex = (shader, i) => LOOKS.findIndex((l) => l.shader === shader && l.index === i);

export function lookConfig(shader, i) {
  const p = (OFFICIAL[shader] || [])[i];
  const c = makeConfig(shader);
  if (!p) return c;
  Object.assign(c.params, clone(p.params));
  c.sizing = clone(p.sizing);
  c.speed = p.speed;
  return c;
}

// Renders the Looks grid into `container` and tracks the active tile.
// onApply(config, flatIndex) is called when a look is clicked.
export function createLooksPanel({ container, thumbs, onApply }) {
  const rows = new Map(); // flat index -> tile
  for (const sh of SHADERS) {
    const presets = OFFICIAL[sh.id] || [];
    const strip = h("div", { class: "thumb-strip" }); // one grid per shader
    const addTile = (i) => {
      const fi = lookIndex(sh.id, i);
      const lk = LOOKS[fi];
      const tile = h("div", { class: "thumb-btn", role: "button", tabindex: "0",
        title: "Apply " + lk.name, onclick: () => { onApply(lookConfig(lk.shader, lk.index), fi); setActive(fi); } },
        h("span", { class: "tlabel" }, lk.name));
      thumbs.attachThumb(tile, "look:" + sh.id + ":" + i, lookConfig(sh.id, i));
      rows.set(fi, tile);
      strip.append(tile);
    };
    if (presets.length === 0) addTile(0); // synthetic Default (image filters, etc.)
    else for (let i = 0; i < presets.length; i++) addTile(i);
    container.append(strip);
  }

  function setActive(fi) {
    for (const [k, row] of rows) row.classList.toggle("active", k === fi);
    if (fi >= 0) rows.get(fi)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return { setActive };
}

// ---- 5b. user presets (global: any shader, stored in localStorage) ----
export function createUserPresets({ strip, nameInput, saveBtn, thumbs, getConfig, onApply }) {
  const KEY = "bg.presets.v2";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));
  let presets = load();

  function refresh() {
    if (!presets.length) { strip.replaceChildren(h("span", { class: "empty" }, "— none yet —")); return; }
    strip.replaceChildren(...presets.map((p, i) => {
      const ci = clone(p.config);
      const tile = h("div", { class: "thumb-btn", role: "button", tabindex: "0",
        title: "Apply " + p.name + "  ·  " + (byId.get(p.config.shader)?.label || ""), onclick: () => onApply(clone(p.config)) },
        h("span", { class: "tlabel" }, p.name),
        h("button", { class: "del", title: "Delete " + p.name,
          onclick: (e) => { e.stopPropagation(); del(i); } }, "×"));
      thumbs.attachThumb(tile, "u:" + JSON.stringify(ci), ci);
      return tile;
    }));
  }
  function del(i) { presets.splice(i, 1); save(presets); refresh(); }
  function saveCurrent() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    presets.push({ name, config: clone(getConfig()) });
    save(presets);
    refresh();
    nameInput.value = "";
  }
  if (saveBtn) saveBtn.addEventListener("click", saveCurrent);
  if (nameInput) nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveCurrent(); });
  refresh();

  return { refresh };
}

// ---- 6. live preview (hideable to save battery + pinnable) ----
export function createPreview({ host, wrap, toggleBtn, pinBtn }) {
  const STUB = { update() {}, setSpeed() {}, dispose() {} };
  let on = (localStorage.getItem("bg.preview") ?? "1") !== "0";
  let view = STUB;
  let lastCfg = null;

  function setOn(v) {
    on = v;
    localStorage.setItem("bg.preview", on ? "1" : "0");
    if (toggleBtn) {
      toggleBtn.textContent = "Preview: " + (on ? "on" : "off");
      toggleBtn.classList.toggle("off", !on);
    }
    if (wrap) wrap.classList.toggle("off", !on);
    view.dispose(); // a no-op when already off (STUB) — avoids stacking mounts
    view = on ? createShaderView(host) : STUB;
    if (on && lastCfg) view.update(lastCfg);
  }
  if (toggleBtn) toggleBtn.addEventListener("click", () => setOn(!on));
  setOn(on);

  let pinned = localStorage.getItem("bg.pin") === "1";
  function setPin(v) {
    pinned = v;
    localStorage.setItem("bg.pin", pinned ? "1" : "0");
    if (wrap) wrap.classList.toggle("pinned", pinned);
    if (pinBtn) pinBtn.classList.toggle("active", pinned);
  }
  if (pinBtn) pinBtn.addEventListener("click", () => setPin(!pinned));
  setPin(pinned);

  return {
    update(cfg) { lastCfg = cfg; if (on) view.update(cfg); },
    dispose() { view.dispose(); },
    setOn,
  };
}

// ---- 7. randomize ----
// hsl(0..360, 0..100, 0..100) -> #rrggbb
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return "#" + to(f(0)) + to(f(8)) + to(f(4));
}
function rndHueColor(alpha) {
  const h = Math.random() * 360, s = 55 + Math.random() * 45, l = 32 + Math.random() * 43;
  const a = (alpha * 255) | 0;
  return hslToHex(h, s, l) + a.toString(16).padStart(2, "0");
}

// Randomize the current shader's parameters in place. Colors get a vibrant
// random hue (alpha preserved); selects pick a random option; booleans flip a
// coin. The image URL is left untouched. Returns cfg.
export function randomizeParams(cfg) {
  const def = byId.get(cfg.shader);
  for (const spec of def.params) {
    if (spec.type === "number") {
      const v = spec.min + Math.random() * (spec.max - spec.min);
      cfg.params[spec.key] = parseFloat((Math.round(v / spec.step) * spec.step).toFixed(4));
    } else if (spec.type === "color") {
      cfg.params[spec.key] = rndHueColor(aPart(cfg.params[spec.key]));
    } else if (spec.type === "colors") {
      cfg.params[spec.key] = cfg.params[spec.key].map((c) => rndHueColor(aPart(c)));
    } else if (spec.type === "select") {
      const keys = Object.keys(ENUMS[spec.enum]);
      cfg.params[spec.key] = keys[Math.floor(Math.random() * keys.length)];
    } else if (spec.type === "boolean") {
      cfg.params[spec.key] = Math.random() < 0.5;
    }
    // type === "image" -> skip (never randomize the URL)
  }
  return cfg;
}
