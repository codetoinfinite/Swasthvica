"use client";
import { MAX_QTY } from "@/lib/cart";

/**
 * The − 1 + control, once.
 *
 * Two details are not cosmetic. At a quantity of one the minus does not decrement, it deletes the
 * line, and the announced label has to say the thing that is about to happen rather than the thing
 * the glyph looks like. And the number is `tabular-nums` in a fixed box: proportional digits make
 * the + button jump left as the count crosses from 9 to 10, under the finger that is pressing it.
 */
export default function QtyStepper({
  name,
  qty,
  onChange,
  size = "md",
}: {
  name: string;
  qty: number;
  onChange: (qty: number) => void;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  return (
    <div className="flex items-center rounded-full border border-olive-600">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        className={`grid ${box} place-items-center rounded-full leading-none transition-colors hover:text-brass-400`}
        aria-label={qty === 1 ? `Remove ${name}` : `Decrease ${name} quantity`}
      >
        −
      </button>
      {/* w-7, not w-5: tabular two-digit needs the room once 99 is reachable */}
      <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= MAX_QTY}
        className={`grid ${box} place-items-center rounded-full leading-none transition-colors hover:text-brass-400 disabled:cursor-not-allowed disabled:text-cream-300/25 disabled:hover:text-cream-300/25`}
        aria-label={`Increase ${name} quantity`}
      >
        +
      </button>
    </div>
  );
}
