import { AlertTriangle, Check, CloudOff, Loader2, PencilLine } from "lucide-react";
import type { AutoSaveState } from "../hooks/useAutoSave";
import { useI18n } from "../lib/i18n";

// แสดงสถานะการบันทึกอัตโนมัติข้าง ๆ ปุ่มบันทึกของเอกสาร (เพิ่ม 2026-08-25)
// The shared auto-save status chip every document editor renders next to its Save button.
// Deliberately quiet: auto-save is background work, so it never uses a toast and never moves the
// layout — but it is always visible, because a user who can't see that the system is saving for
// them will keep believing their work is unsaved.
export function AutoSaveIndicator({
  state,
  lastSavedAt,
  /** true เมื่อเอกสารยังไม่มีอยู่บนเซิร์ฟเวอร์ (เช่น ใบเสนอราคาที่ยังไม่เคยกดบันทึก) — เก็บได้แค่ในเครื่อง */
  localOnly = false,
}: {
  state: AutoSaveState;
  lastSavedAt: number | null;
  localOnly?: boolean;
}) {
  const { t, lang } = useI18n();

  if (localOnly) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={t("common.autoSave.localOnly.help")}>
        <CloudOff size={12} className="flex-shrink-0" />
        {t("common.autoSave.localOnly")}
      </span>
    );
  }

  if (state === "idle") return null;

  // ตามภาษาที่ผู้ใช้เลือกในระบบ ไม่ใช่ภาษาของเบราว์เซอร์ (ไทยใช้เวลาแบบ 24 ชม.)
  const time = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString(lang === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";

  const content = {
    pending: { icon: <PencilLine size={12} className="flex-shrink-0" />, text: t("common.autoSave.pending"), tone: "text-muted-foreground" },
    saving: { icon: <Loader2 size={12} className="flex-shrink-0 animate-spin" />, text: t("common.autoSave.saving"), tone: "text-muted-foreground" },
    saved: { icon: <Check size={12} className="flex-shrink-0" />, text: t("common.autoSave.saved").replace("{time}", time), tone: "text-[#2aa36b]" },
    error: { icon: <AlertTriangle size={12} className="flex-shrink-0" />, text: t("common.autoSave.error"), tone: "text-[#e05252]" },
  }[state];

  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs ${content.tone}`}>
      {content.icon}
      {content.text}
    </span>
  );
}
