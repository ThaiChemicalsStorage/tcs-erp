/**
 * Inline Thai validation error shown directly below an invalid field — standard
 * `text-xs text-[#e05252] mt-1` styling already used ad hoc across the app (e.g. QuoteDocument.tsx's
 * workflow-comment modal), formalized as one shared component (added 2026-07-16, required-field
 * validation pass). Renders nothing when there's no error, so it's safe to always mount.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-[#e05252] mt-1">{message}</p>;
}
