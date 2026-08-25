import { useRef, useState } from "react";
import { Check, AlertTriangle, Camera, X, Loader2, ImageOff, Ruler, ToggleLeft } from "lucide-react";
import type { ServiceChecklistItemDef, ServiceChecklistItemKind } from "../lib/serviceTemplates";
import type { ServiceChecklistItemValue, ServiceChecklistItemPhoto } from "../lib/serviceReports";
import { MAX_CHECKLIST_ITEM_LABEL_LENGTH } from "../lib/validation/serviceReportValidation";
import { InlineEditableLabel } from "./InlineEditableLabel";
import { useI18n } from "../lib/i18n";

// แถวหนึ่งของตารางรายการตรวจเช็ค (ใช้ภายใน <tbody>) — คอลัมน์ "รายการตรวจเช็ค / ปกติ / ผิดปกติ"
// เหมือนแบบฟอร์ม SERVICE CHECK SHEET ต้นฉบับ หรือช่องกรอกค่าที่วัดได้แทนคอลัมน์ปกติ/ผิดปกติ
// One row of the checklist table (used inside a <tbody>) — "Checklist Item / Normal / Abnormal"
// columns matching the real SERVICE CHECK SHEET reference form, or a measurement input spanning
// the two check columns for a measurement-kind item.
// Selecting "Abnormal" immediately reveals a required detail field + photo attachments in a wide
// row directly below (never silently cleared if the status is later changed back to Normal — the
// caller only clears it on an explicit user action).
export function ServiceChecklistItemControl({
  itemDef,
  value,
  onChange,
  disabled,
  error,
  onUploadPhoto,
  onDeletePhoto,
  photoUploadDisabledReason,
  onRemove,
  onRename,
  onChangeKind,
}: {
  itemDef: ServiceChecklistItemDef;
  value: ServiceChecklistItemValue;
  onChange: (next: ServiceChecklistItemValue) => void;
  disabled: boolean;
  error?: string;
  onUploadPhoto?: (file: File) => Promise<void>;
  onDeletePhoto?: (photoId: string) => Promise<void>;
  // When set, photo upload/delete controls render but stay disabled with this as an explanatory
  // title — used for the "new report" preview, where the report (and thus a place to store photo
  // bytes) doesn't exist yet.
  photoUploadDisabledReason?: string;
  // When set, the table gains a trailing remove-item column (per-report checklist customization —
  // each job differs, see docs/MODULES/Service.md); the parent only passes this while the report
  // is an editable Draft.
  onRemove?: () => void;
  // When set, the label becomes editable in place (double-click / tap / Enter). Gated by the same
  // `structureEditable` rule as onRemove. A rename keeps the item's key, so any recorded
  // status/abnormalDetail/photos survive it — see docs/MODULES/Service.md.
  onRename?: (label: string) => void;
  // When set, a small toggle next to the label lets this report switch the item between the
  // Normal/Abnormal checkbox pair and the measurement-value input — same
  // gated-while-editable-Draft rule as onRemove/onRename. Switching never touches `value` (status/
  // abnormalDetail/measurementValue/photos all already coexist on every item regardless of kind —
  // see `ServiceChecklistItemValue`), so toggling back and forth never loses recorded data.
  onChangeKind?: (kind: ServiceChecklistItemKind) => void;
}) {
  const { t } = useI18n();
  const isAbnormal = value.status === "abnormal";
  const isNormal = value.status === "normal";
  const totalCols = onRemove ? 4 : 3;

  return (
    <>
      <tr className="border-b border-border/40 last:border-b-0 hover:bg-secondary/20 transition-colors">
        <td className="py-2.5 pl-5 pr-3 text-sm text-foreground align-middle">
          {/* Display-only bullet. Deliberately NOT stored in the label data: rendering it here
              applies it to every seeded item and every "+ เพิ่มรายการ" addition with no migration
              and no way to double-dash, and keeps print/export/validation reading a clean label. */}
          <span className="text-muted-foreground mr-1.5" aria-hidden="true">-</span>
          {onRename ? (
            <InlineEditableLabel
              value={itemDef.label}
              onCommit={onRename}
              maxLength={MAX_CHECKLIST_ITEM_LABEL_LENGTH}
              editHint={t("service.checklist.renameItem")}
              inputClassName="text-sm w-full max-w-md"
            />
          ) : (
            itemDef.label
          )}
          {itemDef.kind === "measurement" && itemDef.unit && <span className="text-muted-foreground"> ({itemDef.unit})</span>}
          {onChangeKind && (
            <button
              type="button"
              title={itemDef.kind === "measurement" ? t("service.checklist.switchToNormalAbnormal") : t("service.checklist.switchToMeasurement")}
              aria-label={itemDef.kind === "measurement" ? t("service.checklist.switchToNormalAbnormal") : t("service.checklist.switchToMeasurement")}
              onClick={() => onChangeKind(itemDef.kind === "measurement" ? "normalAbnormal" : "measurement")}
              className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/50 hover:text-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors align-middle"
            >
              {itemDef.kind === "measurement" ? <ToggleLeft size={13} /> : <Ruler size={13} />}
            </button>
          )}
        </td>
        {itemDef.kind === "measurement" ? (
          <td colSpan={2} className={`py-2 px-3 ${onRemove ? "" : "pr-5"}`}>
            <input
              type="text"
              value={value.measurementValue}
              onChange={(e) => onChange({ ...value, measurementValue: e.target.value })}
              disabled={disabled}
              placeholder={t("service.checklist.measurementPlaceholder")}
              className={`h-9 w-full px-3 text-sm bg-secondary border rounded-lg outline-none transition-colors disabled:opacity-60 ${
                error ? "border-[#e05252]/60" : "border-border focus:border-[#c9a84c]/50"
              }`}
            />
          </td>
        ) : (
          <>
            <td className="py-2 px-2 text-center align-middle w-20">
              <CheckboxCell
                variant="normal"
                active={value.status === "normal"}
                disabled={disabled}
                label={t("service.checklist.normal")}
                onClick={() => onChange({ ...value, status: value.status === "normal" ? "not_selected" : "normal" })}
              />
            </td>
            <td className={`py-2 px-2 ${onRemove ? "" : "pr-5"} text-center align-middle w-20`}>
              <CheckboxCell
                variant="abnormal"
                active={isAbnormal}
                disabled={disabled}
                label={t("service.checklist.abnormal")}
                onClick={() => onChange({ ...value, status: isAbnormal ? "not_selected" : "abnormal" })}
              />
            </td>
          </>
        )}
        {onRemove && (
          <td className="py-2 px-2 pr-4 text-center align-middle w-10">
            <button
              type="button"
              title={t("service.checklist.removeItem")}
              aria-label={t("service.checklist.removeItem")}
              onClick={onRemove}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground/50 hover:text-[#e05252] hover:bg-[#e05252]/10 transition-colors"
            >
              <X size={13} />
            </button>
          </td>
        )}
      </tr>
      {error && (
        <tr>
          <td colSpan={totalCols} className="pl-5 pr-5 pb-1.5"><p className="text-xs text-[#e05252]">{error}</p></td>
        </tr>
      )}
      {(isAbnormal || isNormal) && (
        <tr>
          <td colSpan={totalCols} className="pl-5 pr-5 pb-3">
            <div className={`pl-3 border-l-2 space-y-2 ${isAbnormal ? "border-[#e05252]/40" : "border-border"}`}>
              <textarea
                value={value.abnormalDetail}
                onChange={(e) => onChange({ ...value, abnormalDetail: e.target.value })}
                disabled={disabled}
                rows={2}
                placeholder={t(isAbnormal ? "service.checklist.abnormalDetailPlaceholder" : "service.checklist.detailPlaceholder")}
                className={`w-full px-3 py-2 text-sm rounded-lg outline-none transition-colors disabled:opacity-60 resize-y ${
                  isAbnormal
                    ? "bg-[#e05252]/5 border border-[#e05252]/25 focus:border-[#e05252]/60"
                    : "bg-secondary border border-border focus:border-[#c9a84c]/50"
                }`}
              />
              <PhotoAttachments
                photos={value.photos ?? []}
                disabled={disabled}
                disabledReason={photoUploadDisabledReason}
                onUpload={onUploadPhoto}
                onDelete={onDeletePhoto}
                required={isAbnormal}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ช่องกาเครื่องหมายทรงสี่เหลี่ยม เหมือนช่อง checkbox ในแบบฟอร์มกระดาษต้นฉบับ
// A square checkbox-style toggle, matching the paper reference form's checkbox cells.
function CheckboxCell({
  variant, active, disabled, label, onClick,
}: {
  variant: "normal" | "abnormal";
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = variant === "normal" ? Check : AlertTriangle;
  const activeClass = variant === "normal" ? "bg-[#2aa36b] border-[#2aa36b] text-white" : "bg-[#e05252] border-[#e05252] text-white";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md border-2 transition-all disabled:opacity-50 ${
        active ? activeClass : "bg-secondary border-border text-transparent hover:border-[#c9a84c]/50 hover:text-muted-foreground/40"
      }`}
    >
      <Icon size={15} strokeWidth={2.5} />
    </button>
  );
}

// แนบรูปภาพประกอบรายการ (ปกติหรือผิดปกติ) — แสดงภาพย่อพร้อมปุ่มลบ และปุ่มถ่าย/เลือกรูปใหม่
// Photo attachments for a Normal or Abnormal item — thumbnail grid with per-photo delete, plus an
// add button. `required` (Abnormal only) shows the red "at least 1 required" hint; Normal items
// can still attach photos, just optionally.
function PhotoAttachments({
  photos, disabled, disabledReason, onUpload, onDelete, required,
}: {
  photos: ServiceChecklistItemPhoto[];
  disabled: boolean;
  disabledReason?: string;
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (photoId: string) => Promise<void>;
  required?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inactive = disabled || !onUpload;

  const handleFile = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="text-xs font-medium text-[#a75d1a] mb-1.5">
        {t("service.checklist.photosLabel")} {required && photos.length === 0 && <span className="text-[#e05252]">*{t("service.checklist.photoRequired")}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted group">
            {/* object-contain so the thumbnail matches what the printed report and the customer's
                approval page actually show. With cover, a portrait photo previewed as a cropped
                square here while printing as something different — the engineer had no way to see
                what the customer would end up looking at. */}
            <img src={p.url} alt={p.fileName} className="w-full h-full object-contain" />
            {onDelete && !disabled && (
              <button
                type="button"
                title={t("service.checklist.deletePhoto")}
                aria-label={t("service.checklist.deletePhoto")}
                disabled={deletingId === p.id}
                onClick={async () => {
                  setDeletingId(p.id);
                  try { await onDelete(p.id); } finally { setDeletingId(null); }
                }}
                className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-[#0b1d3a]/70 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-60"
              >
                {deletingId === p.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          title={disabledReason ?? t("service.checklist.addPhoto")}
          disabled={inactive || uploading}
          onClick={() => inputRef.current?.click()}
          className="w-16 h-16 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50 disabled:hover:border-border"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : inactive ? <ImageOff size={16} /> : <Camera size={16} />}
          <span className="text-[9px]">{t("service.checklist.addPhoto")}</span>
        </button>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {disabledReason && inactive && <p className="text-[10px] text-muted-foreground mt-1">{disabledReason}</p>}
    </div>
  );
}
