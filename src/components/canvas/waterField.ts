/**
 * The river's height field, and the clock that drives it, live here because more than one thing in
 * the scene has to agree on where the water surface actually IS.
 *
 * Water.tsx displaces its plane in the vertex shader -- `wp.y += height(wp.xz, uTime)` -- so the
 * surface is nowhere near y = 0. The three swells alone sum to 0.090, the chop adds about 0.014 and
 * the cross sines another 0.025 before turbulence multiplies them by up to 3.5, which puts a crest
 * at 0.13 in still water and 0.19 in a fast scroll, with a scripted ripple impulse worth 0.22 on
 * top. Anything meant to FLOAT has to be evaluated against that field, not against zero: the first
 * attempt at floating leaf litter pinned the cards at y = 0.012 and every one of them spent the
 * frame underneath the water it was supposed to be lying on, which measured as a delta of exactly
 * zero against the render with no leaves in it at all.
 *
 * Uniforms are a module singleton rather than a hook-owned object for the same reason the scroll
 * data in frameData.ts is: two materials in two different components have to read the identical
 * value on the identical frame or the leaves swim. Water.tsx is the only writer.
 */
export const WATER = {
  uTime: { value: 0 },
  uTurb: { value: 0 },
  uRippleT: { value: -1 },
};

/**
 * The noise and the height sum, shared verbatim by the water's own vertex and fragment stages and
 * by anything floating on it. It declares NO uniforms: it reads uTime, uTurb and uRippleT, and each
 * shader that pastes it in is responsible for declaring those three and binding them to `WATER`.
 */
export const WATER_HEIGHT_GLSL = /* glsl */ `
  // Value noise. The chop below has to be BROADBAND: a sum of plain sines at fixed wavelengths is
  // coherent everywhere, and under a camera looking down a corridor the constant-z crests compress
  // into a regular moire that reads as corrugated card. Noise has no preferred direction, so it
  // stays water at every distance.
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
               mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm4(vec2 q) {
    float a = 0.0, amp = 1.0, tot = 0.0;
    for (int i = 0; i < 4; i++) {
      a += (vn(q) - 0.5) * amp;
      tot += amp;
      amp *= 0.5;
      q = q * 2.13 + vec2(3.7, 1.9);
    }
    return a / tot;
  }

  /**
   * The part of the surface the water plane can actually RESOLVE.
   *
   * Water.tsx tessellates 140 units into 128 segments, so its vertices are 1.09 units apart and
   * everything it renders between them is a straight line. The two chop octaves below have features
   * at 0.38 and 0.14 units -- four to eight times finer than the sample spacing -- so they exist in
   * the height sum but not in the rendered mesh, which is a smooth interpolation of the low
   * frequencies with the chop aliased away.
   *
   * Anything floating has to agree with the surface that gets DRAWN, not the surface as written.
   * Leaf litter that evaluated the full sum sat up to 0.034 off the drawn plane and spent half of
   * every wave underneath it, which measures as no leaves at all. So the field splits here: the
   * swells and the two cross sines have wavelengths of 2.7 to 14 units and survive the
   * tessellation, and floats ride those.
   */
  float heightLF(vec2 p, float t) {
    float a = sin(p.x * 0.8 + t * 0.9) * 0.030
            + sin(p.y * 0.7 - t * 0.7) * 0.026
            + sin((p.x + p.y) * 0.45 + t * 0.5) * 0.034;
    a += (sin(p.x * 2.3 - t * 1.7) * 0.014 + sin(p.y * 2.9 + t * 1.3) * 0.011) * (1.0 + uTurb * 2.5);
    if (uRippleT >= 0.0) {
      float R = uRippleT * 6.0;
      float d = length(p);
      a += (1.0 - uRippleT) * 0.22 * sin(d * 7.0 - R * 7.0) * exp(-pow(d - R, 2.0) * 4.0);
    }
    return a;
  }

  float height(vec2 p, float t) {
    // the river runs toward the camera, so everything advects in +z
    vec2 q = p - vec2(0.0, t * 0.85);
    // Stream chop. The three swells above have wavelengths of 8 to 14 world units on a channel only
    // 3 to 5 units wide, so across the near river they contribute one smooth ramp and no surface at
    // all -- which is why it rendered as wet sand. These two octaves sit at 0.4 and 0.15 units, the
    // scale of actual ripples on actual moving water, and they are what breaks the grazing
    // reflection into glitter. They are also what heightLF deliberately leaves out.
    return heightLF(p, t) + fbm4(q * 2.6) * 0.020 + fbm4(q * 7.0 + 11.0) * 0.007;
  }
`;
