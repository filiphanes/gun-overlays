// Shader dashboard controller.
//
// Owns the live shader config, renders the parameter UI, manages the official
// "Looks" + your saved presets, renders lazy thumbnails, and syncs the whole
// state to the overlay (bg.html) over the broker. Extracted from index.html so
// the markup (structure) and this module (behaviour) stay readable on their own.
//
// Outline:
//   1. connection + state
//   2. live preview (hideable + pinnable)
//   3. DOM + format helpers
//   4. parameter controls (one builder per param type)
//   5. transform controls
//   6. thumbnails (lazy + serialized through one WebGL context)
//   7. looks (official per-shader presets)
//   8. actions (speed, reset, randomize, show/hide)
//   9. user presets (localStorage)
//  10. incoming broker state + init

import { multiBrokerState } from "../js/broker.js";
import {
  SHADERS, byId, makeConfig, createShaderView, renderConfigThumbnail, ENUMS, ShaderFitOptions,
} from "./shaders.js";
import { OFFICIAL } from "./presets.js";

// ---- 1. connection + state ----
const password = location.hash.slice(1) || "demo";
const query = Object.fromEntries(new URLSearchParams(location.search));
for (const id of ["overlayLink", "overlayLink2"]) {
  const a = document.getElementById(id);
  a.href = "/shaders/bg.html" + location.hash + (location.search || "");
}

let cfg = makeConfig(SHADERS[0].id);
let lastSent = "";
const clone = (v) => JSON.parse(JSON.stringify(v));

const s = multiBrokerState({ show: true, config: "" });
// Note: we deliberately do NOT auto-push our default on load — that would
// clobber a running overlay's state every time the dashboard is reopened.
// We broadcast only on real user interaction; a stored config is restored via
// the incoming subscribe() in section 10.
s.connect({ space: "bg", password, ...query });

// ---- 2. live preview (hideable to save battery) ----
const STUB_VIEW = { update() {}, setSpeed() {}, dispose() {} };
const previewHost = document.getElementById("preview");
const previewWrap = document.getElementById("previewWrap");
const previewToggle = document.getElementById("previewToggle");
let previewOn = (localStorage.getItem("bg.preview") ?? "1") !== "0";
let preview = STUB_VIEW;

function setPreview(on) {
  previewOn = on;
  localStorage.setItem("bg.preview", on ? "1" : "0");
  previewToggle.textContent = "Preview: " + (on ? "on" : "off");
  previewToggle.classList.toggle("off", !on);
  previewWrap.classList.toggle("off", !on);
  preview.dispose(); // a no-op when already off (STUB) — avoids stacking mounts
  if (on) { preview = createShaderView(previewHost); preview.update(cfg); }
  else { preview = STUB_VIEW; }
}
previewToggle.addEventListener("click", () => setPreview(!previewOn));
setPreview(previewOn); // sync button/overlay with initial state

// pin preview as a floating picture-in-picture so it stays visible while scrolling
const pinBtn = document.getElementById("pinBtn");
let pinned = localStorage.getItem("bg.pin") === "1";
function setPin(on) {
  pinned = on;
  localStorage.setItem("bg.pin", on ? "1" : "0");
  previewWrap.classList.toggle("pinned", on);
  pinBtn.classList.toggle("active", on);
}
pinBtn.addEventListener("click", () => setPin(!pinned));
setPin(pinned);

// ---- 3. DOM + format helpers ----
function h(tag, props = {}, ...kids) {
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

// color helpers (support #rrggbbaa)
const rgbPart = (hex) => (hex || "").slice(0, 7);
const aPart = (hex) => ((hex || "").length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1);
const withAlpha = (rgb, a) => rgb + Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, "0");
const fmtV = (v, step) => (step >= 1 ? Math.round(v) : (+v).toFixed(2));

// ---- 4. parameter controls (one builder per param type) ----
// `numControl` is pure: (spec, value, onChange) -> element, so the same builder
// is reused by the transform panel (section 5). The type-specific builders
// below couple directly to `cfg` + `commit()` since they're only used here.

