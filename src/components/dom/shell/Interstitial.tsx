import type { ReactNode } from "react";

/**
 * The shell for a page that exists to say one thing and offer one way onward: not found, something
 * broke, the payment did not go through.
 *
 * Opaque olive on purpose. Every one of these is reached in a state of mild irritation, and the
 * jungle rendering behind a wall of text costs a frame for nobody -- the canvas is still mounted by
 * the root layout, so the background here is what stops it being drawn for.
 */
export default function Interstitial({
  eyebrow,
  title,
  children,
  actions,
  footnote,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    // The <main id="main"> the skip link targets belongs to the caller, not here: two of the four
    // pages that use this already supply one, and a landmark nested inside a landmark is worse
    // than the missing one it would be fixing.
    <div className="relative z-10 flex min-h-svh flex-col items-center justify-center bg-olive-950 px-6 py-28 text-center sm:py-32">
      <p className="caps-gold text-[11px]">{eyebrow}</p>
      <h1 className="mt-4 max-w-[16ch] font-display text-[clamp(2rem,7vw,3.5rem)] leading-[1.1] text-balance text-cream-50">
        {title}
      </h1>
      <div className="gold-rule mt-8 w-full max-w-xs text-xs">✦</div>
      <div className="mt-8 max-w-[46ch] leading-relaxed text-cream-200/75">{children}</div>
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">{actions}</div>
      {footnote && (
        <p className="mt-12 max-w-[52ch] text-xs leading-relaxed text-cream-300/60">{footnote}</p>
      )}
    </div>
  );
}
