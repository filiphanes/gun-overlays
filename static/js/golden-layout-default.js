/* golden-layout-default.js — shared Golden Layout 1.5.x config scaffolding.
 *
 * Every panel dashboard (dash/, shaders/, …) builds its DEFAULT_CONFIG from the
 * same settings / dimensions / labels and only differs in the `content` tree.
 * Load this plain <script> BEFORE your dashboard's config.js, then call:
 *
 *   const DEFAULT_CONFIG = window.defaultGoldenLayoutConfig([ …your content… ]);
 *
 * The returned settings match Golden Layout 1.5.9's sensible defaults (headers
 * on, drag-reorder on, popout/maximise/close icons visible) so every dashboard
 * behaves identically and the copy-pasted ~30-line block is gone.
 */
"use strict";
(function () {
  function defaultGoldenLayoutConfig(content) {
    return {
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
      content: content,
    };
  }

  window.defaultGoldenLayoutConfig = defaultGoldenLayoutConfig;
})();