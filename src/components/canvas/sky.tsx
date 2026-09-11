import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/* The jungle's sky used to be the PAGE: the canvas is `alpha: true` and nothing in the scene ever
   painted the gaps between the leaves, so `body`'s --body-sky gradient showed through a hole in the
   framebuffer. That works right up until a fragment writes a fractional alpha -- which the
   alphaToCoverage cutouts do by design, since the coverage value IS the sample mask -- and then the
   compositor mixes the page back in ON TOP of geometry. Measured: a 1px rim round every near leaf,
   brighter than the leaf AND the background behind it. See dressLeaf in foliage.ts for the blend
   that stops the write; this is the other half, which puts alpha 1 under the whole frame so there
   is nothing left for the compositor to mix.

   Drawn as scene.background, not as a mesh: three unshifts the background plane to the front of the
   render list with depthTest and depthWrite off, so it costs one untextured-depth fullscreen pass
   and cannot disturb sorting. It is also colour-managed for free -- an SRGBColorSpace texture is
   uploaded as SRGB8_ALPHA8 and hardware-decoded, and WebGLBackground sets toneMapped = false for
   sRGB backgrounds, so the ramp survives ACES untouched and lands back in sRGB exactly as the
   browser painted it. */

/** --body-sky, verbatim. globals.css holds the same ramp for the DOM; keep the two in step. */
const STOPS: readonly (readonly [number, string])[] = [
  [0, "#d9cba4"],
  [0.18, "#cfc09a"],
  [0.38, "#a8a37e"],
  [0.62, "#5c6544"],
  [0.85, "#242e1a"],
  [1, "#1a2113"],
];

/* Tall enough that the linear filter has nothing to invent: the ramp is sampled across at most a
   viewport of rows, and 1024 is over a texel per row on anything short of a 5K panel. Two columns
   wide because a 1px texture is a driver edge case nobody needs to find out about. */
const H = 1024;

export function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = H;
  const ctx = c.getContext("2d")!;
  // createLinearGradient interpolates in sRGB, which is what a CSS linear-gradient does too, so
  // the two ramps agree stop for stop without a colour-space correction anywhere.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [p, hex] of STOPS) g.addColorStop(p, hex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // The gradient is the whole point of the texture; a mip chain would only average it away, and
  // ClampToEdge stops the top and bottom stops wrapping into each other under the linear filter.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* The other half: nothing may leave a fractional alpha in the framebuffer.

   Painting the sky fills the frame with alpha 1, but any material that blends afterwards can pull
   it back down, and most of them do. three passes `material.premultipliedAlpha` -- default FALSE --
   into blendFuncSeparate, so a transparent material's alpha channel is resolved as
   `sa*sa + da*(1 - sa)`, which is strictly below da for every sa in (0,1). Nine materials on this
   stage are transparent (mist, god rays, the river, the bottle glass, the ridge haze), and they
   left 1.05% of the frame mixing the page back in. The alphaToCoverage cutouts do the same thing
   for a different reason: their fractional alpha IS the sample mask, so it cannot be flattened in
   the shader, and it lands in the framebuffer unblended because an opaque material takes three's
   `blending === NormalBlending && transparent === false` early-out in WebGLState.setMaterial and
   never enables gl.BLEND at all.

   Rather than chase both classes through every material -- and re-chase them for every material
   added later -- one fullscreen pass at the end of the frame sets alpha to 1 and leaves colour
   alone: colour is `dst*1 + src*0`, alpha is `src*1 + dst*0` with src.a hardcoded to 1. It runs
   inside the multisample buffer, so all four samples take it and the resolve is exactly 1. The
   canvas then composites with no page mix anywhere, which is also one less full-viewport blend for
   the browser compositor every frame.

   ZeroFactor is 200, not 0, so it survives WebGLState's `blendSrcAlpha || blendSrc` fallback. */
const SEAL_VERT = `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`;
const SEAL_FRAG = `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

/** Mounts the sky for as long as the stage that renders it is up. The PDP shares this canvas and
 *  must keep showing the page through it, so both halves are torn down on unmount rather than set
 *  once on the renderer. */
export function Sky() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const tex = skyTexture();
    scene.background = tex;
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene]);

  const seal = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: SEAL_VERT,
      fragmentShader: SEAL_FRAG,
      depthTest: false,
      depthWrite: false,
      // Has to sit in the transparent list: three renders that list after the whole opaque one, and
      // renderOrder only sorts within a list. The name is honest either way -- this does blend.
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
    });
    return m;
  }, []);
  useEffect(() => () => seal.dispose(), [seal]);

  return (
    <mesh renderOrder={9999} frustumCulled={false} material={seal}>
      {/* The vertex shader writes clip space directly, so the 2x2 plane is the viewport whatever
          the camera is doing. */}
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
