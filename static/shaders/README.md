# Shader background (`shaders`)

A remote-controllable animated background built on [Paper Shaders](https://github.com/paper-design/shaders).
Pick any of the library's self-contained shaders, tweak every parameter live, and
show/hide it on the overlay — synced over the same broker as the rest of the project.

```
shaders/
├─ shaders.js            # shared shader registry + params→uniforms + mount helper
├─ presets.js            # official per-shader presets (generated, see scripts/gen-presets.js)
├─ full.html             # the PROGRAM overlay: full-screen shader, listens for state
├─ preview.html          # listen-only live preview of the PREVIEW config
├─ presets.html          # split panel: Looks + your saved presets
├─ controls.html         # split panel: params + transform + Show/Hide/Go/Live
└─ index.html            # the all-in-one CONTROLLER: preview + presets + controls
```

## Run

1. Start the static server (from the repo root): `python3 -m http.server 8080 -d static`
2. Open the controller: <http://localhost:8080/shaders/>
3. Open the program overlay (other screen / OBS): <http://localhost:8080/shaders/full.html>

All pages join broker room `bg/<password>` (password = URL hash, `demo` by default).
Override the transport with query params, e.g. `?gun=https://gun.filiphanes.sk/gun`,
`?ws=ws://localhost:8089/`, or `?broadcast=bg` (instant for two tabs on one machine).

> **OBS note:** add `full.html` as a **BrowserSource via URL** (not "Local file").
> It uses ES modules, which must be served over http(s) — but the shader library
> itself is now vendored locally, so it runs fully offline once loaded.

## How it works

There are two config channels on the broker plus a visibility flag:

- `preview` — the config the operator is shaping right now (shown in `preview.html`
  and the dashboard's live preview).
- `program` — the config currently "on air" in `full.html`.
- `live` — when true, every edit to `preview` is also pushed to `program`.
- `show` — overlay visibility (`Show`/`Hide` buttons).

`controls.html` (and `index.html`) own the preview config: each parameter edit
publishes it to `preview`. The **Go** button copies the current preview to
`program` (so it appears in `full.html`); the **Live** checkbox makes every edit
push to `program` immediately. `full.html` only listens to `program` + `show`: on
a shader change it rebuilds the `ShaderMount`; on parameter changes it calls
`setUniforms`; on hide it fades out and pauses the animation (`setSpeed(0)`) to
save GPU. `presets.html` publishes a chosen Look to `preview` (`program` too
when Live is on).
- Both pages share `shaders.js`, which imports `@paper-design/shaders@0.0.77`
  from a **locally vendored copy** (`static/vendor/@paper-design/shaders/0.0.77/`) —
  no CDN, fully offline, no build step. It holds the per-shader parameter
  definitions, defaults, ranges, and the params→uniforms conversion.

## Features

- **Shader + presets panel (column 1)** — the official *Look* presets + *Your
  presets* sit as 4-wide 16:9 thumbnail grids. Every tile uses the rendered
  preview as its background with a white-on-black-shadow label, so you pick by
  sight in one click. Thumbnails are rendered once per config, cached, and
  generated lazily (IntersectionObserver) + one at a time (stays under the
  browser's WebGL context limit). Shaders without official presets (the image
  filters) still show a synthetic *Default* tile so they're selectable.
- **Image filters** — `water`, `flutedGlass`, `imageDithering`, `halftoneDots`,
  `halftoneCmyk`, `paperTexture` filter an image loaded from a URL. The image
  URL is a normal parameter (with a Load button + thumbnail); any host that
  sends CORS headers works. Like any other look, the result is **saveable as a
  preset** (the URL is stored with the preset).
- **Speed + actions** — a full-width speed slider (0–15) sits above a single
  row of action buttons. The all-in-one dashboard has **Reset** (defaults),
  **🎲 Random** (randomize the current shader's parameters — colors get a
  vibrant random hue, the image URL is left untouched), **Hide**, **Show**,
  **Go**, **Live**. The split `controls.html` panel keeps just **Hide**, **Show**,
  **Go**, **Live** for a compact panel.
- **Presets** — *Look* shows the official per-shader presets from
  `shaders.paper.design` (90 of them, see `presets.js`) as click-to-apply buttons
  that highlight the active one. *Your presets* are global (any shader), saved to
  `localStorage` as buttons with a one-click delete — type a name and hit
  *Save current*.
- **Transparent checkerboard preview** — the live preview shows a classic
  transparency checkerboard behind the shader, so shaders/looks with a
  transparent background composite visibly.
- **Hideable preview** — the dashboard's live preview can be turned off (button
  on the preview caption); it disposes the WebGL context to save battery and
  remembers the choice. The overlay is unaffected.
- Every parameter auto-gets a slider / color picker (with alpha) / color-stop
  list / dropdown / checkbox / image-URL field from its `type` — no per-shader
  UI work.

## Included shaders (26)

20 animated background / pattern shaders that render without an input image:

`meshGradient`, `smokeRing`, `neuroNoise`, `dotOrbit`, `dotGrid`, `simplexNoise`,
`metaballs`, `perlinNoise`, `voronoi`, `waves`, `warp`, `godRays`, `spiral`,
`swirl`, `dithering`, `grainGradient`, `pulsingBorder`, `colorPanels`,
`staticMeshGradient`, `staticRadialGradient`.

6 image-filter shaders that filter an image loaded from a URL:

`water`, `flutedGlass`, `imageDithering`, `halftoneDots`, `halftoneCmyk`,
`paperTexture`. (The library also ships `heatmap`, `liquidMetal`, `gemSmoke`,
which need image *preprocessing* — not wired up here.)

## Vendoring / updating `@paper-design/shaders`

The library is vendored for fully offline use under
`static/vendor/@paper-design/shaders/0.0.77/` (the package's `dist/` ESM build, which
has only relative imports — no bundler needed). **The vendored copy is trimmed**
to only what this module uses: the `.d.ts` / `.js.map` build artifacts and the
three unused image-preprocessing shaders (`heatmap`, `liquid-metal`, `gem-smoke`)
are removed, and `index.js` is a minimal barrel re-exporting only the symbols
`shaders.js` imports. To update it:

```bash
npm pack @paper-design/shaders@<version>          # download the tarball
tar xzf paper-design-shaders-<version>.tgz        # extracts package/dist
rm -rf static/vendor/@paper-design/shaders/<old-version>
cp -r package/dist static/vendor/@paper-design/shaders/<version>
# then bump the import path in shaders.js to match
# …then re-apply the trim:
cd static/vendor/@paper-design/shaders/<version>
find . -name '*.d.ts' -delete                     # TS declarations: unused at runtime
find . -name '*.js.map' -delete                    # source maps: optional, drop to save space
rm -f shaders/heatmap.js shaders/liquid-metal.js shaders/gem-smoke.js
rm -f empty-pixel.js shader-color-spaces.js types.js
# now hand-edit index.js to drop imports/exports of the removed modules
```

## Updating the official presets

`static/shaders/presets.js` is generated from the library's React preset
definitions (the `shaders.paper.design` looks). Regenerate after bumping the
library version or adding a shader:

```bash
node scripts/gen-presets.js
```

It re-downloads each shader `.tsx` from GitHub, extracts every preset, and
rewrites `presets.js`. The pulsing-border `margin` shorthand is expanded to the
four sides to match the library's behavior.

## Adding / changing shaders

Edit `SHADERS` in `shaders.js`. Each entry is:

```js
{ id, label, base: "object" | "pattern", sizing: {…overrides}, noise: bool, speed,
  frag: <fragmentShader>,
  // optional, for image filters:
  image: true, mipmaps: ["u_image"],
  params: [ N(key,label,min,max,step,def), C(key,label,def), CA(key,label,arr,max),
            S(key,label,"EnumName",def), B(key,label,def), I(key,label,min,max,def),
            IMG(defaultUrl) ] }
```

The controller auto-generates a slider / color picker / color list / dropdown /
checkbox / image-URL field for each param from its `type`, so no UI work is
needed.
