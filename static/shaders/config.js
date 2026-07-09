/* shaders/config.js — the Shaders panel dashboard's config for the shared
   panel-frame.js framework (see ../js/panel-frame.js).
 *
 * Unlike the general Dash dashboard, this one is purpose-built for the shader
 * background: its panels are the shader split pages (preview / presets /
   controls / full), which already sync state between themselves over the
   broker (room `bg/<password>`). See shaders/README.md.
 *
 * - propagateHash: the split pages read the broker room from location.hash and
 *   the transport from location.search. location.hash is always carried to
 *   panel iframe srcs (so every panel shares the same room, e.g.
 *   shaders/#live); this flag additionally carries location.search so the
 *   transport (e.g. ?ws=) is shared too.
 *
 * Paths are relative to this file (static/shaders/), so preview.html, …
 * Load this BEFORE ../js/panel-frame.js. */
"use strict";

/* ------------------------------------------------------------------ *
 *  Catalog of shader pages (searched by the add-panel combobox).
 * ------------------------------------------------------------------ */
const MODULES = [
  { group: "Shaders", items: [
    { name: "Preview",                url: "preview.html" },
    { name: "Controls",               url: "controls.html" },
    { name: "Presets",                url: "presets.html" },
    { name: "Full (program overlay)", url: "full.html" },
    { name: "Controller (all-in-one)", url: "controller.html" },
  ]},
];

/* ------------------------------------------------------------------ *
 *  Default layout (first run / reset): live preview on the left, the
 *  parameter Controls in the middle, and the Presets / Looks picker on the
 *  right. All three sync over the broker; tweak freely or add more panels.
 * ------------------------------------------------------------------ */
// Only the content tree is dashboard-specific; the settings/dimensions/labels
// scaffolding is shared via window.defaultGoldenLayoutConfig (see
// ../js/golden-layout-default.js, loaded before this file).
const DEFAULT_CONFIG = window.defaultGoldenLayoutConfig([{
  type: "row",
  content: [
      {
        type: "component",
        componentName: "iframe",
        title: "preview",
        componentState: { url: "preview.html", title: "preview" },
      },
      {
        type: "component",
        componentName: "iframe",
        title: "controls",
        componentState: { url: "controls.html", title: "controls" },
      },
      {
        type: "component",
        componentName: "iframe",
        title: "presets",
        componentState: { url: "presets.html", title: "presets" },
      },
    ],
  }]);

window.PANEL_FRAME_CONFIG = {
  storageKey: "shaders.goldenLayout.v1",
  brand: "◆ Shaders",
  docTitle: "Shaders · panel dashboard",
  addPlaceholder: "Search panel or paste URL",
  exportName: "shaders-layout",
  accent: "#4f9bff",      // match the shaders palette
  propagateHash: true,    // panels join this dashboard's broker room
  modules: MODULES,
  defaultConfig: DEFAULT_CONFIG,
};
