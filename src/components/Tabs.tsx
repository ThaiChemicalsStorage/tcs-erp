import { useEffect, useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

/**
 * แถบแท็บที่ใช้ร่วมกันได้ (เพิ่ม 2026-09-14 พร้อมแท็บแผนกของแดชบอร์ด)
 *
 * WAI-ARIA tabs pattern: roving tabIndex (only the active tab is in the Tab order), ←/→ move and
 * select, Home/End jump to the ends. Selection follows focus — each panel here is cheap to switch to
 * and the previous content is not lost, so there is no reason for a separate "activate" step.
 *
 * The bar scrolls horizontally instead of wrapping so nine department tabs stay on one line at
 * laptop widths, and the active tab is scrolled into view whenever it changes (e.g. restored from
 * the URL on a narrow window).
 */
export function Tabs<K extends string>({ items, active, onChange, idPrefix, ariaLabel }: {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  idPrefix: string;
  ariaLabel: string;
}) {
  const refs = useRef(new Map<K, HTMLButtonElement>());

  useEffect(() => {
    refs.current.get(active)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const move = (to: number) => {
    const next = items[(to + items.length) % items.length];
    if (!next) return;
    onChange(next.key);
    refs.current.get(next.key)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowRight") move(index + 1);
    else if (e.key === "ArrowLeft") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-end gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin] border-b border-border">
      {items.map((item, index) => {
        const selected = item.key === active;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            ref={(el) => { if (el) refs.current.set(item.key, el); else refs.current.delete(item.key); }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.key}`}
            aria-controls={`${idPrefix}-panel-${item.key}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 rounded-t-md ${
              selected
                ? "border-[#c9a84c] text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {Icon && <Icon size={14} className={selected ? "text-[#c9a84c]" : undefined} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
