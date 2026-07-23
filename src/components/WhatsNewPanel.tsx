import { useState } from "react";
import { Sparkles } from "lucide-react";
import { WHATS_NEW_ENTRIES, hasUnseenWhatsNew, markWhatsNewSeen } from "../lib/whatsNew";
import { useI18n } from "../lib/i18n";

function formatThaiDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export function WhatsNewPanel({ currentUserId }: { currentUserId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(() => hasUnseenWhatsNew(currentUserId));

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unseen) {
            markWhatsNewSeen(currentUserId);
            setUnseen(false);
          }
        }}
        className="relative text-muted-foreground hover:text-foreground transition-colors p-2"
        aria-label={t("whatsNew.bellAria")}
      >
        <Sparkles size={18} />
        {unseen && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#c9a84c]" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-card border border-border rounded-lg shadow-xl z-20 overflow-hidden flex flex-col max-h-[28rem]">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                {t("whatsNew.title")}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {WHATS_NEW_ENTRIES.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-10">{t("whatsNew.empty")}</p>
              ) : (
                WHATS_NEW_ENTRIES.map((entry) => (
                  <div key={entry.id} className="px-4 py-3 border-b border-border/60 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c9a84c] flex-shrink-0" />
                      <p className="text-xs font-semibold text-foreground">{entry.title}</p>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5 ml-3">{formatThaiDate(entry.date)}</p>
                    <ul className="mt-1.5 ml-3 space-y-1">
                      {entry.bullets.map((b, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
                          <span className="flex-shrink-0">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
