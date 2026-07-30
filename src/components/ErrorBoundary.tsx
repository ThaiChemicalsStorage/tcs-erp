import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "../lib/i18n";

/**
 * This app previously had no error boundary anywhere — a real incident (2026-07-22): a client-side
 * crash rendering the new Scope of Work page (an unguarded `undefined` field from a real MongoDB
 * document) went completely blank white, since React unmounts the whole tree on an uncaught render
 * error with nothing to catch it. Wraps the page-content area (see `App.tsx`) so a future bug in
 * any one page degrades to a recoverable in-place error screen instead of taking down the entire
 * app — the sidebar/header shell around it is a sibling, not a child, so it stays interactive.
 *
 * **Caller must pass `key={effectiveNav}`** (or equivalent) — a caught error otherwise sticks in
 * `hasError: true` forever (React error boundaries don't auto-reset when their children's content
 * changes), permanently stranding the user on this fallback screen even after navigating to a
 * different, perfectly fine page. Changing `key` forces React to unmount/remount this component
 * fresh on the next navigation, which is what actually clears the error state — the "reload the
 * page" button below is a fallback for recovering the *current* crashed page, not the only way out.
 */
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Split out from the class component below purely to call `useI18n()` — React error boundaries
 * must be class components (no hook-based equivalent exists), but the actual presentational output
 * doesn't need to be. Previously the only hardcoded-Thai user-facing text in the app: every other
 * string routes through `t()`, and this is exactly the screen where an English-mode user most needs
 * to understand what happened (Impeccable shell audit 2026-07-30). */
function ErrorBoundaryFallback() {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <div className="w-12 h-12 rounded-full bg-[#e05252]/10 flex items-center justify-center">
        <AlertTriangle size={22} className="text-[#e05252]" />
      </div>
      <p className="text-sm font-medium text-foreground">{t("boot.errorBoundary.title")}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{t("boot.errorBoundary.message")}</p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
      >
        <RotateCw size={14} /> {t("boot.errorBoundary.reload")}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[ErrorBoundary] a page crashed while rendering", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback />;
    }
    return this.props.children;
  }
}
