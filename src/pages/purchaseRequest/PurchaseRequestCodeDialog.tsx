import { useState } from "react";
import { FilePlus2, Plus } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { PURCHASE_REQUEST_CODES, PURCHASE_REQUEST_CODE_LABEL_KEY, type PurchaseRequestCode } from "../../lib/purchaseRequest";
import { ChoiceDialog } from "./docShared";

/**
 * เลือกฝ่ายที่ขอซื้อก่อนเปิดใบเปล่า (2026-09-23) — รหัสจะไปอยู่หน้าเลขที่ใบ จึงต้องเลือก *ก่อน* สร้าง
 * ใบที่สร้างจากโครงการหรือใบสั่งผลิตไม่ผ่านหน้าต่างนี้ เพราะรหัสรู้อยู่แล้วจากต้นทาง (ED / FD)
 * หน้าตาแบบใหม่ (2026-09-30): กล่อง 480 ตัวเลือกเป็นการ์ด radio (รหัส mono + ชื่อฝ่าย)
 */
export function PurchaseRequestCodeDialog({
  onCreate, onCancel,
}: {
  onCreate: (code: PurchaseRequestCode) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState<PurchaseRequestCode>("PR");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try { await onCreate(code); } finally { setBusy(false); }
  };

  return (
    <ChoiceDialog<PurchaseRequestCode>
      title={t("purchaseRequest.code.pickTitle")}
      description={t("purchaseRequest.code.pickHint")}
      icon={FilePlus2}
      groupLabel={t("purchaseRequest.code.label")}
      required
      options={PURCHASE_REQUEST_CODES.map((c) => ({ key: c, code: c, label: t(PURCHASE_REQUEST_CODE_LABEL_KEY[c]) }))}
      value={code}
      onChange={setCode}
      confirmLabel={t("purchaseRequest.code.create")}
      confirmIcon={Plus}
      busy={busy}
      onConfirm={() => void submit()}
      onCancel={onCancel}
    />
  );
}
