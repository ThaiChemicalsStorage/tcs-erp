import type { LucideIcon } from "lucide-react";

/**
 * Shared "genuinely no data yet" state — consolidates a pattern previously copy-pasted across
 * `ProductList.tsx`, `QuoteList.tsx`, `AuditLogPage.tsx`, and `DashboardPage.tsx` with slightly
 * different markup each time. Always pairs a short title with a one-line explanation and,
 * where there's a real next step, an action button — a plain "No data" with nothing else tells
 * the user nothing about what to do about it.
 */
export function EmptyState({
  icon: Icon, title, description, actionLabel, onAction, compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Tighter padding for use inside an already-boxed table/card area rather than a full page. */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 ${compact ? "py-16" : "p-12"}`}>
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
        <Icon size={22} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-1 flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