// numeric range slider — also used by the transform panel.
function numControl(spec, value, onChange) {
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

function colorControl(spec) {
  const hexEl = h("code", { class: "hex" });
  const pick = h("input", { type: "color", value: rgbPart(cfg.params[spec.key]),
    oninput: (e) => { cfg.params[spec.key] = withAlpha(e.target.value, aPart(cfg.params[spec.key])); hexEl.textContent = cfg.params[spec.key]; commit(); } });
  const al = h("input", { type: "range", class: "alpha", min: 0, max: 1, step: 0.01, value: aPart(cfg.params[spec.key]),
    oninput: (e) => { cfg.params[spec.key] = withAlpha(rgbPart(cfg.params[spec.key]), parseFloat(e.target.value)); hexEl.textContent = cfg.params[spec.key]; commit(); } });
  hexEl.textContent = cfg.params[spec.key];
  return h("div", { class: "ctrl" }, h("div", { class: "head" }, h("label", {}, spec.label)),
    h("div", { class: "colorinp" }, pick, al, hexEl));
}

function colorsControl(spec) {
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

// dot-less radio button group: real <input type="radio"> (visually hidden)
// wrapped in <label>s styled as pill buttons; the checked pill fills with
// the accent color. Keeps native radio semantics (keyboard arrows/space).
function radioGroup(options, current, onPick, namePrefix) {
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

function selectControl(spec) {
  return h("div", { class: "ctrl radio" },
    h("div", { class: "head" }, h("label", {}, spec.label)),
    radioGroup(Object.keys(ENUMS[spec.enum]), cfg.params[spec.key],
      (v) => { cfg.params[spec.key] = v; commit(); }, spec.key));
}

function boolControl(spec) {
  const cb = h("input", { type: "checkbox" });
  cb.checked = !!cfg.params[spec.key];
  cb.addEventListener("change", () => { cfg.params[spec.key] = cb.checked; commit(); });
  return h("div", { class: "ctrl check" }, h("label", {}, cb, h("span", {}, spec.label)));
}

function imageControl(spec) {
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
function paramControl(spec) {
  if (spec.type === "image") return imageControl(spec);
  if (spec.type === "colors") return colorsControl(spec);
  if (spec.type === "color") return colorControl(spec);
  if (spec.type === "select") return selectControl(spec);
  if (spec.type === "boolean") return boolControl(spec);
  return numControl(spec, cfg.params[spec.key], (v) => { cfg.params[spec.key] = v; commit(); });
}

function renderParams() {
  const def = byId.get(cfg.shader);
  const wrap = document.getElementById("params");
  wrap.replaceChildren();
  for (const spec of def.params) wrap.append(paramControl(spec));
}

// ---- 5. transform controls (shared sizing uniforms) ----
function renderTransform() {
  const wrap = document.getElementById("transform");
  wrap.replaceChildren();
  const fitGroup = radioGroup(Object.keys(ShaderFitOptions), cfg.sizing.fit,
    (v) => { cfg.sizing.fit = v; commit(); }, "fit");
  wrap.append(h("div", { class: "ctrl radio" }, h("div", { class: "head" }, h("label", {}, "Fit")), fitGroup));
  // reuse the same numControl as the param panel — only the storage differs
  const sizingNums = [
    ["scale", "Scale", 0.01, 4, 0.01],
    ["rotation", "Rotation", 0, 360, 1],
    ["originX", "Origin X", 0, 1, 0.01],
    ["originY", "Origin Y", 0, 1, 0.01],
    ["offsetX", "Offset X", -1, 1, 0.01],
    ["offsetY", "Offset Y", -1, 1, 0.01],
    ["worldWidth", "World width", 0, 2000, 1],
    ["worldHeight", "World height", 0, 2000, 1],
  ];
  for (const [key, label, min, max, step] of sizingNums) {
    wrap.append(numControl(
      { label, min, max, step },
      cfg.sizing[key],
      (v) => { cfg.sizing[key] = v; commit(); },
    ));
  }
}

// ---- 6. thumbnails: lazy (IntersectionObserver) + serialized (one WebGL context) ----
const thumbCache = new Map();
const thumbQueue = [];
let thumbBusy = false;
const thumbIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting && e.target._thumb) {
      thumbQueue.push(e.target._thumb);
      e.target._thumb = null;
      thumbIO.unobserve(e.target);
      pumpThumbs();
    }
  }
}, { rootMargin: "300px" });
async function pumpThumbs() {
  if (thumbBusy) return;
  thumbBusy = true;
  while (thumbQueue.length) {
    const { el, key, config } = thumbQueue.shift();
    if (thumbCache.has(key)) { el.style.backgroundImage = `url("${thumbCache.get(key)}")`; continue; }
    const url = await renderConfigThumbnail(config);
    if (url) { thumbCache.set(key, url); el.style.backgroundImage = `url("${url}")`; }
    await new Promise((r) => requestAnimationFrame(r)); // let GC reclaim the WebGL context
  }
  thumbBusy = false;
}
function attachThumb(el, key, config) {
  if (thumbCache.has(key)) { el.style.backgroundImage = `url("${thumbCache.get(key)}")`; return; }
  el._thumb = { el, key, config };
  thumbIO.observe(el);
}

