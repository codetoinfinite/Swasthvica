"use client";
import type { ComponentProps, ReactNode } from "react";

/**
 * One labelled control.
 *
 * The label is a real <label>, not a placeholder: a placeholder disappears the moment someone
 * starts typing, which is exactly when they most need to know which box they are in, and it is
 * invisible to a screen reader once the field has a value.
 *
 * `aria-describedby` points at the error only when there is one, and the error text sits in a live
 * region so it is announced when it appears rather than only when the field is re-entered.
 */
export const shell =
  "w-full rounded-lg border bg-olive-950/50 px-4 py-3 text-cream-100 transition-colors placeholder:text-cream-300/25 focus:border-brass-500";

export function Field({
  label,
  name,
  error,
  hint,
  className = "",
  ...rest
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] tracking-[0.18em] text-cream-300/65 uppercase">
        {label}
        {rest.required && <span className="ml-1 text-brass-400/70">*</span>}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        // className is destructured and appended rather than left in `rest`: the spread below
        // sits after this attribute, so a caller passing one used to silently replace the whole
        // shell -- borders, padding, colours -- with whatever it passed.
        className={`${shell} mt-2 ${error ? "border-amber-400/70" : "border-olive-600"} ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-[11.5px] text-cream-300/60">
          {hint}
        </p>
      )}
      <p id={`${id}-err`} role="alert" className="mt-1.5 text-[11.5px] text-amber-200/90 empty:mt-0">
        {error ?? ""}
      </p>
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  options,
  className = "",
  ...rest
}: ComponentProps<"select"> & { label: string; name: string; error?: string; options: readonly string[] }) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] tracking-[0.18em] text-cream-300/65 uppercase">
        {label}
        {rest.required && <span className="ml-1 text-brass-400/70">*</span>}
      </label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        /* The option list is painted by the OS, not by us: without explicit colours on the options
           the menu renders black-on-black in a light-mode Chrome on Windows. */
        className={`${shell} mt-2 ${error ? "border-amber-400/70" : "border-olive-600"} [&>option]:bg-olive-900 [&>option]:text-cream-100 ${className}`}
        {...rest}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <p id={`${id}-err`} role="alert" className="mt-1.5 text-[11.5px] text-amber-200/90 empty:mt-0">
        {error ?? ""}
      </p>
    </div>
  );
}
