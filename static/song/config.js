/* song/config.js — the Song controller panel dashboard's config
   for the shared panel-frame.js framework (see ../js/panel-frame.js).
 *
 * This dashboard arranges the song controller's split pages (songs / lists /
 * verses) using Golden Layout, the same way ../shaders/index.html arranges
 * the shader split pages. The pages already sync state between themselves.
 *
 * Paths are relative to this file (static/song/), so songs.html, …
 * Load this BEFORE ../js/panel-frame.js. */
"use strict";

/* ------------------------------------------------------------------ *
 *  Catalog of song controller pages (searched by the add-panel combobox).
 * ------------------------------------------------------------------ */
const MODULES = [
  { group: "Song controller", items: [
    { name: "Songs",  url: "songs.html" },
    { name: "Lists",  url: "lists.html" },
    { name: "Verses", url: "verses.html" },
  ]},
];

/* ------------------------------------------------------------------ *
 *  Default layout (first run / reset): the Songs picker on the left, the
 *  Lists in the middle, and the Verses on the right. Tweak freely or add
 *  more panels.
 * ------------------------------------------------------------------ */
const DEFAULT_CONFIG = {
  settings: {
    hasHeaders: true,
    constrainDragToContainer: false,
    reorderEnabled: true,
    selectionEnabled: false,
    popoutWholeStack: false,
    blockedPopoutsThrowError: true,
    closePopoutsOnUnload: true,
    showPopoutIcon: true,
    showMaximiseIcon: true,
    showCloseIcon: true,
  },
  dimensions: {
    borderWidth: 5,
    minItemHeight: 80,
    minItemWidth: 80,
    headerHeight: 22,
    dragProxyWidth: 300,
    dragProxyHeight: 200,
  },
  labels: {
    close: "close",
    maximise: "maximise",
    minimise: "minimise",
    popout: "open in new window",
  },
  content: [{
    type: "row",
    content: [
      {
        type: "component",
        componentName: "iframe",
        title: "songs",
        componentState: { url: "songs.html", title: "songs" },
      },
      {
        type: "component",
        componentName: "iframe",
        title: "lists",
        componentState: { url: "lists.html", title: "lists" },
      },
      {
        type: "component",
        componentName: "iframe",
        title: "verses",
        componentState: { url: "verses.html", title: "verses" },
      },
    ],
  }],
};

window.PANEL_FRAME_CONFIG = {
  storageKey: "song.dashboard.goldenLayout.v1",
  brand: "◆ Song",
  docTitle: "Song · controller dashboard",
  addPlaceholder: "Search panel or paste URL",
  exportName: "song-dashboard-layout",
  accent: "#ffd66b",      // echo GL's selected gold
  modules: MODULES,
  defaultConfig: DEFAULT_CONFIG,
};
