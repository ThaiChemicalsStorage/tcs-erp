import { useId, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, FilePlus2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import {
  STORE_ISSUE_CODES, STORE_RECEIPT_CODES, STORE_ISSUE_GROUP_LABEL_KEY, STORE_RECEIPT_GROUP_LABEL_KEY,
  type StoreIssueCode, type StoreReceiptCode, type StoreIssueGroup, type StoreReceiptGroup,
} from "../../lib/storeCodes";
import { Field, SelectBox } from "../../components/ui/Field";
import { FormDialog } from "../stock/inventoryUi";
import { CodeChip, Pill } from "../receivingReport/receivingUi";

/** ใบเบิกของแผนกที่กำลังจะทำใบจ่ายให้ — โชว์เป็นกล่องสรุปเหนือช่องรหัส (แท็บ "ใบเบิกจากแผนก") */
export interface StoreCodeDialogSource {
  number: string;
  jobCode: string;
  /** บรรทัดรอง: ลูกค้า · แผนก / ทีม */
  detail: string;
  outstandingLines: number;
}

/**
 * เลือกรหัสก่อนสร้างใบเบิก/ใบรับคืนของสโตร์ (2026-09-23) — **ดรอปดาวน์แบ่งกลุ่ม** ตามที่เจ้าของบอกว่า
 * *"ตรงใบรับคืนสินค้าทำให้เป็น dropdown ก็ได้"* และเหมือนเมนูในโปรแกรมบัญชีเดิม · รหัสอยู่หน้าเลขที่ใบ
 * จึงต้องเลือกก่อนสร้างและเปลี่ยนภายหลังไม่ได้
 *
 * ดีไซน์ใหม่ 2026-09-30: กล่อง 480 แบบเดียวกับกล่องอื่นของคลัง (ไอคอนในวงกลม · ช่อง "รหัส *" · ชิปรหัสสีกรมท่า
 * บอกว่าเลขที่ใบจะขึ้นต้นด้วยอะไร) · เลือกแล้วต้องกด "สร้างเอกสาร" เสมอ
 */
export function StoreCodeDialog(props: (
  | { mode: "issue"; onCreate: (code: StoreIssueCode) => Promise<void>; onCancel: () => void }
  | { mode: "receipt"; onCreate: (code: StoreReceiptCode) => Promise<void>; onCancel: () => void }
) & {
  /** รหัสที่เลือกไว้ให้ก่อน และบรรทัดบอกว่าสร้างให้ใบไหน — ใช้ตอนทำใบจ่ายจากใบเบิกที่แผนกส่งมา (2026-09-24) */
  initialCode?: string;
  context?: string;
  source?: StoreCodeDialogSource;
}) {
  const { t } = useI18n();
  const selectId = useId();
  const [code, setCode] = useState(props.initialCode ?? "");
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

  const prefix = picked && (
    <span className="flex items-center gap-2 min-w-0">
      <CodeChip dark>{picked.code}-</CodeChip>
      <span className="text-sm text-[#3d5173] truncate">{picked.name}</span>
    </span>
  );

  return (
    <FormDialog
      icon={props.mode === "issue" ? ArrowUpFromLine : ArrowDownToLine}
      title={title}
      description={t("storeDocs.pickHint")}
      busy={busy}
      confirmLabel={t("storeDocs.create")}
      confirmIcon={FilePlus2}
      confirmDisabled={!code}
      onConfirm={() => void submit()}
      onCancel={props.onCancel}
    >
      {(props.context || props.source) && (
        <div className="flex flex-col gap-1.5">
          {props.context && <span className="text-xs text-muted-foreground">{props.context}</span>}
          {props.source && (
            <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex items-center gap-3">
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-mono text-[13px] font-medium text-foreground truncate">
                  {[props.source.number, props.source.jobCode].filter(Boolean).join(" · ")}
                </span>
                {props.source.detail && <span className="text-[13px] text-[#3d5173] truncate">{props.source.detail}</span>}
              </div>
              <Pill tone="amber" label={t("storeDocs.sourceOutstanding").replace("{n}", String(props.source.outstandingLines))} />
            </div>
          )}
        </div>
      )}
      <Field label={t("storeDocs.pickLabel")} htmlFor={selectId} required help={props.mode === "issue" ? prefix : undefined}>
        <SelectBox id={selectId} value={code} onChange={(e) => setCode(e.target.value)} autoFocus>
          <option value="">{t("storeDocs.pickPlaceholder")}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.code} value={o.code}>{o.code} — {o.name}{o.hint ? ` (${o.hint})` : ""}</option>
              ))}
            </optgroup>
          ))}
        </SelectBox>
      </Field>
      {props.mode === "receipt" && picked && (
        <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg">{prefix}</div>
      )}
    </FormDialog>
  );
}
