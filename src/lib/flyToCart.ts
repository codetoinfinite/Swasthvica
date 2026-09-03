/**
 * A drop leaves the button and falls into the cart.
 *
 * The whole site is built on one image -- the valley collecting into a bottle -- and adding to the
 * cart was the one moment where something was gained and nothing moved. A toast would have said the
 * same thing in words; this says it in the brand's own vocabulary, and it says it in the two places
 * the eye already is: the button that was pressed, and the badge whose number is about to change.
 *
 * Everything here is transform and opacity on a single detached element, so the whole animation
 * lives on the compositor and never touches layout. It reads the two rects once, up front: the
 * fixed nav does not move during the flight, and re-measuring per frame is what makes effects like
 * this stutter on a mid-range phone.
 */

/** Set by Nav on the count badge. The badge, not the button -- the drop lands in the number. */
export const CART_TARGET = "data-cart-target";

/** Quadratic Bezier. `c` is pulled above both ends, so the drop arcs rather than slides. */
const at = (a: number, b: number, c: number, t: number) => {
  const u = 1 - t;
  return u * u * a + 2 * u * t * c + t * t * b;
};

export function flyToCart(from: Element | null) {
  if (typeof window === "undefined" || !from) return;
  // Motion sensitivity is the one place a flourish becomes a symptom. Nothing moves, and the number
  // in the badge still changes -- the state was never carried by the animation.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const badge = document.querySelector<HTMLElement>(`[${CART_TARGET}]`);
  if (!badge) return;

  const a = from.getBoundingClientRect();
  const b = badge.getBoundingClientRect();
  // A nav scrolled out of view, a zero-size element behind display:none: nothing to fly to.
  if (!b.width || !b.height) return;

  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height / 2;
  const x1 = b.left + b.width / 2;
  const y1 = b.top + b.height / 2;

  const drop = document.createElement("div");
  drop.setAttribute("aria-hidden", "true");
  // The badge is z-40's neighbour and the drawer is z-50; 45 puts the drop over the nav it is
  // aiming at without ever crossing an open drawer.
  drop.style.cssText =
    "position:fixed;left:0;top:0;width:15px;height:15px;z-index:45;pointer-events:none;" +
    "border-radius:50% 50% 50% 50%/62% 62% 38% 38%;" +
    "background:radial-gradient(circle at 34% 30%,#f4e3b4 0%,#e2c37c 38%,#c9a24a 74%,#a98436 100%);" +
    "box-shadow:0 0 12px rgba(226,195,124,0.55);will-change:transform,opacity";
  document.body.appendChild(drop);

  // The apex sits above whichever end is higher, so the arc is always an arc -- adding from a
  // button below the fold and adding from one beside the nav both throw the drop upward.
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - Math.max(90, Math.abs(x1 - x0) * 0.22);

  const STEPS = 18;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = at(x0, x1, cx, t) - 7.5;
    const y = at(y0, y1, cy, t) - 7.5;
    // Shrinking as it travels reads as distance, and it means the drop is smaller than the badge
    // by the time it arrives instead of blotting the number out.
    const s = 1 - 0.6 * t;
    frames.push({
      transform: `translate3d(${x}px, ${y}px, 0) scale(${s})`,
      opacity: t < 0.86 ? 1 : (1 - t) / 0.14,
      offset: t,
    });
  }

  const flight = drop.animate(frames, {
    duration: 620,
    // Slow off the button, quick through the middle, settling into the badge: a thrown thing, not
    // a tweened one. Linear over a sampled curve is what makes these read as cheap.
    easing: "cubic-bezier(0.36, 0, 0.34, 1)",
    fill: "forwards",
  });

  const clean = () => drop.remove();
  flight.onfinish = clean;
  flight.oncancel = clean;

  // The badge takes the hit slightly before the drop lands, which is what makes the two read as
  // one event rather than as an animation followed by a number.
  badge.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.32)" }, { transform: "scale(1)" }],
    { duration: 380, delay: 470, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
  );
}
