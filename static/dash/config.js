/* dash/config.js — the Dash panel dashboard's config for the shared
   panel-frame.js framework (see ../js/panel-frame.js).
 *
 * - modules:  the catalog of project dashboards / graphics pages, searched by
 *             the add-panel combobox. Paths are relative to this file
 *             (static/dash/), so ../song/…
 * - defaultConfig: the Golden Layout config used on first run / reset.
 *
 * Load this BEFORE ../js/panel-frame.js. */
"use strict";

/* ------------------------------------------------------------------ *
 *  Catalog of project dashboards / graphics pages.
 *  Add / edit freely — these are searched by the add-panel combobox.
 * ------------------------------------------------------------------ */
const MODULES = [
  { group: "Song", items: [
    { name: "Controller",        url: "../song/index.html" },
    { name: "Songs",             url: "../song/songs.html" },
    { name: "Lists",             url: "../song/lists.html" },
    { name: "Verses",            url: "../song/verses.html" },
    { name: "Verse",            url: "../song/graphics/verse.html" },
    { name: "Full (HTML)",       url: "../song/graphics/full.html" },
    { name: "Main (text)",       url: "../song/graphics/main.html" },
    { name: "Stage",             url: "../song/graphics/stage.html" },
    { name: "Stage pro",         url: "../song/graphics/stage-pro.html" },
    { name: "Stage pro + list",  url: "../song/graphics/stage-pro-list.html" },
    { name: "Tablet",            url: "../song/graphics/tablet.html" },
    { name: "Zlaté písmená",     url: "../song/graphics/zlate-pismena.html" },
    { name: "Stage timers",      url: "../song/graphics/stage-timers.html" },
    { name: "Odpočet",         url: "../song/graphics/odpocet.html" },
    { name: "Odpočet (veľký)", url: "../song/graphics/odpocet-velky.html" },
    { name: "Test",              url: "../song/graphics/test.html" },
  ]},
  { group: "Bible", items: [
    { name: "Controller",    url: "../bible/" },
    { name: "Overlay gun",   url: "../bible/overlay.html" },
    { name: "Overlay ws",    url: "../bible/overlay-ws.html" },
    { name: "Full diagonal", url: "../bible/full-diagonal.html" },
  ]},
  { group: "Shaders", items: [
    { name: "Panel dashboard",        url: "../shaders/index.html" },
    { name: "Controller (all-in-one)", url: "../shaders/controller.html" },
    { name: "Preview",                url: "../shaders/preview.html" },
    { name: "Presets",                url: "../shaders/presets.html" },
    { name: "Controls",               url: "../shaders/controls.html" },
    { name: "Full",                   url: "../shaders/full.html" },
  ]},
  { group: "Lower third", items: [
    { name: "Controller",   url: "../lowerthird/" },
    { name: "Overlay gun",  url: "../lowerthird/overlay.html" },
    { name: "Right corner", url: "../lowerthird/right-corner.html" },
  ]},
  { group: "Scoreboard", items: [
    { name: "Controller",  url: "../scoreboard/" },
    { name: "Overlay gun", url: "../scoreboard/overlay.html" },
  ]},
  { group: "Clock", items: [
    { name: "Clock",     url: "../clock/" },
    { name: "Countdown", url: "../countdown/" },
  ]},
  { group: "Editor", items: [
    { name: "Editor",     url: "../editor/" },
    { name: "Overlay ws", url: "../editor/overlay-ws.html" },
  ]},
];

/* ------------------------------------------------------------------ *
 *  Default layout (first run / reset). Only the content tree is
 *  dashboard-specific; the settings/dimensions/labels scaffolding is
 *  shared via window.defaultGoldenLayoutConfig (see
 *  ../js/golden-layout-default.js, loaded before this file).
 * ------------------------------------------------------------------ */
const DEFAULT_CONFIG = window.defaultGoldenLayoutConfig([{
  type: "row",
  content: [
      // Song controller, flattened (avoids nesting ../song/index.html,
      // which is itself a Golden Layout dashboard — double toolbar).
      {
        type: "row",
        content: [
          {
            type: "component",
            componentName: "iframe",
            title: "songs",
            componentState: { url: "../song/songs.html", title: "songs" },
          },
          {
            type: "component",
            componentName: "iframe",
            title: "lists",
            componentState: { url: "../song/lists.html", title: "lists" },
          },
          {
            type: "component",
            componentName: "iframe",
            title: "verses",
            componentState: { url: "../song/verses.html", title: "verses" },
          },
        ],
      },
      {
        type: "column",
        content: [
          {
            type: "component",
            componentName: "iframe",
            title: "verse",
            componentState: { url: "../song/graphics/verse.html", title: "verse" },
          },
          {
            type: "component",
            componentName: "iframe",
            title: "stage",
            componentState: { url: "../song/graphics/stage.html", title: "stage" },
          },
        ],
      },
    ],
  }]);

window.PANEL_FRAME_CONFIG = {
  storageKey: "dash.goldenLayout.v1",
  brand: "◼ Dash",
  docTitle: "Dash · panel framework",
  addPlaceholder: "Search module or URL",
  exportName: "dash-layout",
  modules: MODULES,
  defaultConfig: DEFAULT_CONFIG,
};
