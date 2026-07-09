/* panel-frame.js — the shared Golden Layout panel-dashboard framework.
 *
 * A "panel dashboard" is a toolbar + a Golden Layout area whose panels are
 * iframes that load any page from this project (see the dashboard's module
 * catalog) or an arbitrary URL. The whole layout (structure + each panel's URL)
 * is auto-saved to localStorage and restored.
 *
 * Each dashboard supplies its config on window.PANEL_FRAME_CONFIG before this
 * script loads:
 *   {
 *     storageKey,      // localStorage key for the saved layout
 *     brand,           // toolbar label
 *     docTitle?,       // sets document.title if given
 *     addPlaceholder?, // the combobox placeholder
 *     accent?,         // overrides --pf-accent (e.g. "#4f9bff")
 *     propagateHash?,  // true → also append this page's location.search to
 *                      //   panel iframe srcs (so embedded pages join the same
 *                      //   broker room/transport). location.hash is always
 *                      //   carried to relative iframe srcs regardless of this
 *                      //   flag. Only relative URLs are augmented.
 *     modules,         // catalog groups [{ group, items: [{ name, url }] }]
 *     defaultConfig,   // Golden Layout config used on first run / reset
 *   }
 *
 * Dependencies (loaded beforehand, vendored under static/vendor/):
 *   jQuery 3.7.1          — required by Golden Layout 1.x
 *   Golden Layout 1.5.9   — panel / dock manager
 */
