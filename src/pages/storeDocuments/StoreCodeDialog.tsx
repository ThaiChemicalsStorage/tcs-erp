import { useId, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import {
  STORE_ISSUE_CODES, STORE_RECEIPT_CODES, STORE_ISSUE_GROUP_LABEL_KEY, STORE_RECEIPT_GROUP_LABEL_KEY,
  type StoreIssueCode, type StoreReceiptCode, type StoreIssueGroup, type StoreReceiptGroup,
} from "../../lib/storeCodes";

/**
 * เลือกรหัสก่อนสร้างใบเบิก/ใบรับคืนของสโตร์ (2026-09-23) — **ดรอปดาวน์แบ่งกลุ่ม** ตามที่เจ้าของบอกว่า
 * *"ตรงใบรับคืนสินค้าทำให้เป็น dropdown ก็ได้"* และเหมือนเมนูในโปรแกรมบัญชีเดิม · รหัสอยู่หน้าเลขที่ใบ
 * จึงต้องเลือกก่อนสร้างและเปลี่ยนภายหลังไม่ได้
 */
export function StoreCodeDialog(props:
  | { mode: "issue"; onCreate: (code: StoreIssueCode) => Promise<void>; onCancel: () => void }
  | { mode: "receipt"; onCreate: (code: StoreReceiptCode) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const selectId = useId();
  const panelRef = useDialogA11y(props.onCancel);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = props.mode === "issue"
    ? (Object.keys(STORE_ISSUE_GROUP_LABEL_KEY) as StoreIssueGroup[]).map((g) => ({
      label: t(STORE_ISSUE_GROUP_LABEL_KEY[g]),
      options: STORE_ISSUE_CODES.filter((c) => c.group === g).map((c) => ({ code: c.code as string, name: t(c.nameKey), hint: "" })),
    }))
    : (Object.keys(STORE_RECEIPT_GROUP_LABEL_KEY) as StoreReceiptGroup[]).map((g) => ({
      label: t(STORE_RECEIPT_GROUP_LABEL_KEY[g]),
      options: STORE_RECEIPT_CODES.filter((c) => c.group === g).map((c) => ({
        code: c.code as string, name: t(c.nameKey), hint: c.pair ? t("storeCode.pairOf").replace("{code}", c.pair) : "",
      })),
    }));
  const picked = groups.flatMap((g) => g.options).find((o) => o.code === code);
  const title = props.mode === "issue" ? t("storeDocs.pickIssueTitle") : t("storeDocs.pickReceiptTitle");

  const submit = async () => {
    if (!code) return;
    setBusy(true);
    try {
      if (props.mode === "issue") await props.onCreate(code as StoreIssueCode);
      else await props.onCreate(code as StoreReceiptCode);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={props.onCancel} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("storeDocs.pickHint")}</p>
          </div>
          <button onClick={props.onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-2">
          <label htmlFor={selectId} className="text-xs text-muted-foreground block">{t("storeDocs.pickLabel")}</label>
          <select id={selectId} value={code} onChange={(e) => setCode(e.target.value)} autoFocus
            className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors">
            <option value="">{t("storeDocs.pickPlaceholder")}</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.code} value={o.code}>{o.code} — {o.name}{o.hint ? ` (${o.hint})` : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {picked && (
            <p className="text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-[#866d28]">{picked.code}-</span> {picked.name}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={props.onCancel} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">{t("common.cancel")}</button>
          <button onClick={() => void submit()} disabled={!code || busy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />} {t("storeDocs.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
