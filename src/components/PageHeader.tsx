import type { ReactNode } from "react";

/**
 * Shared page header — title + one-line description of what the page is for, plus an optional
 * primary action slot. Answers "where am I / what can I do here" at a glance, consistently across
 * every module instead of each page hand-rolling its own heading markup.
 */
export function PageHeader({
  title, description, actions, path,
}: {
  title: string;
  /** One sentence, plain business language — what this page is for, not a restatement of the title. */
  description?: string;
  actions?: ReactNode;
  /** Optional short trail, e.g. "การขาย / ใบเสนอราคา" — this app has no URL router, so this is a static orientation cue, not a clickable breadcrumb. */
  path?: string;
}) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3">
      <div>
        {path && <p className="text-[11px] text-muted-foreground font-mono mb-1">{path}</p>}
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
