// Shared registry + helpers for the Paper Shaders background module.
//
// Imports the vanilla `@paper-design/shaders` build straight from a CDN
// (esm.sh), so this whole module stays build-free. Both bg.html (the overlay)
// and dashboard/index.html (the controller) import from here.
//
// Covers every self-contained background / pattern shader in the library.
// Image-filter shaders (water, fluted-glass, halftone-*, image-dithering,
// liquid-metal, heatmap, gem-smoke, paper-texture) need an input image and are
// intentionally left out — they don't make sense as a pure generated bg.

import {
  ShaderMount,
  ShaderFitOptions,
  defaultObjectSizing,
  defaultPatternSizing,
  getShaderColorFromString,
  getShaderNoiseTexture,
  meshGradientFragmentShader,
  smokeRingFragmentShader,
  neuroNoiseFragmentShader,
  dotOrbitFragmentShader,
  dotGridFragmentShader,
  simplexNoiseFragmentShader,
  metaballsFragmentShader,
  perlinNoiseFragmentShader,
  voronoiFragmentShader,
  wavesFragmentShader,
  warpFragmentShader,
  godRaysFragmentShader,
  spiralFragmentShader,
  swirlFragmentShader,
  ditheringFragmentShader,
  grainGradientFragmentShader,
  pulsingBorderFragmentShader,
  colorPanelsFragmentShader,
  staticMeshGradientFragmentShader,
  staticRadialGradientFragmentShader,
  DotGridShapes,
  DitheringShapes,
  DitheringTypes,
  GrainGradientShapes,
  WarpPatterns,
  PulsingBorderAspectRatios,
} from "https://esm.sh/@paper-design/shaders@0.0.77";

// Re-export the enum objects so the controller can build <select> options.
export const ENUMS = {
  DotGridShapes,
  DitheringShapes,
  DitheringTypes,
  GrainGradientShapes,
  WarpPatterns,
  PulsingBorderAspectRatios,
};
export { ShaderFitOptions };

// ---- param spec builders (kept tiny so the registry reads top-to-bottom) ----
const N = (key, label, min, max, step, def, extra = {}) =>
  ({ key, label, type: "number", min, max, step, def, ...extra });
const I = (key, label, min, max, def) => ({ key, label, type: "number", min, max, step: 1, def });
const C = (key, label, def) => ({ key, label, type: "color", def });
const CA = (key, label, def, max) => ({ key, label, type: "colors", def, max });
const B = (key, label, def) => ({ key, label, type: "boolean", def });
const S = (key, label, enumName, def) => ({ key, label, type: "select", enum: enumName, def });

