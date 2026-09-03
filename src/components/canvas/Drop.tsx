"use client";
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollData, sub } from "@/lib/frameData";
import { VINE_TIP } from "./Vines";

const [TX, TY, TZ] = VINE_TIP;

const vert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * A hanging water drop is a lens, and the only thing worth spending pixels on at this size is what
 * that lens does to the edge.
 *
 * A drop against a bright sky is a BRIGHT centre inside a DARK ring — the same thing rain on a
 * window does. The middle refracts the sky straight through; past the critical angle the rim goes
 * to total internal reflection and mirrors the shaded ground back at you. A physical material gets
 * this exactly backwards: fresnel makes rims bright, so MeshPhysicalMaterial produced a pearl with
 * a silver halo, and the more the core was darkened to fight it the more it read as a black bead
 * punched through the skyline.
 *
 * Doing it by hand also means the drop keeps working after it leaves the sky. It carries the sky
 * down with it, so against the dark river it is the bright thing in frame, which is where the eye
 * needs to be when it lands.
 */
const frag = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uRim;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    // Banding on N.V directly puts the ring in the last pixel of the silhouette and antialiasing
    // then eats it -- N.V is still 0.8 three fifths of the way out. This is the same angle measured
    // as a fraction of the SCREEN radius, which is what the ring has to be even on the frames where
    // the bead is eight pixels across.
    float r = sqrt(max(0.0, 1.0 - ndv * ndv));
    vec3 col = mix(uCore, uRim, smoothstep(0.70, 0.99, r));

    // A lens inverts. The sky standing above the drop lands in the bottom of its image and the
    // shaded ground lands in the top, so the core is never the flat disc a constant colour makes
    // it -- it is faintly graded the other way up from the world behind it.
    col *= mix(1.07, 0.89, smoothstep(-0.65, 0.65, N.y));

    // The caustic. One tight specular off the same warm key that lights the valley, placed high and
    // to the left so it agrees with the light the rest of the scene is standing in.
    vec3 L = normalize(vec3(-0.52, 0.74, 0.43));
    col += vec3(1.0, 0.97, 0.88) * pow(max(dot(reflect(-V, N), L), 0.0), 60.0) * 1.6;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const uniforms = {
  uCore: { value: new THREE.Color("#d2caaf") },
  uRim: { value: new THREE.Color("#39432c") },
};

/**
 * The single drop — it beads on the vine tip, then falls the length of the hero and strikes the
 * river as the hero ends.
 *
 * It runs off `hero`, not `offer`, and that is the whole point. The hero is 150vh of scroll and it
 * used to spend all of it on a camera glide across a jungle that never changed, so the first thing
 * the story actually DID was fourteen hundred pixels below the fold. Now the fall is the hero: the
 * copy clears, the bead swells, and it lands at the exact scroll position where the offer act opens
 * and the bottle comes up out of the ring it left. One gesture across two triggers.
 */
export default function Drop() {
  const mesh = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const h = scrollData.hero;
    // The offer act starting IS the impact. Past that the river carries the ripple and the bottle,
    // and a bead still hanging in frame would be a second drop that never fell.
    const inWindow = scrollData.offer <= 0 && h > 0.34 && h < 1;
    if (!mesh.current) return;
    if (!inWindow) {
      // Scale, not `visible`, and certainly not unmounting. three skips a hidden object before it
      // ever reaches the material, so the program would not compile until the frame the drop first
      // appears -- which is a stall in the middle of the fall. Held at zero it costs one draw of
      // degenerate triangles and the shader is hot from the first frame of the page. Unmounting was
      // worse again: it threw away the geometry and the material and made React reconcile the scene
      // graph twice per pass over the hero.
      mesh.current.scale.setScalar(0);
      return;
    }

    const bead = sub(h, 0.34, 0.52);
    if (bead < 1) {
      // it gathers on the tip before it goes: swelling, sagging a little as it gets heavy
      const s = 0.34 + 0.66 * bead;
      mesh.current.position.set(TX, TY - 0.028 - 0.022 * bead, TZ);
      mesh.current.scale.set(s, s * (1 + 0.16 * bead), s);
      return;
    }
    const t = sub(h, 0.52, 1);
    // gravity: quadratic ease-in
    mesh.current.position.set(TX, TY - (TY - 0.02) * t * t, TZ);
    // slight stretch while falling
    const stretch = 1 + 0.28 * Math.sin(Math.PI * t) * t;
    mesh.current.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  });

  return (
    <mesh ref={mesh} position={VINE_TIP} scale={0}>
      {/* 32 segments for a bead 24px across is 1.4 tris per pixel, but the silhouette is the whole
          read here and a faceted circle at this size is a cog. */}
      <sphereGeometry args={[0.072, 32, 32]} />
      {/* Not MeshTransmissionMaterial. That one calls gl.render(scene, camera) into an FBO on every
          frame it is mounted — a second full pass over the jungle, the undergrowth, the tessellated
          river, the mist and the god rays — and the drop now hangs for 890px of the most scrolled
          part of the site. Real refraction is invisible at 24px; the rim is not. */}
      <shaderMaterial vertexShader={vert} fragmentShader={frag} uniforms={uniforms} />
    </mesh>
  );
}
