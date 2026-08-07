import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

/** Ignore a pointerup this far (px) from its pointerdown — that was a scroll, not a tap. */
const TAP_SLOP = 10;

/**
 * Text that turns into an input in place — double-click on a mouse, a single tap on touch/pen,
 * Enter or Space when focused. Commits on blur or Enter, cancels on Escape, and refuses a blank
 * value (the server's sanitizer rejects those, so reverting beats a 400).
 *
 * No visible affordance by design: the checklist row already carries a ✕ remove button, and a
 * second icon per row would crowd it. The cost of that choice is discoverability, so the trigger is
 * a real focusable `button` with an explanatory `aria-label`/`title` — a keyboard or screen-reader
 * user reaches the rename the same way they reach any other control, rather than being locked out
 * of a mouse-only gesture.
 *
 * Why pointer type rather than a plain onClick: a single click activating on desktop would fire
 * whenever someone clicks a label incidentally, but requiring a double-tap on touch is awkward and
 * poorly supported. `pointerType` lets each input do what's idiomatic for it from one handler. The
 * tap-slop check keeps a finger-scroll over a long checklist from opening an editor.
 */
export function InlineEditableLabel({
  value,
  onCommit,
  maxLength,
  className = "",
  inputClassName = "",
  editHint,
}: {
  value: string;
  onCommit: (next: string) => void;
  maxLength: number;
  className?: string;
  inputClassName?: string;
  /** Accessible name for the trigger, e.g. "แก้ไขชื่อรายการ" — the label text is appended. */
  editHint: string;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    // Blank is not a valid label (sanitizeServiceTemplateSections rejects it) — treat it as a
    // cancel so the user can't lose a name to a stray select-all + blur.
    if (!next || next === value) return;
    onCommit(next.slice(0, maxLength));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={maxLength}
        aria-label={editHint}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          // The checklist lives inside a table with its own key handling; keep edits local.
          e.stopPropagation();
        }}
        className={`px-1.5 py-0.5 bg-secondary border border-[#c9a84c]/50 rounded outline-none ${inputClassName}`}
      />
    );
  }

  return (
    <button
      type="button"
      title={`${editHint} — ${t("inlineEdit.hint")}`}
      aria-label={`${editHint}: ${value}`}
      onDoubleClick={startEditing}
      onPointerDown={(e) => { pointerStart.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse") return; // mouse waits for the double-click above
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start) return;
        if (Math.abs(e.clientX - start.x) > TAP_SLOP || Math.abs(e.clientY - start.y) > TAP_SLOP) return;
        startEditing();
      }}
      onPointerCancel={() => { pointerStart.current = null; }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEditing(); }
      }}
      className={`text-left rounded-sm hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a84c]/60 transition-colors ${className}`}
    >
      {value}
    </button>
  );
}
