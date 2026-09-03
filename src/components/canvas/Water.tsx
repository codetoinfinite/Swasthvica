"use client";
import { useRef } from "react";
import * as THREE from "three";
import { quality } from "@/lib/quality";
import { useFrame } from "@react-three/fiber";
import { scrollData, sub } from "@/lib/frameData";
import { WATER, WATER_HEIGHT_GLSL } from "./waterField";

const SEG = quality().waterSeg;

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uTurb;
  uniform float uRippleT;
  varying vec3 vWorldPos;

  ${WATER_HEIGHT_GLSL}

  void main() {
    vec3 pos = position;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    wp.y += height(wp.xz, uTime);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uTurb;
  uniform float uRippleT;
  varying vec3 vWorldPos;

  ${WATER_HEIGHT_GLSL}

  const float BED = 0.46;

  float ss(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

  // The channel profile from terrain.ts, ported exactly. Only the base term — the fbm laid over
  // it is worth a couple of centimetres of bed and is not worth a second noise implementation in
  // GLSL. What matters is that the shader and the mesh agree on where the water gets shallow,
  // because that is where the whole illusion is won or lost.
  float chC(float z) { return 0.75 * sin(z * 0.15) + 0.35 * sin(z * 0.41); }
  float chH(float z) { return 1.7 + 1.9 * ss((6.0 - z) / 22.0) + 0.28 * sin(z * 0.63 + 2.2); }
  float depthAt(vec2 p) {
    float u = (abs(p.x - chC(p.y)) - chH(p.y)) / 1.25;
    return BED * ss(-u / 1.4);
  }

  /**
   * What the surface reflects. A river in a forest does NOT reflect sky except where it can see
   * sky: a ray leaving the water almost horizontally travels down the corridor and lands in the
   * far haze, one leaving a little steeper hits the near canopy and comes back nearly black, and
   * only a steep ray gets out through the gap. Reflecting a flat cream sky at every angle is what
   * turned the whole river tan — it was reflecting a sky it cannot see.
   */
  vec3 env(vec3 R) {
    vec3 canopy = vec3(0.027, 0.036, 0.021);
    vec3 mist   = vec3(0.256, 0.248, 0.168);
    vec3 sky    = vec3(1.068, 0.730, 0.243);
    vec3 c = mix(mist, canopy, smoothstep(0.005, 0.11, R.y));
    return mix(c, sky, smoothstep(0.32, 0.80, R.y));
  }

  void main() {
    vec2 p = vWorldPos.xz;
    // 0.07 and not 0.18: the sampling interval has to be well inside the shortest wavelength in
    // height(), which is now 2*PI/17 = 0.37 units. At 0.18 the chop differentiated to nothing.
    float e = 0.07;
    float hC = height(p, uTime);
    float hX = height(p + vec2(e, 0.0), uTime);
    float hZ = height(p + vec2(0.0, e), uTime);
    vec3 N = normalize(vec3(hC - hX, e, hC - hZ));

    // Distance from the CAMERA, not from the origin. The old fade keyed off length(p), which is
    // distance from the drop's impact point — so the ripples died out over the middle of the
    // corridor while the water directly under the camera kept full detail, the opposite of what
    // aliasing calls for.
    float dc = length(vWorldPos - cameraPosition);
    float detail = 1.0 - smoothstep(12.0, 55.0, dc);
    N = normalize(mix(vec3(0.0, 1.0, 0.0), N, detail));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(vec3(-0.55, 0.55, -0.4));

    // Water has no colour of its own at this scale; what you see is the bed, dimmed by however
    // much water is standing on it, plus whatever the surface reflects. Reading it off the
    // channel is what turns a flat olive sheet into a river: shallow at both banks, dark down
    // the middle, and the transition falling where the bank actually is.
    // Refraction has to scale with how much water the ray crosses, or the bed sits perfectly still
    // under a moving surface and the whole thing reads as wet sand rather than as water over sand.
    // depthAt is sampled twice on purpose: once at p to decide how far to bend, then again at the
    // bent position, because sampling the depth through its own offset is circular.
    float dep0 = depthAt(p);
    vec2 refr = p + N.xz * (0.30 + 2.6 * dep0);
    float dep = depthAt(refr);
    // Four octaves averaged together do not have four octaves' worth of contrast — averaging is what
    // kills variance, and at a gain of 1.7 this field spanned barely a quarter of its own range,
    // which is why a quarter of the frame measured out as a 26-step slab of wet concrete. 3.4 pushes
    // it back to the full silt-to-gravel span.
    float grain = vn(refr * 2.6) * 0.42 + vn(refr * 7.3) * 0.31 + vn(refr * 19.0) * 0.17 + vn(refr * 47.0) * 0.10;
    grain = clamp((grain - 0.5) * 3.4 + 0.5, 0.0, 1.0);
    // A streambed is not uniform speckle at one scale. It has BARS — long pale shoals of washed
    // gravel — with pools between them, an order of magnitude larger than the grain, and it is that
    // big shape that tells the eye it is looking down THROUGH water at a bottom rather than at a
    // textured surface.
    float bar = ss(vn(refr * 0.30 + 21.0) * 1.9 - 0.45);
    // These are lit radiances, not raw albedos. Nothing in this shader runs a lighting pass — the
    // bed is written straight out — so the numbers have to already include the light that reaches
    // the bottom. They are in LINEAR light, solved backwards through ACES and the sRGB transfer for
    // the values they should end up as on screen.
    vec3 silt = mix(vec3(0.048, 0.046, 0.031), vec3(0.128, 0.117, 0.074), grain);
    silt *= 0.62 + 0.62 * vn(refr * 1.3 + 4.0); // drowned leaf litter in patches
    silt *= 0.74 + 0.52 * bar; // and the shoals it collects between
    // Beer's law per channel, not a lerp toward a flat deep-water colour. The lerp is what kept the
    // middle of the channel a slab: past about a hand's depth the bed was contributing a sixth of
    // the result and the other five sixths were one constant, so all the grain solved for above
    // averaged straight back out. Water takes red out of a beam first and green last, so attenuating
    // per channel keeps the bottom legible through the entire column and turns it green-black on the
    // way down instead of replacing it with paint. The additive term is the light scattered back out
    // by the silt the water is carrying, which is what actually stops you seeing the bed in a real
    // hill stream — absorption over half a metre of clean water is almost nothing.
    vec3 absorb = exp(-dep * vec3(3.4, 1.9, 2.5));
    vec3 body = silt * absorb + vec3(0.030, 0.042, 0.033) * (1.0 - absorb.g);

    // Caustics: the surface is a lens, and where it focuses you get the bright net on the bottom.
    // Reusing height() at a different rate is not the real integral but it is the same field, so
    // the net travels with the water it belongs to instead of sliding across it.
    float caus = pow(max(0.0, 1.0 - abs(height(refr, uTime * 1.3) * 26.0)), 3.0);
    body += vec3(0.95, 0.88, 0.58) * caus * 0.12 * (1.0 - 0.75 * ss(dep / 0.46)) * detail;

    // Schlick against water's real F0 of 0.02. The old pow(...,3.0)*0.62 handed a sixth of the
    // reflection to water the camera is looking straight down into, which buried the bed under
    // sky the whole way to the near bank; the fifth power keeps the reflection where it belongs,
    // out at grazing angles, and lets the near river show what is lying on the bottom.
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    // Canopy shade, on the same field and at the same scale the ground and the undergrowth are
    // dappled with. The water was the one surface in the valley standing in full light while
    // everything on both banks stood in broken shade, and a river the trees above it do not touch
    // is the fastest tell that the two were built separately.
    float wDap = ss(fbm4(p * 0.20 + vec2(11.0, 7.0)) * 2.6 + 0.5);
    // Same widened canopy range the floor and the plants now carry. A river under broken cover has
    // sun on it in patches, and those patches were the frame's missing bright end — everything the
    // canopy touched was inside one narrow band because the band itself was only 2:1 wide.
    float wFl = max(0.0, wDap - 0.72) / 0.28;
    body *= 0.34 + 0.78 * wDap + 3.2 * wFl * wFl;

    vec3 col = mix(body, env(reflect(-V, N)), fresnel);

    // The wet edge. Without it the river simply stops where the bank mesh happens to rise, which
    // reads as two surfaces meeting rather than as a shore. Broken up by a travelling wave so it
    // is a lace of wash rather than a drawn contour, and it doubles as cover for the shallow
    // angle at which the two meshes cross.
    float shore = 1.0 - ss(dep / 0.06);
    float lace = shore * (0.5 + 0.5 * sin(refr.x * 8.5 + refr.y * 6.5 + uTime * 1.7));
    col = mix(col, vec3(0.166, 0.171, 0.123), lace * 0.55);

    // sun glitter
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 140.0);
    col += vec3(1.0, 0.86, 0.55) * spec * 2.2 * detail;

    // distance fade into valley haze
    col = mix(col, vec3(0.256, 0.248, 0.168), smoothstep(30.0, 70.0, dc));
    float alpha = 1.0 - smoothstep(56.0, 78.0, dc);

    gl_FragColor = vec4(col, alpha);

    // A raw ShaderMaterial gets neither of these for free, and without them this shader was writing
    // linear light into a framebuffer the renderer encodes as sRGB — every value here landed on
    // screen about four times darker than it was written, which is why the river kept coming out
    // either a black slab or, when compensated for by hand, a flat tan one. three declares
    // toneMapping() and linearToOutputTexel() in the fragment prefix of any non-raw ShaderMaterial
    // and resolves #include on it, so the water now goes through exactly the same ACES + sRGB path
    // as every lit material standing on its banks.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function Water() {
  const mat = useRef<THREE.ShaderMaterial>(null!);
  // Module singleton, not local state: the floating leaf litter in Undergrowth.tsx runs the same
  // height field off the same clock, and a private accumulator here would let the two drift apart
  // by however much either was ever paused.
  const uniforms = WATER;

  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    const targetTurb = Math.min(1, Math.abs(scrollData.velocity) * 0.02);
    uniforms.uTurb.value += (targetTurb - uniforms.uTurb.value) * Math.min(1, dt * 4);
    // The drop lands as the hero ends, so the strike is the first thing the offer act does --
    // not something a quarter of the way into it. The `> 0` guard is load-bearing: uRippleT 0 is
    // a full-amplitude impulse sitting on the origin, so an ungated 0 would park a permanent
    // crater in the river for the whole hero.
    const r = sub(scrollData.offer, 0, 0.2);
    uniforms.uRippleT.value = scrollData.offer > 0 && scrollData.offer < 0.2 ? r : -1;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      {/* 128 a side resolves the 1.09 m swell; lower tiers trade the chop for the fill rate. */}
        <planeGeometry args={[140, 140, SEG, SEG]} />
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} transparent />
    </mesh>
  );
}