"use strict";
(function () {
  const CFG = window.PANEL_FRAME_CONFIG;
  if (!CFG) {
    console.error("panel-frame: window.PANEL_FRAME_CONFIG is not set");
    return;
  }

  if (CFG.accent) {
    document.documentElement.style.setProperty("--pf-accent", CFG.accent);
  }
  if (CFG.docTitle) document.title = CFG.docTitle;
  if (CFG.brand) {
    const b = document.querySelector(".brand");
    if (b) b.textContent = CFG.brand;
  }
  if (CFG.addPlaceholder) {
    const i = document.getElementById("addInput");
    if (i) i.placeholder = CFG.addPlaceholder;
  }

  // Flat, searchable view of the catalog.
  const FLAT = [];
  for (const mod of CFG.modules || []) {
    for (const it of mod.items) FLAT.push({ group: mod.group, name: it.name, url: it.url });
  }

  /* ------------------------------------------------------------------ *
   *  Helpers
   * ------------------------------------------------------------------ */

  // Derive a short tab title from a URL.
  function titleFromUrl(url) {
    if (!url) return "";
    let u = String(url).trim().split("#")[0].split("?")[0].replace(/\/+$/, "");
    if (!u) return "";
    const parts = u.split("/").filter(Boolean);
    const seg = parts[parts.length - 1] || "";
    if (!seg) return "index";
    if (seg === "index.html") {
      // use the containing folder name (../song/index.html → song)
      return parts[parts.length - 2] || "index";
    }
    return seg.replace(/\.html?$/i, "");
  }

  // Carry this page's location.hash over to a panel iframe URL, and — when
  // propagateHash is on — its location.search too (so it joins the same broker
  // room/transport). External URLs and the case where there's nothing to carry
  // pass through untouched. Only relative URLs are augmented; the fragment is
  // always carried to them (a #fragment is client-side only, so it's harmless
  // and lets nested dashboards / pages share the same room).
  function withHashSearch(url) {
    const u = String(url || "");
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u; // external: leave alone
    if (!location.hash && (!CFG.propagateHash || !location.search)) return u;
    try {
      const out = new URL(u, location.href);
      if (location.hash && !out.hash) out.hash = location.hash;
      if (CFG.propagateHash && location.search) {
        const ps = new URLSearchParams(location.search);
        for (const [k, v] of ps) if (!out.searchParams.has(k)) out.searchParams.set(k, v);
      }
      return out.pathname + out.search + out.hash;
    } catch (e) {
      return u;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Persistence
   * ------------------------------------------------------------------ */
  const STORAGE_KEY = CFG.storageKey;
  const statusEl = document.getElementById("status");
  let saveTimer = null;

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function saveLayout() {
    if (!myLayout) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(myLayout.toConfig()));
      setStatus("saved ✓");
    } catch (e) {
      setStatus("save error", "error");
      console.error("panel-frame: failed to save layout", e);
    }
  }

  function scheduleSave() {
    setStatus("saving…", "dirty");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLayout, 400);
  }

  function loadSavedConfig() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const cfg = JSON.parse(raw);
      if (cfg && (cfg.content || cfg.root)) return cfg;
    } catch (e) {
      console.warn("panel-frame: saved layout was corrupt, ignoring", e);
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   *  Golden Layout setup
   * ------------------------------------------------------------------ */
  let myLayout = null;
  const layoutEl = document.getElementById("layout");

  function initLayout() {
    if (typeof GoldenLayout === "undefined") {
      const fatal = document.getElementById("fatal");
      fatal.style.display = "block";
      fatal.textContent =
        "Golden Layout failed to load.\n" +
        "Check that static/vendor/golden-layout is present and reload.";
      return;
    }

    const config = loadSavedConfig() || CFG.defaultConfig;
    myLayout = new GoldenLayout(config, layoutEl);

    // The single component type: an iframe filling the panel. No URL input per
    // panel — URLs are set from the toolbar combobox and persisted in
    // componentState (the raw URL; hash/search is applied at navigation time).
    myLayout.registerComponent("iframe", function (container, state) {
      const url = (state && state.url) || "";
      const initialTitle = (state && state.title) || titleFromUrl(url) || "Panel";

      const $wrapper = $('<div class="dash-panel"></div>');
      const $frame = $('<iframe class="dash-frame" allow="autoplay; fullscreen; clipboard-write" allowfullscreen loading="lazy"></iframe>');
      $wrapper.append($frame);
      container.getElement().append($wrapper);

      // `booting` avoids triggering a layout save storm while restoring.
      let booting = true;

      function navigate(rawUrl) {
        const val = String(rawUrl || "").trim();
        $frame.attr("src", withHashSearch(val));
        const t = titleFromUrl(val) || "Panel";
        container.setTitle(t);
        if (!booting) container.setState({ url: val, title: t }); // stateChanged → save
      }

      if (url) {
        navigate(url);
      } else {
        container.setTitle(initialTitle);
      }
      booting = false;
    });

    myLayout.on("stateChanged", scheduleSave);
    myLayout.init();
    setStatus("ready");
  }

  /* ------------------------------------------------------------------ *
   *  Adding panels
   * ------------------------------------------------------------------ */

  function addItem(itemConfig) {
    if (!myLayout) return;
    let parent = myLayout.root.contentItems[0];
    if (!parent) {
      // Everything was closed — seed a fresh row containing the new item.
      myLayout.root.addChild({ type: "row", content: [itemConfig] });
      return;
    }
    parent.addChild(itemConfig);
  }

  function addPanel(url, title) {
    const u = String(url || "").trim();
    const t = title || titleFromUrl(u) || "Panel";
    addItem({
      type: "component",
      componentName: "iframe",
      title: t,
      componentState: { url: u, title: t },
    });
  }

  /* ------------------------------------------------------------------ *
   *  Add-panel combobox: search existing modules OR paste a custom URL.
   *  - click a result  → add that module
   *  - Enter            → add the highlighted result, or the typed value as a URL
   * ------------------------------------------------------------------ */
  const addInput = document.getElementById("addInput");
  const addBtn = document.getElementById("addBtn");
  const resultsEl = document.getElementById("addResults");
  let highlight = -1;
  let blurTimer = null;

  function filterModules(query) {
    const q = query.trim().toLowerCase();
    if (!q) return FLAT.slice(0, 60);
    return FLAT.filter((it) =>
      it.name.toLowerCase().includes(q) ||
      it.url.toLowerCase().includes(q) ||
      it.group.toLowerCase().includes(q)
    ).slice(0, 60);
  }

  function renderResults(items) {
    resultsEl.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No module matches — type a URL and press Enter to add it.";
      resultsEl.append(li);
      resultsEl.hidden = false;
      highlight = -1;
      return;
    }
    for (const it of items) {
      const li = document.createElement("li");
      li.dataset.url = it.url;
      li.dataset.name = it.name;
      const name = document.createElement("span");
      name.className = "cr-name";
      name.textContent = it.name;
      const meta = document.createElement("span");
      meta.className = "cr-meta";
      meta.textContent = it.group + " · " + it.url;
      li.append(name, meta);
      resultsEl.append(li);
    }
    resultsEl.hidden = false;
    highlight = -1;
  }

  function openResults() {
    clearTimeout(blurTimer);
    renderResults(filterModules(addInput.value));
  }

  function closeResults() {
    resultsEl.hidden = true;
    highlight = -1;
  }

  function setHighlight(idx) {
    const lis = resultsEl.querySelectorAll("li:not(.empty)");
    if (!lis.length) { highlight = -1; return; }
    highlight = (idx + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle("active", i === highlight));
    lis[highlight].scrollIntoView({ block: "nearest" });
  }

  function activeResult() {
    if (highlight < 0) return null;
    const lis = resultsEl.querySelectorAll("li:not(.empty)");
    return lis[highlight] || null;
  }

  // True when the typed text should be treated as a URL rather than a search
  // term (has a scheme, a path slash, a relative-path prefix, or looks like a
  // domain/file — and contains no whitespace).
  function looksLikeUrl(v) {
    if (!v) return false;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return true;        // scheme://
    if (v.startsWith("/") || v.startsWith("./") || v.startsWith("../")) return true;
    if (/\s/.test(v)) return false;                              // whitespace → search term
    if (v.includes("/")) return true;                            // any path slash
    return /^[^\s/]+\.[^\s/]+$/.test(v);                          // domain.tld / file.ext
  }

  function commitAdd() {
    const val = addInput.value.trim();
    if (!val) return;

    const active = activeResult();
    if (active) {
      // A result was highlighted with arrow keys → add it.
      addPanel(active.dataset.url, active.dataset.name);
    } else if (looksLikeUrl(val)) {
      // Typed text looks like a URL → add as custom URL (or exact module match).
      const m = FLAT.find((it) => it.url === val);
      addPanel(val, m ? m.name : titleFromUrl(val));
    } else {
      // Plain search term → add the top match, if any.
      const items = filterModules(val);
      if (!items.length) return;
      addPanel(items[0].url, items[0].name);
    }

    addInput.value = "";
    openResults(); // refresh list, keep open for rapid adding
    addInput.focus();
  }

  addInput.addEventListener("focus", openResults);
  addInput.addEventListener("input", openResults);
  addInput.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultsEl.hidden) openResults();
      setHighlight(highlight + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(highlight - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitAdd();
    } else if (e.key === "Escape") {
      closeResults();
      addInput.blur();
    }
  });
  addInput.addEventListener("blur", function () {
    blurTimer = setTimeout(closeResults, 150);
  });

  // Keep focus on the input when clicking results / the Add button so the
  // blur-close timer doesn't race with the click.
  resultsEl.addEventListener("mousedown", function (e) { e.preventDefault(); });
  resultsEl.addEventListener("click", function (e) {
    const li = e.target.closest("li:not(.empty)");
    if (!li) return;
    addPanel(li.dataset.url, li.dataset.name);
    addInput.value = "";
    openResults();
    addInput.focus();
  });
  addBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
  addBtn.addEventListener("click", commitAdd);

  /* ------------------------------------------------------------------ *
   *  Export / Import / Reset
   * ------------------------------------------------------------------ */

  document.getElementById("resetBtn").addEventListener("click", function () {
    if (!confirm("Reset to the default layout? Your saved layout will be cleared.")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  document.getElementById("exportBtn").addEventListener("click", function () {
    if (!myLayout) return;
    const json = JSON.stringify(myLayout.toConfig(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (CFG.exportName || "panel-layout") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById("importBtn").addEventListener("click", function () {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const cfg = JSON.parse(reader.result);
        if (!cfg || (!cfg.content && !cfg.root)) {
          throw new Error("missing `content`");
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        location.reload();
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-importing the same file
  });

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */
  // Golden Layout sizes itself against its container, so wait for layout.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLayout);
  } else {
    initLayout();
  }

  // Re-measure on window resize (GL does this, but be explicit for container mode).
  window.addEventListener("resize", function () {
    if (myLayout) myLayout.updateSize();
  });

  // Expose a tiny API for debugging / programmatic adds (e.g. from the console).
  window.panelFrame = { addPanel, layout: () => myLayout };
})();
