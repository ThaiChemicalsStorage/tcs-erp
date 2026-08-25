import { useId } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useI18n, type TranslationKey } from "../lib/i18n";
import { useDialogA11y } from "../hooks/useDialogA11y";
import type { UnsavedRisk } from "../lib/unsavedChanges";

/**
 * กล่องเตือน "ยังไม่ได้บันทึก" ก่อนออกจากหน้าเอกสาร (เพิ่ม 2026-08-25)
 *
 * Not built on `ConfirmDialog`, and the reason is worth recording. `ConfirmDialog` has 18 call
 * sites and a strict two-button contract; adding a third action would change button order, focus
 * order and focus-trap membership for every delete and finalize confirmation in the app. The
 * semantics do not fit it either — here the *middle* action is the destructive one and the
 * *primary* is the safe one, which its `danger` prop cannot express — and this needs an inline
 * error slot for a save that fails. `docs/UI_GUIDELINES.md` already blesses this route: the same
 * judgement produced `WorkflowActionDialog` rather than bending `PromptDialog`.
 */

export interface UnsavedChangesDialogProps {
  open: boolean;
  /** เหตุผลที่งานเสี่ยงหาย — ใช้เลือกข้อความอธิบาย */
  risk: UnsavedRisk;
  /** เลขที่หรือชื่อเอกสาร แสดงไว้ให้เห็นว่ากำลังพูดถึงใบไหน */
  documentLabel: string;
  busy: boolean;
  /** กด "บันทึก" แล้วไม่สำเร็จ — กล่องต้องไม่ปิดและต้องไม่พาออกจากหน้า */
  saveFailed: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

const MESSAGE_KEY: Record<Exclude<UnsavedRisk, "none">, TranslationKey> = {
  new: "common.unsaved.message.new",
  notAutoSaved: "common.unsaved.message.notAutoSaved",
  autoSaveFailed: "common.unsaved.message.autoSaveFailed",
};

// เปิดเฉพาะตอนมีอะไรต้องถามจริง ๆ เพื่อให้ hook โฟกัส/trap ทำงานเฉพาะตอนนั้น (แบบเดียวกับ ConfirmDialog)
export function UnsavedChangesDialog(props: UnsavedChangesDialogProps) {
  if (!props.open || props.risk === "none") return null;
  return <UnsavedChangesDialogPanel {...props} />;
}

function UnsavedChangesDialogPanel({
  risk,
  documentLabel,
  busy,
  saveFailed,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  const messageKey = MESSAGE_KEY[risk as Exclude<UnsavedRisk, "none">];

  return (
    // print:hidden เพราะกล่องนี้ลอยอยู่เหนือหน้าเอกสารที่สั่งพิมพ์ได้ — ถ้าค้างอยู่ต้องไม่ติดไปในกระดาษ
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={busy ? undefined : onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          {/* สีทองไม่ใช่สีแดง — นี่คือการเตือนก่อนทำสิ่งปกติ ไม่ใช่การยืนยันลบ และไม่ควรแย่งสายตากับปุ่ม "ไม่บันทึก" */}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#c9a84c]/10">
            <AlertTriangle size={17} className="text-[#c9a84c]" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              {t("common.unsaved.title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(messageKey)}</p>
            {documentLabel && <p className="text-xs font-mono text-[#c9a84c] mt-1.5 truncate">{documentLabel}</p>}
            {saveFailed && <p className="text-xs text-[#e05252] mt-1.5 leading-relaxed">{t("common.unsaved.saveFailed")}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
            {t("common.unsaved.stay")}
          </button>
          {/* ปุ่มทำลายงานใช้เส้นขอบแดง ไม่ใช่พื้นแดงทึบ — พื้นทึบสงวนไว้ให้ปุ่มยืนยันหลัก ซึ่งในกล่องนี้เป็นสีทอง */}
          <button onClick={onDiscard} disabled={busy} className="px-3.5 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors disabled:opacity-60">
            {t("common.unsaved.discard")}
          </button>
          {/* โฟกัสเริ่มต้นอยู่ที่ "บันทึก" — กด Enter แล้วต้องได้ผลลัพธ์ที่ปลอดภัย ไม่ใช่ทิ้งงาน */}
          <button
            autoFocus
            onClick={onSave}
            disabled={busy}
            className="px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
