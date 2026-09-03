import type { ComponentProps, ReactNode } from "react";
import IntentLink from "@/components/dom/IntentLink";

/**
 * The two button weights this site uses, in one place.
 *
 * They were being retyped as a forty-character class string per call site, which is how the
 * checkout ends up with a 3.5rem-tall primary and the cart page a 3.25rem one. `min-h-12` is not
 * decoration: a 48px touch target is the floor, and `py-4` alone does not guarantee it once the
 * font falls back.
 */
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-8 text-[13px] font-medium tracking-[0.16em] uppercase transition-colors disabled:cursor-not-allowed sm:px-10 sm:text-sm";

export const solid = `${base} bg-brass-500 text-olive-950 hover:bg-brass-400 disabled:bg-olive-600/60 disabled:text-cream-200/45`;
export const outline = `${base} border border-brass-500/80 text-brass-300 hover:bg-brass-500 hover:text-olive-950 disabled:border-olive-600 disabled:text-cream-300/35 disabled:hover:bg-transparent disabled:hover:text-cream-300/35`;
export const quiet = `${base} border border-olive-600 text-cream-200/80 hover:border-brass-500/70 hover:text-brass-200`;

type Weight = "solid" | "outline" | "quiet";
const cls: Record<Weight, string> = { solid, outline, quiet };

export function LinkButton({
  weight = "solid",
  className = "",
  children,
  ...rest
}: ComponentProps<typeof IntentLink> & { weight?: Weight; children: ReactNode }) {
  return (
    <IntentLink className={`${cls[weight]} ${className}`} {...rest}>
      {children}
    </IntentLink>
  );
}

export function Button({
  weight = "solid",
  className = "",
  children,
  ...rest
}: ComponentProps<"button"> & { weight?: Weight; children: ReactNode }) {
  return (
    <button className={`${cls[weight]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
