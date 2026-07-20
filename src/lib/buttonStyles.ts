// Shared class builders for Cancel/Back/Close controls. Centralized so the focus-ring
// contrast, hover, and touch-target treatment can be fixed in one place instead of the
// ~15 call sites that previously copy-pasted the same class string (and drifted out of
// sync — see docs/CODEX_REVIEW_REPORT.md "Claude Fix Status" for the pass this replaced).
export type SecondaryButtonSize = "2xs" | "xs" | "sm" | "md";

// Solid navy ring instead of ring-[#c9a84c]/50: the low-opacity gold ring composited to
// ~1.4:1 against white/card backgrounds, below the 3:1 WCAG non-text contrast minimum for
// a focus indicator. Full-opacity gold alone only reaches ~2.3:1, so navy (the app's other
// brand color, ~17:1 against white) is used instead.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b1d3a] focus-visible:ring-offset-2 focus-visible:ring-offset-card";

const SECONDARY_SIZE: Record<SecondaryButtonSize, string> = {
  "2xs": "px-2.5 py-1.5 text-[11px]",
  xs: "px-3 py-2 text-xs",
  sm: "px-3.5 py-2 text-xs",
  md: "px-4 py-2 text-sm",
};

/** Boxed secondary button treatment for Cancel/Close actions in modals, forms, and toolbars. */
export function secondaryButtonClass(size: SecondaryButtonSize = "sm", extra = "") {
  return [
    SECONDARY_SIZE[size],
    "border border-[#0b1d3a]/20 bg-secondary/50 rounded-lg text-foreground/75 font-medium",
    "hover:bg-secondary hover:border-[#c9a84c]/40 hover:text-foreground",
    FOCUS_RING,
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "transition-colors",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Breadcrumb-style Back link treatment (icon + text, sits flush with page padding via -ml-2.5). */
export function backLinkButtonClass(extra = "") {
  return [
    "inline-flex items-center gap-1 -ml-2.5 px-2.5 py-1.5 rounded-lg text-sm font-medium",
    "border border-[#0b1d3a]/15 bg-secondary/30 text-foreground/75",
    "hover:text-foreground hover:bg-secondary/70 hover:border-[#0b1d3a]/25",
    FOCUS_RING,
    "transition-colors",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Icon-only dismiss (×) button. Padding + matching negative margin keeps the icon's
 *  visual size/position unchanged while giving it a larger touch/click target. */
export function iconCloseButtonClass(extra = "") {
  return [
    "inline-flex items-center justify-center p-2 -m-2 rounded-lg text-muted-foreground",
    "hover:text-foreground hover:bg-secondary/70",
    FOCUS_RING,
    "transition-colors",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
