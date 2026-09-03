// Mutable singletons read inside useFrame — never trigger React renders.
export const scrollData = {
  hero: 0, // Act 1 MIST progress 0..1
  offer: 0, // Act 4 THE OFFERING progress 0..1
  velocity: 0, // Lenis scroll velocity
};

/** prefers-reduced-motion, mirrored here so useFrame can read it without a render. */
export const motionPrefs = { reduced: false };

export const pdpData = {
  rotY: 0, // current bottle rotation (damped)
  targetRotY: 0, // set by drag zone; springs back to 0 on release
  dragging: false,

  // --- mirrored for the hover loupe -------------------------------------------------------
  // The loupe is a SECOND WebGL context, with its own clock and its own camera. It cannot
  // recompute the idle bob and land on the same number as this frame's main render -- it would
  // be a sine of a different elapsed time -- so the magnified bottle would drift out of step
  // with the bottle it is magnifying. These are the values the main stage actually settled on,
  // handed over rather than re-derived.
  camX: 0,
  camY: 1.24,
  camZ: 5.9,
  groupRotY: 0,
  groupPosY: -0.05,
};

/** Pointer position over the drag pane, in viewport CSS px. Written at pointer rate, so it must
 *  never go through React state. */
export const zoomData = { cx: 0, cy: 0 };

/**
 * Horizontal lens shift on the PDP camera, as a fraction of viewport width.
 *
 * Half the screen is an opaque copy panel, so screen centre is not the centre of what anyone can
 * actually see. With `view.width === fullWidth` the frustum keeps its size and only its left edge
 * moves, which puts world x=0 at screen fraction `0.5 - offsetX/W`. 0.225 lands it on 0.275 --
 * the centre of the 55% pane. Both canvases apply it, so the loupe samples the same picture.
 */
export const PDP_LENS_SHIFT = 0.225;

/** Linear magnification of the PDP hover loupe. See ZoomLoupe for the resolution budget. */
export const PDP_ZOOM = 3;

/** Remap p from [a,b] to [0,1], clamped. */
export const sub = (p: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (p - a) / (b - a)));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
