import type { ReactNode } from "react";

/**
 * A form field label with a red `*` required marker — the standard pattern already used across the
 * app (e.g. ProductForm.tsx) formalized into one shared component (added 2026-07-16, required-field
 * validation pass) so Quotation/Scope of Work don't each hand-roll the same `<span className="text-
 * [#e05252]">*</span>` markup. Pass `required={false}` for the rare explicitly-optional field where
 * showing a plain label (no marker) is still clearer than omitting the component entirely.
 */
export function RequiredFieldLabel({
  children,
  required = true,
  className = "text-xs text-muted-foreground block mb-1",
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  className?: string;
  /** Pairs this label with its field's `id` so screen readers announce the field's name — pass the
   * same string as the input/select/textarea's own `id` prop. */
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {children} {required && <span className="text-[#e05252]">*</span>}
    </label>
  );
}
