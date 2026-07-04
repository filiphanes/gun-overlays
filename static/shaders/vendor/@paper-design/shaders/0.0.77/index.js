/* * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *                    Paper Shaders                    *
 *       https://github.com/paper-design/shaders       *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Trimmed vendored build: only the 26 shaders + helpers
 * actually used by ../../../shaders.js are re-exported.
 * The library's heatmap / liquid-metal / gem-smoke modules
 * (which need image preprocessing, not wired up here) and
 * every .d.ts / .js.map artifact have been removed. See
 * ../../../README.md → "Vendoring / updating".
 */

import { ShaderMount } from "./shader-mount.js";
import {
  defaultObjectSizing,
  defaultPatternSizing,
  ShaderFitOptions
} from "./shader-sizing.js";
import { meshGradientFragmentShader } from "./shaders/mesh-gradient.js";
import { smokeRingFragmentShader } from "./shaders/smoke-ring.js";
import { neuroNoiseFragmentShader } from "./shaders/neuro-noise.js";
import { dotOrbitFragmentShader } from "./shaders/dot-orbit.js";
import {
  dotGridFragmentShader,
  DotGridShapes
} from "./shaders/dot-grid.js";
import { simplexNoiseFragmentShader } from "./shaders/simplex-noise.js";
import { metaballsFragmentShader } from "./shaders/metaballs.js";
import { perlinNoiseFragmentShader } from "./shaders/perlin-noise.js";
import { voronoiFragmentShader } from "./shaders/voronoi.js";
import { wavesFragmentShader } from "./shaders/waves.js";
import {
  warpFragmentShader,
  WarpPatterns
} from "./shaders/warp.js";
import { godRaysFragmentShader } from "./shaders/god-rays.js";
import { spiralFragmentShader } from "./shaders/spiral.js";
import { swirlFragmentShader } from "./shaders/swirl.js";
import {
  ditheringFragmentShader,
  DitheringShapes,
  DitheringTypes
} from "./shaders/dithering.js";
import {
  grainGradientFragmentShader,
  GrainGradientShapes
} from "./shaders/grain-gradient.js";
import {
  pulsingBorderFragmentShader,
  PulsingBorderAspectRatios
} from "./shaders/pulsing-border.js";
import { colorPanelsFragmentShader } from "./shaders/color-panels.js";
import {
  staticMeshGradientFragmentShader
} from "./shaders/static-mesh-gradient.js";
import {
  staticRadialGradientFragmentShader
} from "./shaders/static-radial-gradient.js";
import { paperTextureFragmentShader } from "./shaders/paper-texture.js";
import { waterFragmentShader } from "./shaders/water.js";
import {
  flutedGlassFragmentShader,
  GlassDistortionShapes,
  GlassGridShapes
} from "./shaders/fluted-glass.js";
import { imageDitheringFragmentShader } from "./shaders/image-dithering.js";
import {
  HalftoneDotsTypes,
  HalftoneDotsGrids,
  halftoneDotsFragmentShader
} from "./shaders/halftone-dots.js";
import {
  HalftoneCmykTypes,
  halftoneCmykFragmentShader
} from "./shaders/halftone-cmyk.js";
import { getShaderColorFromString } from "./get-shader-color-from-string.js";
import { getShaderNoiseTexture } from "./get-shader-noise-texture.js";

export {
  // core mount / sizing / helpers
  ShaderMount,
  ShaderFitOptions,
  defaultObjectSizing,
  defaultPatternSizing,
  getShaderColorFromString,
  getShaderNoiseTexture,
  // background / pattern shaders (20)
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
  // image-filter shaders (6)
  waterFragmentShader,
  flutedGlassFragmentShader,
  imageDitheringFragmentShader,
  halftoneDotsFragmentShader,
  halftoneCmykFragmentShader,
  paperTextureFragmentShader,
  // enum option objects
  DotGridShapes,
  DitheringShapes,
  DitheringTypes,
  GrainGradientShapes,
  WarpPatterns,
  PulsingBorderAspectRatios,
  GlassDistortionShapes,
  GlassGridShapes,
  HalftoneDotsTypes,
  HalftoneDotsGrids,
  HalftoneCmykTypes
};
