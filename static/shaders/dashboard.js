// Shader dashboard controller (integrated 3-column view).
//
// Owns the live shader config and orchestrates the shared UI factories from
// ui.js (preview, looks, user presets, params, transform) + the action buttons
// (speed, reset, randomize, show/hide, go, live). Edits serialize the whole
// config { shader, speed, params, sizing } to a JSON string on the `preview`
// broker channel; `Go` copies it to the `program` channel (shown in full.html);
// `Live` makes every edit also push to `program`. Visibility goes on `show`.
// The split pages (preview/presets/controls) reuse the same factories + broker.

import * as ui from "./ui.js";
import { SHADERS, byId, makeConfig } from "./shaders.js";

const el = (id) => document.getElementById(id);

// ---- connection + state ----
const s = ui.connectBroker();
for (const id of ["overlayLink", "overlayLink2"]) {
  const a = el(id);
  a.href = "/shaders/full.html" + location.hash + (location.search || "");
}

let cfg = makeConfig(SHADERS[0].id);
let lastSent = "";
let live = false;

// Write the current cfg to the preview channel (+ the local preview), and to
// the program channel too when Live is on.
function commit() {
  const str = JSON.stringify(cfg);
  lastSent = str;
  s.preview = str;
  if (live) s.program = str;
  preview.update(cfg);
}

// Copy the current preview cfg to the program channel ("take" it on air).
function go() { s.program = JSON.stringify(cfg); }

// ---- live preview (hideable + pinnable) ----
const preview = ui.createPreview({
  host: el("preview"), wrap: el("previewWrap"),
  toggleBtn: el("previewToggle"), pinBtn: el("pinBtn"),
});

// ---- looks + user presets ----
const thumbs = ui.createThumbRenderer();
const looks = ui.createLooksPanel({
  container: el("looksList"),
  thumbs,
  onApply: (config, fi) => { cfg = config; activeLook = fi; renderAll(); commit(); },
});
let activeLook = ui.lookIndex(SHADERS[0].id, 0);

ui.createUserPresets({
  strip: el("presetStrip"), nameInput: el("presetName"), saveBtn: el("presetSave"),
  thumbs, getConfig: () => cfg,
  onApply: (config) => { cfg = config; activeLook = -1; renderAll(); commit(); },
});

// ---- actions: speed, reset, randomize, show/hide, go, live ----
const speedIn = el("speed");
const speedVal = el("speedVal");
speedIn.addEventListener("input", () => {
  cfg.speed = parseFloat(speedIn.value);
  speedVal.textContent = (+speedIn.value).toFixed(2);
  commit();
});

el("resetBtn").addEventListener("click", () => {
  cfg = makeConfig(cfg.shader);
  activeLook = ui.lookIndex(cfg.shader, 0);
  renderAll();
  commit();
});

el("randomBtn").addEventListener("click", () => {
  ui.randomizeParams(cfg);
  activeLook = -1; // randomized state is custom
  renderAll();
  commit();
});

el("goBtn").addEventListener("click", go);

const liveCb = el("liveCb");
liveCb.addEventListener("change", () => {
  live = liveCb.checked;
  s.live = live;
  if (live) go(); // enabling live syncs the current preview to program immediately
});

const showBtn = el("showBtn");
const hideBtn = el("hideBtn");
showBtn.addEventListener("click", () => { s.show = true; });
hideBtn.addEventListener("click", () => { s.show = false; });

// ---- render ----
function renderAll() {
  el("shaderName").textContent = byId.get(cfg.shader).label;
  looks.setActive(activeLook);
  speedIn.value = cfg.speed;
  speedVal.textContent = (+cfg.speed).toFixed(2);
  ui.renderParams(cfg, commit, el("params"));
  ui.renderTransform(cfg, commit, el("transform"));
}

// ---- incoming state from the broker + init ----
s.subscribe("preview", (raw) => {
  if (!raw || raw === lastSent) return; // skip our own echo
  let c;
  try { c = JSON.parse(raw); } catch { return; }
  cfg = c;
  activeLook = -1; // remote state — we can't map it back to a look
  renderAll();
  preview.update(cfg);
});

// Keep the Live checkbox in sync if it's toggled elsewhere (e.g. Controls).
s.subscribe("live", (v) => {
  live = !!v;
  liveCb.checked = live;
});

s.subscribe("show", (visible) => {
  showBtn.classList.toggle("active", visible);
  hideBtn.classList.toggle("active", !visible);
});

renderAll();
preview.update(cfg);