// ---- 7. looks: official per-shader presets ----
// Every shader contributes at least a Default look. Official presets come from
// presets.js; shaders without any (the image filters) get a synthetic Default
// so they're still selectable from the Looks grid.
const LOOKS = [];
for (const sh of SHADERS) {
  const list = OFFICIAL[sh.id] || [];
  if (list.length === 0) {
    LOOKS.push({ shader: sh.id, index: 0, name: sh.label, synthetic: true });
  } else {
    list.forEach((p, i) => LOOKS.push({ shader: sh.id, index: i, name: i === 0 ? sh.label : p.name }));
  }
}
const lookIndex = (shader, i) => LOOKS.findIndex((l) => l.shader === shader && l.index === i);

function lookConfig(shader, i) {
  const p = (OFFICIAL[shader] || [])[i];
  const c = makeConfig(shader);
  if (!p) return c;
  Object.assign(c.params, clone(p.params));
  c.sizing = clone(p.sizing);
  c.speed = p.speed;
  return c;
}

const looksList = document.getElementById("looksList");
const lookRowFor = new Map(); // flat index -> tile
for (const sh of SHADERS) {
  const presets = OFFICIAL[sh.id] || [];
  const strip = h("div", { class: "thumb-strip" }); // one grid per shader
  const addTile = (i) => {
    const fi = lookIndex(sh.id, i);
    const lk = LOOKS[fi];
    const tile = h("div", { class: "thumb-btn", role: "button", tabindex: "0",
      title: "Apply " + lk.name, onclick: () => applyLook(fi) },
      h("span", { class: "tlabel" }, lk.name));
    attachThumb(tile, "look:" + sh.id + ":" + i, lookConfig(sh.id, i));
    lookRowFor.set(fi, tile);
    strip.append(tile);
  };
  if (presets.length === 0) addTile(0); // synthetic Default (image filters, etc.)
  else for (let i = 0; i < presets.length; i++) addTile(i);
  looksList.append(strip);
}

function applyLook(fi) {
  const lk = LOOKS[fi];
  if (!lk) return;
  cfg = lookConfig(lk.shader, lk.index);
  activeLook = fi;
  renderAll();
  commit();
}

// ---- 8. actions: speed, reset, randomize, show/hide ----
const speedIn = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");
speedIn.addEventListener("input", () => {
  cfg.speed = parseFloat(speedIn.value);
  speedVal.textContent = (+speedIn.value).toFixed(2);
  commit();
});

document.getElementById("resetBtn").addEventListener("click", () => { cfg = makeConfig(cfg.shader); activeLook = lookIndex(cfg.shader, 0); renderAll(); commit(); });