// base: "object" (defaultObjectSizing, fit:contain) | "pattern" (defaultPatternSizing, fit:none)
// sizing: per-shader overrides merged onto the base sizing defaults
// noise:  whether the shader needs the shared noise texture
// speed:  default animation speed (0 = static)
// params: ordered list of controllable params (defaults baked into each spec)
export const SHADERS = [
  {
    id: "meshGradient", label: "Mesh Gradient", base: "object", sizing: {}, noise: false, speed: 1,
    frag: meshGradientFragmentShader,
    params: [
      CA("colors", "Colors", ["#e0eaff", "#241d9a", "#f75092", "#9f50d3"], 10),
      N("distortion", "Distortion", 0, 1, 0.01, 0.8),
      N("swirl", "Swirl", 0, 1, 0.01, 0.1),
      N("grainMixer", "Grain mixer", 0, 1, 0.01, 0),
      N("grainOverlay", "Grain overlay", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "smokeRing", label: "Smoke Ring", base: "object", sizing: { scale: 0.8 }, noise: true, speed: 0.5,
    frag: smokeRingFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#ffffff"], 10),
      N("noiseScale", "Noise scale", 0, 10, 0.05, 3),
      I("noiseIterations", "Noise iterations", 1, 8, 8),
      N("radius", "Radius", 0, 1, 0.01, 0.25),
      N("thickness", "Thickness", 0, 1, 0.01, 0.65),
      N("innerShape", "Inner shape", 0, 4, 0.01, 0.7),
    ],
  },
  {
    id: "neuroNoise", label: "Neuro Noise", base: "pattern", sizing: {}, noise: false, speed: 1,
    frag: neuroNoiseFragmentShader,
    params: [
      C("colorFront", "Front", "#ffffff"),
      C("colorMid", "Mid", "#47a6ff"),
      C("colorBack", "Background", "#000000"),
      N("brightness", "Brightness", 0, 1, 0.01, 0.05),
      N("contrast", "Contrast", 0, 1, 0.01, 0.3),
    ],
  },
  {
    id: "dotOrbit", label: "Dot Orbit", base: "pattern", sizing: {}, noise: true, speed: 1.5,
    frag: dotOrbitFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#ffc96b", "#ff6200", "#ff2f00", "#421100", "#1a0000"], 40),
      N("size", "Size", 0, 1, 0.01, 1),
      N("sizeRange", "Size range", 0, 1, 0.01, 0),
      N("spreading", "Spreading", 0, 1, 0.01, 1),
      I("stepsPerColor", "Steps per color", 1, 20, 4),
    ],
  },
  {
    id: "dotGrid", label: "Dot Grid", base: "pattern", sizing: {}, noise: false, speed: 0,
    frag: dotGridFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      C("colorFill", "Fill", "#ffffff"),
      C("colorStroke", "Stroke", "#ffaa00"),
      N("size", "Dot size", 0, 50, 0.5, 2),
      N("gapX", "Gap X", 0, 200, 1, 32),
      N("gapY", "Gap Y", 0, 200, 1, 32),
      N("strokeWidth", "Stroke width", 0, 10, 0.1, 0),
      N("sizeRange", "Size range", 0, 1, 0.01, 0),
      N("opacityRange", "Opacity range", 0, 1, 0.01, 0),
      S("shape", "Shape", "DotGridShapes", "circle"),
    ],
  },
  {
    id: "simplexNoise", label: "Simplex Noise", base: "pattern", sizing: { scale: 0.6 }, noise: false, speed: 0.5,
    frag: simplexNoiseFragmentShader,
    params: [
      CA("colors", "Colors", ["#4449CF", "#FFD1E0", "#F94446", "#FFD36B", "#FFFFFF"], 10),
      I("stepsPerColor", "Steps per color", 1, 20, 2),
      N("softness", "Softness", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "metaballs", label: "Metaballs", base: "object", sizing: {}, noise: true, speed: 1,
    frag: metaballsFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#6e33cc", "#ff5500", "#ffc105", "#ffc800", "#f585ff"], 20),
      I("count", "Count", 1, 20, 10),
      N("size", "Size", 0, 2, 0.01, 0.83),
    ],
  },
  {
    id: "perlinNoise", label: "Perlin Noise", base: "pattern", sizing: {}, noise: false, speed: 0.5,
    frag: perlinNoiseFragmentShader,
    params: [
      C("colorBack", "Background", "#632ad5"),
      C("colorFront", "Front", "#fccff7"),
      N("proportion", "Proportion", 0, 1, 0.01, 0.35),
      N("softness", "Softness", 0, 1, 0.01, 0.1),
      I("octaveCount", "Octaves", 1, 8, 1),
      N("persistence", "Persistence", 0, 2, 0.01, 1),
      N("lacunarity", "Lacunarity", 0, 4, 0.01, 1.5),
    ],
  },
  {
    id: "voronoi", label: "Voronoi", base: "pattern", sizing: { scale: 0.5 }, noise: true, speed: 0.5,
    frag: voronoiFragmentShader,
    params: [
      CA("colors", "Colors", ["#ff8247", "#ffe53d"], 10),
      I("stepsPerColor", "Steps per color", 1, 20, 3),
      C("colorGlow", "Glow", "#ffffff"),
      C("colorGap", "Gap", "#2e0000"),
      N("distortion", "Distortion", 0, 1, 0.01, 0.4),
      N("gap", "Gap", 0, 1, 0.005, 0.04),
      N("glow", "Glow", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "waves", label: "Waves", base: "pattern", sizing: { scale: 0.6 }, noise: false, speed: 0,
    frag: wavesFragmentShader,
    params: [
      C("colorFront", "Front", "#ffbb00"),
      C("colorBack", "Background", "#000000"),
      I("shape", "Shape", 0, 6, 0),
      N("frequency", "Frequency", 0, 10, 0.01, 0.5),
      N("amplitude", "Amplitude", 0, 5, 0.01, 0.5),
      N("spacing", "Spacing", 0, 5, 0.01, 1.2),
      N("proportion", "Proportion", 0, 1, 0.01, 0.1),
      N("softness", "Softness", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "warp", label: "Warp", base: "pattern", sizing: {}, noise: true, speed: 1,
    frag: warpFragmentShader,
    params: [
      CA("colors", "Colors", ["#121212", "#9470ff", "#121212", "#8838ff"], 10),
      N("proportion", "Proportion", 0, 1, 0.01, 0.45),
      N("softness", "Softness", 0, 1, 0.01, 1),
      N("distortion", "Distortion", 0, 1, 0.01, 0.25),
      N("swirl", "Swirl", 0, 1, 0.01, 0.8),
      I("swirlIterations", "Swirl iterations", 1, 30, 10),
      N("shapeScale", "Shape scale", 0, 1, 0.01, 0.1),
      S("shape", "Pattern", "WarpPatterns", "checks"),
    ],
  },
  {
    id: "godRays", label: "God Rays", base: "object", sizing: { offsetX: 0, offsetY: -0.55 }, noise: true, speed: 0.75,
    frag: godRaysFragmentShader,
    params: [
      C("colorBloom", "Bloom", "#0000ff"),
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#a600ff6e", "#6200fff0", "#ffffff", "#33fff5"], 5),
      N("density", "Density", 0, 1, 0.01, 0.3),
      N("spotty", "Spotty", 0, 1, 0.01, 0.3),
      N("midIntensity", "Mid intensity", 0, 1, 0.01, 0.4),
      N("midSize", "Mid size", 0, 1, 0.01, 0.2),
      N("intensity", "Intensity", 0, 1, 0.01, 0.8),
      N("bloom", "Bloom", 0, 1, 0.01, 0.4),
    ],
  },
  {
    id: "spiral", label: "Spiral", base: "pattern", sizing: {}, noise: false, speed: 1,
    frag: spiralFragmentShader,
    params: [
      C("colorBack", "Background", "#001429"),
      C("colorFront", "Front", "#79D1FF"),
      N("density", "Density", 0, 10, 0.05, 1),
      N("distortion", "Distortion", 0, 1, 0.01, 0),
      N("strokeWidth", "Stroke width", 0, 1, 0.01, 0.5),
      N("strokeTaper", "Stroke taper", 0, 1, 0.01, 0),
      N("strokeCap", "Stroke cap", 0, 1, 0.01, 0),
      N("noise", "Noise", 0, 1, 0.01, 0),
      N("noiseFrequency", "Noise frequency", 0, 10, 0.01, 0),
      N("softness", "Softness", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "swirl", label: "Swirl", base: "object", sizing: {}, noise: false, speed: 0.32,
    frag: swirlFragmentShader,
    params: [
      C("colorBack", "Background", "#330000"),
      CA("colors", "Colors", ["#ffd1d1", "#ff8a8a", "#660000"], 10),
      I("bandCount", "Band count", 1, 20, 4),
      N("twist", "Twist", 0, 1, 0.01, 0.1),
      N("center", "Center", 0, 1, 0.01, 0.2),
      N("proportion", "Proportion", 0, 1, 0.01, 0.5),
      N("softness", "Softness", 0, 1, 0.01, 0),
      N("noiseFrequency", "Noise frequency", 0, 10, 0.01, 0.4),
      N("noise", "Noise", 0, 1, 0.01, 0.2),
    ],
  },
  {
    id: "dithering", label: "Dithering", base: "pattern", sizing: { scale: 0.6 }, noise: false, speed: 1,
    frag: ditheringFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      C("colorFront", "Front", "#00b2ff"),
      S("shape", "Shape", "DitheringShapes", "sphere"),
      S("type", "Type", "DitheringTypes", "4x4"),
      // dithering's `size` param maps to the u_pxSize uniform (not u_size)
      { key: "size", label: "Size", type: "number", min: 0, max: 50, step: 1, def: 2, uniform: "pxSize" },
    ],
  },
  {
    id: "grainGradient", label: "Grain Gradient", base: "object", sizing: {}, noise: true, speed: 1,
    frag: grainGradientFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#7300ff", "#eba8ff", "#00bfff", "#2a00ff"], 10),
      N("softness", "Softness", 0, 1, 0.01, 0.5),
      N("intensity", "Intensity", 0, 1, 0.01, 0.5),
      N("noise", "Noise", 0, 1, 0.01, 0.25),
      S("shape", "Shape", "GrainGradientShapes", "corners"),
    ],
  },
  {
    id: "pulsingBorder", label: "Pulsing Border", base: "object", sizing: { scale: 0.6 }, noise: true, speed: 1,
    frag: pulsingBorderFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#0dc1fd", "#d915ef", "#ff3f2ecc"], 10),
      N("roundness", "Roundness", 0, 1, 0.01, 0.25),
      N("thickness", "Thickness", 0, 1, 0.01, 0.1),
      N("marginTop", "Margin top", 0, 1, 0.005, 0),
      N("marginRight", "Margin right", 0, 1, 0.005, 0),
      N("marginBottom", "Margin bottom", 0, 1, 0.005, 0),
      N("marginLeft", "Margin left", 0, 1, 0.005, 0),
      S("aspectRatio", "Aspect ratio", "PulsingBorderAspectRatios", "auto"),
      N("softness", "Softness", 0, 1, 0.01, 0.75),
      N("intensity", "Intensity", 0, 1, 0.01, 0.2),
      N("bloom", "Bloom", 0, 1, 0.01, 0.25),
      I("spots", "Spots", 1, 20, 5),
      N("spotSize", "Spot size", 0, 1, 0.01, 0.5),
      N("pulse", "Pulse", 0, 1, 0.01, 0.25),
      N("smoke", "Smoke", 0, 1, 0.01, 0.3),
      N("smokeSize", "Smoke size", 0, 1, 0.01, 0.6),
    ],
  },
  {
    id: "colorPanels", label: "Color Panels", base: "object", sizing: { scale: 0.8 }, noise: false, speed: 0.5,
    frag: colorPanelsFragmentShader,
    params: [
      CA("colors", "Colors", ["#ff9d00", "#fd4f30", "#809bff", "#6d2eff", "#333aff", "#f15cff", "#ffd557"], 10),
      C("colorBack", "Background", "#000000"),
      N("angle1", "Angle 1", 0, 360, 1, 0),
      N("angle2", "Angle 2", 0, 360, 1, 0),
      N("length", "Length", 0, 5, 0.05, 1.1),
      B("edges", "Edges", false),
      N("blur", "Blur", 0, 1, 0.01, 0),
      N("fadeIn", "Fade in", 0, 1, 0.01, 1),
      N("fadeOut", "Fade out", 0, 1, 0.01, 0.3),
      I("density", "Density", 1, 10, 3),
      N("gradient", "Gradient", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "staticMeshGradient", label: "Static Mesh Gradient", base: "object", sizing: { rotation: 270 }, noise: false, speed: 0,
    frag: staticMeshGradientFragmentShader,
    params: [
      CA("colors", "Colors", ["#ffad0a", "#6200ff", "#e2a3ff", "#ff99fd"], 10),
      I("positions", "Positions", 1, 10, 2),
      N("waveX", "Wave X", 0, 5, 0.05, 1.0),
      N("waveXShift", "Wave X shift", 0, 1, 0.01, 0.6),
      N("waveY", "Wave Y", 0, 5, 0.05, 1.0),
      N("waveYShift", "Wave Y shift", 0, 1, 0.01, 0.21),
      N("mixing", "Mixing", 0, 1, 0.01, 0.93),
      N("grainMixer", "Grain mixer", 0, 1, 0.01, 0),
      N("grainOverlay", "Grain overlay", 0, 1, 0.01, 0),
    ],
  },
  {
    id: "staticRadialGradient", label: "Static Radial Gradient", base: "object", sizing: {}, noise: false, speed: 0,
    frag: staticRadialGradientFragmentShader,
    params: [
      C("colorBack", "Background", "#000000"),
      CA("colors", "Colors", ["#00bbff", "#00ffe1", "#ffffff"], 10),
      N("radius", "Radius", 0, 2, 0.01, 0.8),
      N("focalDistance", "Focal distance", 0, 1, 0.01, 0.99),
      N("focalAngle", "Focal angle", 0, 360, 1, 0),
      N("falloff", "Falloff", 0, 1, 0.01, 0.24),
      N("mixing", "Mixing", 0, 1, 0.01, 0.5),
      N("distortion", "Distortion", 0, 1, 0.01, 0),
      N("distortionShift", "Distortion shift", 0, 1, 0.01, 0),
      N("distortionFreq", "Distortion freq.", 0, 30, 0.1, 12),
      N("grainMixer", "Grain mixer", 0, 1, 0.01, 0),
      N("grainOverlay", "Grain overlay", 0, 1, 0.01, 0),
    ],
  },
];

export const SHADER_LIST = SHADERS;
export const byId = new Map(SHADERS.map((s) => [s.id, s]));

const SIZING_KEYS = ["scale", "rotation", "originX", "originY", "offsetX", "offsetY", "worldWidth", "worldHeight"];

const clone = (v) => JSON.parse(JSON.stringify(v));

export function defaultSizing(def) {
  const base = def.base === "object" ? defaultObjectSizing : defaultPatternSizing;
  return { ...base, ...(def.sizing || {}) };
}

export function defaultParams(def) {
  const p = {};
  for (const spec of def.params) p[spec.key] = clone(spec.def);
  return p;
}

/** Build a fresh, full config object (the unit synced over the broker) for a shader id. */
export function makeConfig(id) {
  const def = byId.get(id) || SHADERS[0];
  return {
    shader: def.id,
    speed: def.speed,
    params: defaultParams(def),
    sizing: defaultSizing(def),
  };
}

/** Convert a config into the flat uniforms object ShaderMount expects. */
export function uniformsFor(def, params, sizing) {
  const u = {};
  for (const spec of def.params) {
    const v = params[spec.key];
    if (spec.type === "colors") {
      const arr = Array.isArray(v) ? v : [];
      u.u_colors = arr.map(getShaderColorFromString);
      u.u_colorsCount = arr.length;
    } else if (spec.type === "color") {
      u["u_" + spec.key] = getShaderColorFromString(v);
    } else if (spec.type === "select") {
      const map = ENUMS[spec.enum];
      u["u_" + spec.key] = map[v] ?? 0;
    } else {
      // number / boolean -> u_<uniformName> (defaults to the param key)
      u["u_" + (spec.uniform || spec.key)] = v;
    }
  }
  if (def.noise) u.u_noiseTexture = noiseImage();
  u.u_fit = ShaderFitOptions[sizing.fit] ?? 0;
  for (const k of SIZING_KEYS) u["u_" + k] = sizing[k];
  return u;
}

// ---- shared noise texture (a few shaders need one) ----
let _noise, _noiseReady;
export function noiseImage() {
  if (!_noise) _noise = getShaderNoiseTexture();
  return _noise;
}
export function ensureNoise() {
  if (_noiseReady) return _noiseReady;
  const img = noiseImage();
  _noiseReady = img.complete && img.naturalWidth
    ? Promise.resolve()
    : new Promise((res) => { img.onload = res; img.onerror = res; });
  return _noiseReady;
}

// ---- a self-contained shader view: mounts/rebuilds/updates on config changes ----
// Used by both the overlay (full-screen) and the controller (live preview).
// Force-release a WebGL context so the browser's active-context count drops
// immediately. GC reclaims contexts lazily, which bursts past the ~16-context
// limit when generating many thumbnails or switching shaders often.
function loseCanvasContext(canvas) {
  try {
    const gl = canvas && canvas.getContext && canvas.getContext("webgl2");
    const ext = gl && gl.getExtension && gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  } catch { /* ignore */ }
}

export function createShaderView(host) {
  let mount = null;
  let shaderId = null;
  let token = 0;

  async function update(cfg) {
    if (!cfg) return;
    const def = byId.get(cfg.shader);
    if (!def) return;
    const t = ++token;

    if (cfg.shader !== shaderId) {
      if (def.noise) { try { await ensureNoise(); } catch { /* ignore */ } }
      if (t !== token) return; // a newer update superseded us while awaiting
      if (mount) { loseCanvasContext(host.querySelector("canvas")); mount.dispose(); }
      shaderId = cfg.shader;
      try {
        mount = new ShaderMount(host, def.frag, uniformsFor(def, cfg.params, cfg.sizing), {}, cfg.speed || 0, 0);
      } catch (e) {
        console.error("[shader] mount failed:", e);
        mount = null;
      }
    } else if (mount) {
      try { mount.setUniforms(uniformsFor(def, cfg.params, cfg.sizing)); } catch (e) { console.error(e); }
    }
    if (t !== token) return;
    if (mount) mount.setSpeed(cfg.speed || 0);
  }

  function setSpeed(v) { if (mount) mount.setSpeed(v || 0); }
  function dispose() { if (mount) { loseCanvasContext(host.querySelector("canvas")); mount.dispose(); mount = null; } shaderId = null; }

  return { update, setSpeed, dispose };
}

// Single-context thumbnail renderer. Reuses ONE WebGL2 context with a cached
// program per shader so that rendering dozens of thumbnails never creates more
// than one context. (Safari/WebKit only frees a WebGL context slot on GC, so a
// fresh ShaderMount per thumbnail overflows the ~16-context limit.)
const VERTEX_SHADER_SOURCE = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y); }
  else if (u_fit == 2.) { box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y); }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;
  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);
  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2((u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x, (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y);
  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;
  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;
  v_responsiveBoxGivenSize = vec2((u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x, (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y);
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;
  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;
  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2((u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x, (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y);
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;
  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;
  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) { v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x); }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  v_patternUV *= .01;
  vec2 imageBoxSize;
  if (u_fit == 1.) { imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio; }
  else if (u_fit == 2.) { imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio; }
  else { imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio); }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;
  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;
  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`;

let _tg = null;
function thumbRenderer() {
  if (_tg) return _tg;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) throw new Error("WebGL2 unavailable");
  // Match ShaderMount: bump precision to highp on devices where mediump float < 23 bits
  const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
  const lowPrec = fmt && fmt.precision < 23;
  const compile = (type, src) => {
    let s = src;
    if (lowPrec) {
      s = s.replace(/precision\s+(lowp|mediump)\s+float/g, "precision highp float")
           .replace(/\b(uniform|varying|attribute)\s+(lowp|mediump)\s+(\w+)/g, "$1 highp $3");
    }
    const sh = gl.createShader(type);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("shader compile: " + log);
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  _tg = { canvas, gl, vs, compile, programs: new Map(), posLoc: new Map(), posBuf, noiseTex: gl.createTexture(), noiseUploaded: false };
  return _tg;
}

function programFor(tg, def) {
  if (tg.programs.has(def.id)) return tg.programs.get(def.id);
  let prog = null;
  try {
    const fs = tg.compile(tg.gl.FRAGMENT_SHADER, def.frag);
    prog = tg.gl.createProgram();
    tg.gl.attachShader(prog, tg.vs);
    tg.gl.attachShader(prog, fs);
    tg.gl.linkProgram(prog);
    tg.gl.deleteShader(fs);
    if (!tg.gl.getProgramParameter(prog, tg.gl.LINK_STATUS)) throw new Error(tg.gl.getProgramInfoLog(prog));
  } catch (e) {
    tg.programs.set(def.id, null);
    console.warn("[thumbnail] program failed:", def.id, e.message);
    return null;
  }
  tg.programs.set(def.id, prog);
  return prog;
}

function uploadNoise(tg) {
  const gl = tg.gl;
  const img = noiseImage();
  gl.bindTexture(gl.TEXTURE_2D, tg.noiseTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  tg.noiseUploaded = true;
}

function setUniform(gl, loc, value) {
  if (Array.isArray(value)) {
    let flat, len;
    if (Array.isArray(value[0])) { len = value[0].length; flat = value.flat(); }
    else { flat = value; len = flat.length; }
    const fn = len === 2 ? gl.uniform2fv : len === 3 ? gl.uniform3fv : len === 4 ? gl.uniform4fv : null;
    if (fn) fn.call(gl, loc, new Float32Array(flat));
  } else if (typeof value === "boolean") gl.uniform1i(loc, value ? 1 : 0);
  else if (typeof value === "number") gl.uniform1f(loc, value);
}

// Render a single still frame of a shader config to a PNG data URL, through the
// shared single context. Cached by the caller; shown as a background-image.
export async function renderConfigThumbnail(config, { width = 256, height = 144, frame = 1500 } = {}) {
  const def = byId.get(config?.shader);
  if (!def) return null;
  if (def.noise) { try { await ensureNoise(); } catch { /* ignore */ } }
  let tg;
  try { tg = thumbRenderer(); } catch (e) { console.warn("[thumbnail] no GL:", e.message); return null; }
  const prog = programFor(tg, def);
  if (!prog) return null;
  const { gl, canvas } = tg;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.useProgram(prog);

  let posLoc = tg.posLoc.get(def.id);
  if (posLoc == null) { posLoc = gl.getAttribLocation(prog, "a_position"); tg.posLoc.set(def.id, posLoc); }
  gl.bindBuffer(gl.ARRAY_BUFFER, tg.posBuf);
  if (posLoc >= 0) { gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0); }

  const uniforms = uniformsFor(def, config.params, config.sizing);
  let needNoise = false;
  for (const [key, value] of Object.entries(uniforms)) {
    if (value instanceof HTMLImageElement) { needNoise = true; continue; }
    const loc = gl.getUniformLocation(prog, key);
    if (loc) setUniform(gl, loc, value);
  }
  if (needNoise) {
    if (!tg.noiseUploaded) uploadNoise(tg);
    const loc = gl.getUniformLocation(prog, "u_noiseTexture");
    if (loc) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tg.noiseTex); gl.uniform1i(loc, 0); }
  }

  const u = (name) => gl.getUniformLocation(prog, name);
  let l;
  if ((l = u("u_time"))) gl.uniform1f(l, frame * 0.001);
  if ((l = u("u_pixelRatio"))) gl.uniform1f(l, 1);
  if ((l = u("u_resolution"))) gl.uniform2f(l, width, height);
  if ((l = u("u_imageAspectRatio"))) gl.uniform1f(l, 1);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  try { return canvas.toDataURL("image/png"); }
  catch (e) { console.warn("[thumbnail] toDataURL failed:", config?.shader, e.message); return null; }
}

/** Convenience: thumbnail of a shader's default config. */
export function renderThumbnail(id, opts = {}) {
  return renderConfigThumbnail(makeConfig(id), opts);
}
