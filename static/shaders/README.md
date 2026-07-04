# Shader background (`shaders`)

A remote-controllable animated background built on [Paper Shaders](https://github.com/paper-design/shaders).
Pick any of the library's self-contained shaders, tweak every parameter live, and
show/hide it on the overlay — synced over the same broker as the rest of the project.

```
shaders/
├─ shaders.js            # shared shader registry + params→uniforms + mount helper
├─ presets.js            # official per-shader presets (generated, see scripts/gen-presets.js)
├─ bg.html               # the OVERLAY: full-screen shader, listens for state
└─ dashboard/
   └─ index.html         # the CONTROLLER: pick/tweak shader, live preview, Show/Hide
```

## Run

1. Start the static server (from the repo root): `python3 -m http.server 8080 -d static`
2. Open the controller: <http://localhost:8080/shaders/dashboard/>
3. Open the overlay (other screen / OBS): <http://localhost:8080/shaders/bg.html>

Both join broker room `bg/<password>` (password = URL hash, `demo` by default).
Override the transport with query params, e.g. `?gun=https://gun.filiphanes.sk/gun`,
`?ws=ws://localhost:8089/`, or `?broadcast=bg` (instant for two tabs on one machine).

> **OBS note:** add `bg.html` as a **BrowserSource via URL** (not "Local file").
> It loads the shader from `esm.sh` through ES modules, which requires http(s).

## How it works

- `dashboard/index.html` is the source of truth. It serializes the whole config
  `{ shader, speed, params, sizing }` to a JSON string and publishes it on the
  `config` broker key; visibility goes on the `show` key.
- `bg.html` only listens. On a shader change it rebuilds the `ShaderMount`; on
  parameter changes it calls `setUniforms`; on hide it fades out and pauses the
  animation (`setSpeed(0)`) to save GPU.
- Both pages share `shaders.js`, which imports `@paper-design/shaders@0.0.77`
  straight from `esm.sh` (no build step) and holds the per-shader parameter
  definitions, defaults, ranges, and the params→uniforms conversion.

## Features

- **Shader + presets panel (column 1)** — the shader selector is a list with one
  shader per row, and the official *Look* presets + *Your presets* sit right
  below it as horizontally-scrolling thumbnail strips. Every tile uses the
  rendered preview as its background with a white-on-black-shadow label, so you
  pick by sight in one click. Thumbnails are rendered once per config, cached,
  and generated lazily (IntersectionObserver) + one at a time (stays under the
  browser's WebGL context limit).
- **Presets** — *Look* shows the official per-shader presets from
  `shaders.paper.design` (90 of them, see `presets.js`) as click-to-apply buttons
  that highlight the active one. *Your presets* are global (any shader), saved to
  `localStorage` as buttons with a one-click delete — type a name and hit
  *Save current*.
- **Hideable preview** — the dashboard's live preview can be turned off (button
  on the preview caption); it disposes the WebGL context to save battery and
  remembers the choice. The overlay is unaffected.
- Every parameter auto-gets a slider / color picker (with alpha) / color-stop
  list / dropdown / checkbox from its `type` — no per-shader UI work.

## Included shaders (20)

All animated background / pattern shaders that render without an input image:

`meshGradient`, `smokeRing`, `neuroNoise`, `dotOrbit`, `dotGrid`, `simplexNoise`,
`metaballs`, `perlinNoise`, `voronoi`, `waves`, `warp`, `godRays`, `spiral`,
`swirl`, `dithering`, `grainGradient`, `pulsingBorder`, `colorPanels`,
`staticMeshGradient`, `staticRadialGradient`.

The image-filter shaders (`water`, `flutedGlass`, `halftoneDots`, `halftoneCmyk`,
`imageDithering`, `liquidMetal`, `heatmap`, `gemSmoke`, `paperTexture`) need an
input image and are intentionally omitted — add them to `SHADERS` in `shaders.js`
(an `image` param + `u_image` uniform) if you want them.

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
  params: [ N(key,label,min,max,step,def), C(key,label,def), CA(key,label,arr,max),
            S(key,label,"EnumName",def), B(key,label,def), I(key,label,min,max,def) ] }
```

The controller auto-generates a slider / color picker / color list / dropdown /
checkbox for each param from its `type`, so no UI work is needed.
