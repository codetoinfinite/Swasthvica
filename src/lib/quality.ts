/**
 * Device quality tiers.
 *
 * Measured on the reference machine at 1440x716 CSS / devicePixelRatio 2, the home scene costs
 * `2.21 ms + 3.18 ms per megapixel` of drawing buffer with MSAA 4x, and `1.55 + 2.39` without it.
 * Two things follow.
 *
 * First, resolution is the only large lever. Removal deltas across every object in the scene sum
 * to a *negative* number -- hiding an occluder makes what is behind it cost more -- so there is no
 * hotspot to cut. The frame is 59% PBR fragment shading spread evenly over 431k triangles, and the
 * honest way to make that cheaper is to shade fewer pixels.
 *
 * Second, MSAA stays on at every tier. Three materials in this scene set `alphaToCoverage`
 * (Undergrowth, Vines, Jungle fronds) and that flag resolves against the MSAA buffer or does
 * nothing at all; without it every cutout leaf in the frame goes back to a hard alphaTest edge.
 * The tempting trade -- drop MSAA, spend the savings on resolution -- assumes the browser
 * downscales the buffer and supersamples the edges for free. It does not: at `dpr 1.75` on a 2x
 * display the 2520px buffer is *upscaled* to 2880 physical pixels, so there is no supersampling
 * underneath to fall back on. MSAA at a lower dpr costs about what no-MSAA at a higher dpr does
 * (8.19 ms at dpr 1.35 vs 7.9 ms at dpr 1.6) and keeps the cutouts. Buy the edges.
 */

export type Tier = "low" | "mid" | "high";

export type Quality = {
  tier: Tier;
  /** [min, max] passed to r3f; it clamps devicePixelRatio into this range. */
  dpr: [number, number];
  /** floor for the adaptive PerformanceMonitor, which may push below `dpr[0]`. */
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
    dpr: [1, 1.5],
    dprFloor: 1,
    shadows: "percentage",
    shadowMap: 2048,
    density: 1,
    atmos: true,
    waterSeg: 128,
    groundSeg: [216, 186],
    texSize: 2048,
  },
  mid: {
    dpr: [1, 1.25],
    dprFloor: 0.85,
    shadows: "percentage",
    shadowMap: 1024,
    density: 0.55,
    atmos: true,
    waterSeg: 96,
    groundSeg: [144, 124],
    texSize: 1024,
  },
  low: {
    dpr: [0.75, 1],
    dprFloor: 0.6,
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
      (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? ""
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
  const px = window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio || 1, 2) ** 2;

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
 *  this on resize would buy nothing -- runtime adaptation is the PerformanceMonitor's job.
 *  `?q=low` forces a tier, which is the only way to check a phone budget on a desktop GPU. */
export function quality(): Quality {
  if (!cached) {
    const forced =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("q")
        : null;
    const tier: Tier =
      forced === "low" || forced === "mid" || forced === "high" ? forced : detect();
    cached = { tier, ...TIERS[tier] };
  }
  return cached;
}
