export type StatusBadgeStatus = "archived" | "active" | "inactive";

// Background/border keep each status's brand hue; text is a separately-darkened variant of the
// same hue (accessibility hardening pass, mirrors src/lib/quotes.tsx's statusStyle) — the original
// scheme reused one hex for bg/10 + text + border/20, which put mid-tone text directly on a
// ~10%-tint-of-itself background and failed WCAG AA contrast (as low as 2.4:1 for "inactive").
// Same darkened hexes already established for the identical brand colors elsewhere in the app.
const STATUS_CLASSES: Record<StatusBadgeStatus, string> = {
  archived: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  active: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
  inactive: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
};

export function StatusBadge({ status, label }: { status: StatusBadgeStatus; label: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_CLASSES[status]}`}>
      {label}
    </span>
  );
}
