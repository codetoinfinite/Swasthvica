"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/dom/shell/Buttons";
import type { FormState } from "@/app/account/actions";

/**
 * The two pieces every account form repeats.
 *
 * Both exist so that a failed submission is reported in one place with one voice. A form that
 * scatters its errors -- one under the field, one in a toast, one silently in the console -- is a
 * form people abandon.
 */

export function Notice({ state }: { state: FormState | undefined }) {
  if (!state?.error && !state?.ok) return null;
  const bad = Boolean(state.error);
  return (
    // aria-live rather than role="alert" for the success case: an alert interrupts, and "Saved."
    // does not warrant interrupting. The error keeps assertive, because it stops the customer.
    <p
      aria-live={bad ? "assertive" : "polite"}
      className={`mb-6 rounded-lg border px-4 py-3 text-sm leading-relaxed ${
        bad
          ? "border-amber-400/40 bg-amber-400/5 text-amber-100/90"
          : "border-brass-600/40 bg-brass-500/5 text-brass-200/90"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function Submit({
  pending,
  children,
  weight = "solid",
  className = "",
}: {
  pending: boolean;
  children: ReactNode;
  weight?: "solid" | "outline" | "quiet";
  className?: string;
}) {
  return (
    <Button type="submit" weight={weight} disabled={pending} className={className}>
      {/* The label changes rather than a spinner appearing beside it, so the button's width does
          not jump under a thumb that is still on its way down. */}
      {pending ? "Working…" : children}
    </Button>
  );
}
