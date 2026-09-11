/**
 * Device quality tiers.
 *
 * THE CEILING IS THE DISPLAY, NOT A FRACTION OF IT. A drawing buffer smaller than the physical
 * pixel grid is not a cheaper version of the same picture -- the browser *upscales* it, so a 1.5x
 * buffer on a 2x display is resampled 1.333x on its way to the panel and every edge in the frame
 * arrives blurred and stepped at once. That is the single largest fidelity lever there is, it is
 * binary rather than gradual, and it costs less than the arithmetic suggests.
 *
 * Re-measured headful on an Apple M5 (ANGLE Metal, 10 cores, 2x display, 1440x820 CSS), cold, with
 * MSAA 4x on, and fitting `t = a + b * megapixels` through the two ends:
 *
 *     dpr 1.50   2160x1230   2.66 MP    9.4 ms
 *     dpr 2.00   2880x1640   4.72 MP   11.8 ms
 *     ==> 6.3 ms fixed + 1.17 ms per megapixel
 *
 * The frame is dominated by a ~6.3 ms fixed cost -- draw call submission and 431k triangles of
 * geometry -- and shades pixels at a sixth of the rate the old reference figure assumed. Native
 * resolution therefore costs +2.4 ms out of a 16.7 ms budget, which is affordable, and every tier
 * below high now targets the panel it is on rather than a fraction of it.
 *
 * MSAA stays on at every tier, and on this class of GPU it is close to free: paired cold runs read
 * 11.8 ms with it and 12.2 ms without, paired warm runs 20.5 ms and 19.8 ms. Apple's tile-based
 * renderer resolves multisamples in on-chip tile memory and never pays the bandwidth an immediate
 * mode GPU would. The old note here quoted `3.18` vs `2.39 ms/MP` from a different machine and
 * concluded MSAA was a real cost worth defending; on this one there is nothing to defend against.
 * It stays for the reason that survives either measurement: three materials in this scene set
 * `alphaToCoverage` (Undergrowth, Vines, Jungle fronds) and that flag resolves against the
 * multisample buffer or does nothing at all, so without it every cutout leaf in the frame goes
 * back to a hard alphaTest edge.
 *
 * BENCHMARKING NOTE FOR WHOEVER RE-MEASURES THIS. Run to run drift on a laptop is larger than
 * every lever in this file: the same build measured 11.8 ms cold and 20.5 ms after four minutes of
 * back-to-back runs with the operator's own browser open. Only paired, interleaved, cold
 * measurements mean anything here. A single sweep run top to bottom will "prove" whichever option
 * happened to go first.
 */

export type Tier = "low" | "mid" | "high";

export type Quality = {
  tier: Tier;
  /** [min, max] passed to r3f; it clamps devicePixelRatio into this range. */
  dpr: [number, number];
  /**
   * The worst resolution the runtime monitor may fall back to, absolute, not a fraction.
   *
   * It is a floor and not a starting point: the scene opens at the ceiling and only ever walks
   * down from measured frame times. High's floor is what used to be its ceiling, so the very worst
   * a fast machine can now settle on is the picture the site used to open with.
   */
  dprFloor: number;
  /**
   * No "soft" tier. three deprecated PCFSoftShadowMap in r183 and WebGLShadowMap.render now
   * rewrites it to PCFShadowMap on the first frame and warns -- verified at
   * node_modules/three/src/renderers/webgl/WebGLShadowMap.js:99. The high tier was therefore
   * already rendering PCF; asking for soft only bought a console warning every session.
   */
  shadows: "basic" | "percentage";
  shadowMap: number;
  /** multiplier on every instanced foliage count. */
  density: number;
  /** mist planes and god rays -- large overdrawing transparents, first thing to go. */
  atmos: boolean;
  /** segments per side on the water plane. */
  waterSeg: number;
  /** [x, z] segments on the ground sheet. */
  groundSeg: [number, number];
  /** edge of the procedural canvas textures. */
  texSize: number;
};

const TIERS: Record<Tier, Omit<Quality, "tier">> = {
  high: {
    // Native. On a 2x display this is a 1:1 buffer with no resample between the render and the
    // panel, which is the whole point; on a 1x display r3f clamps it back down to 1.
    dpr: [1, 2],
    dprFloor: 1.5,
    shadows: "percentage",
    shadowMap: 2048,
    density: 1,
    atmos: true,
    waterSeg: 128,
    groundSeg: [216, 186],
    texSize: 2048,
  },
  mid: {
    dpr: [1, 1.5],
    dprFloor: 1,
    shadows: "percentage",
    shadowMap: 1024,
    density: 0.55,
    atmos: true,
    waterSeg: 96,
    groundSeg: [144, 124],
    texSize: 1024,
  },
  low: {
    // The one tier that still renders below its panel. A phone that scored this low is bandwidth
    // bound before it is anything else, and 0.6 was far enough down to be visible as mush.
    dpr: [0.75, 1],
    dprFloor: 0.75,
    shadows: "basic",
    shadowMap: 512,
    density: 0.28,
    atmos: false,
    waterSeg: 48,
    groundSeg: [96, 82],
    texSize: 1024,
  },
};

/**
 * `WEBGL_debug_renderer_info` is the only reliable way to catch a machine that has no GPU at all.
 * Chrome falls back to SwiftShader silently -- it reports a working WebGL2 context, a healthy core
 * count and a normal viewport, and then renders this scene at three frames per second. Every other
 * signal here is a proxy; this one is ground truth, so it short-circuits the score.
 */
function isSoftwareRenderer(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return true;
    const ext = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const r = String(
      (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "",
    ).toLowerCase();
    return /swiftshader|llvmpipe|software|basic render/.test(r);
  } catch {
    return false;
  }
}

function detect(): Tier {
  if (typeof window === "undefined") return "high"; // SSR never reaches the canvas; see SceneMount
  if (isSoftwareRenderer()) return "low";

  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const px =
    window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio || 1, 2) ** 2;

  // A phone is a tile-based GPU with a shared memory bus driving a very dense display. It is the
  // one case where the proxies agree, so it starts two rungs down and has to earn its way back.
  let score = coarse ? 0 : 2;
  if (cores >= 8) score += 1;
  if (cores <= 4) score -= 1;
  if (mem >= 8) score += 1;
  if (mem <= 4) score -= 1;
  // Pixels are the cost, so a large buffer is a reason to be *more* careful, not less.
  if (px > 4.2e6) score -= 1;
  if (px < 1.2e6) score += 1;

  return score >= 3 ? "high" : score >= 1 ? "mid" : "low";
}

let cached: Quality | null = null;

/** Resolved once per page load. Instance counts cannot change without a remount, so re-running
 *  this on resize would buy nothing -- runtime adaptation is AdaptiveDpr's job.
 *  `?q=low` forces a tier, which is the only way to check a phone budget on a desktop GPU. */
export function quality(): Quality {
  if (!cached) {
    const forced =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") : null;
    const tier: Tier =
      forced === "low" || forced === "mid" || forced === "high" ? forced : detect();
    cached = { tier, ...TIERS[tier] };
  }
  return cached;
}
