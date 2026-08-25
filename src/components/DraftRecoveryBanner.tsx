import { History, X } from "lucide-react";
import { useI18n } from "../lib/i18n";

// แถบเสนอให้กู้คืนร่างที่ระบบเก็บไว้ในเครื่อง (เพิ่ม 2026-08-25)
// The "we kept your unsaved work" banner. It is shown, never auto-applied: silently replacing a
// freshly opened form with an older abandoned draft would be worse than losing it, so the user is
// told exactly when the snapshot was taken and chooses.
export function DraftRecoveryBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const { t, lang } = useI18n();
  // ตามภาษาที่ผู้ใช้เลือกในระบบ ไม่ใช่ภาษาของเบราว์เซอร์ — ทั้งหน้าเป็นภาษาไทยแต่วันที่ขึ้นเป็นอังกฤษจะดูขัดกัน
  // Follows the app's own language, not the browser's: a Thai page showing "Aug 25" reads as a bug.
  const when = new Date(savedAt).toLocaleString(lang === "th" ? "th-TH" : "en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-[#c9a84c]/35 bg-[#c9a84c]/10 print:hidden">
      <History size={16} className="text-[#c9a84c] flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{t("common.draftRecovery.title")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("common.draftRecovery.description").replace("{time}", when)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onRestore}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#b8973f] transition-colors"
        >
          {t("common.draftRecovery.restore")}
        </button>
        <button
          onClick={onDiscard}
          title={t("common.draftRecovery.discard")}
          aria-label={t("common.draftRecovery.discard")}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={12} /> {t("common.draftRecovery.discard")}
        </button>
      </div>
    </div>
  );
}