// Randomize the current shader's parameters. Picks a fresh value within each
// param's range. Colors get a vibrant random hue (alpha preserved); selects
// pick a random option; booleans flip a coin. The image URL is left untouched.
function rndHueColor(alpha) {
  const h = Math.random() * 360, s = 55 + Math.random() * 45, l = 32 + Math.random() * 43;
  const a = (alpha * 255) | 0;
  return hslToHex(h, s, l) + a.toString(16).padStart(2, "0");
}
// hsl(0..360, 0..100, 0..100) -> #rrggbb
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return "#" + to(f(0)) + to(f(8)) + to(f(4));
}
function randomizeParams() {
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
  activeLook = -1; // randomized state is custom
  renderAll();
  commit();
}
document.getElementById("randomBtn").addEventListener("click", randomizeParams);

const showBtn = document.getElementById("showBtn");
const hideBtn = document.getElementById("hideBtn");
showBtn.addEventListener("click", () => { s.show = true; });
hideBtn.addEventListener("click", () => { s.show = false; });

// ---- render + commit (the single write path out to the overlay) ----
function renderAll() {
  const def = byId.get(cfg.shader);
  document.getElementById("shaderName").textContent = def.label;
  for (const [fi, row] of lookRowFor) row.classList.toggle("active", fi === activeLook);
  lookRowFor.get(activeLook)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  speedIn.value = cfg.speed;
  speedVal.textContent = (+cfg.speed).toFixed(2);
  renderParams();
  renderTransform();
}

function commit() {
  const str = JSON.stringify(cfg);
  lastSent = str;
  s.config = str;
  preview.update(cfg);
}

// activeLook = flat index into LOOKS of the applied look (-1 = none / custom)
let activeLook = lookIndex(SHADERS[0].id, 0);

// ---- 9. user presets (global: any shader, stored in localStorage) ----
const PRESET_KEY = "bg.presets.v2";
const loadUserPresets = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || []; } catch { return []; } };
const saveUserPresets = (arr) => localStorage.setItem(PRESET_KEY, JSON.stringify(arr));
let userPresets = loadUserPresets();
const presetStrip = document.getElementById("presetStrip");
const presetName = document.getElementById("presetName");
function refreshUserBtns() {
  if (!userPresets.length) { presetStrip.replaceChildren(h("span", { class: "empty" }, "— none yet —")); return; }
  presetStrip.replaceChildren(...userPresets.map((p, i) => {
    const ci = clone(p.config);
    const tile = h("div", { class: "thumb-btn", role: "button", tabindex: "0",
      title: "Apply " + p.name + "  ·  " + (byId.get(p.config.shader)?.label || ""), onclick: () => applyUser(i) },
      h("span", { class: "tlabel" }, p.name),
      h("button", { class: "del", title: "Delete " + p.name,
        onclick: (e) => { e.stopPropagation(); deleteUser(i); } }, "×"));
    attachThumb(tile, "u:" + JSON.stringify(ci), ci);
    return tile;
  }));
}
function applyUser(i) {
  const p = userPresets[i];
  if (!p) return;
  cfg = clone(p.config);
  activeLook = -1;
  renderAll();
  commit();
}
function deleteUser(i) {
  userPresets.splice(i, 1);
  saveUserPresets(userPresets);
  refreshUserBtns();
}
function saveCurrentPreset() {
  const name = presetName.value.trim();
  if (!name) { presetName.focus(); return; }
  userPresets.push({ name, config: clone(cfg) });
  saveUserPresets(userPresets);
  refreshUserBtns();
  presetName.value = "";
}
document.getElementById("presetSave").addEventListener("click", saveCurrentPreset);
// Enter in the name field saves too (same path as the Save button)
presetName.addEventListener("keydown", (e) => { if (e.key === "Enter") saveCurrentPreset(); });
refreshUserBtns();

// ---- 10. incoming state from the broker + init ----
s.subscribe("config", (raw) => {
  if (!raw || raw === lastSent) return; // skip our own echo
  let c;
  try { c = JSON.parse(raw); } catch { return; }
  cfg = c;
  activeLook = -1; // remote state — we can't map it back to a look
  renderAll();
  preview.update(cfg);
});

s.subscribe("show", (visible) => {
  showBtn.classList.toggle("active", visible);
  hideBtn.classList.toggle("active", !visible);
});

renderAll();
preview.update(cfg);
