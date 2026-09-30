import { useRef, useState } from "react";
import { Check, AlertTriangle, ImagePlus, X, Loader2, ImageOff, Ruler, ToggleLeft, AlertCircle } from "lucide-react";
import type { ServiceChecklistItemDef, ServiceChecklistItemKind } from "../lib/serviceTemplates";
import type { ServiceChecklistItemValue, ServiceChecklistItemPhoto } from "../lib/serviceReports";
import { MAX_CHECKLIST_ITEM_LABEL_LENGTH } from "../lib/validation/serviceReportValidation";
import { InlineEditableLabel } from "./InlineEditableLabel";
import { useI18n } from "../lib/i18n";
import { field } from "./ui/styles";

/**
 * แถวหนึ่งของรายการตรวจเช็ค (ดีไซน์ใหม่ 2026-09-30, บอร์ด ServiceReportEditor) — ตาราง 3 คอลัมน์แบบ grid:
 * "อุปกรณ์ / รายการตรวจเช็ค | ผลตรวจ | ปุ่มท้ายแถว" · ผลตรวจเป็นปุ่มแบ่งส่วน [✓ ปกติ | ⚠ ผิดปกติ]
 * (เดิมเป็นช่องสี่เหลี่ยมสองช่องแบบฟอร์มกระดาษ) หรือช่องกรอกค่าที่วัดได้ (มีหน่วยต่อท้าย)
 *
 * One checklist row — REDESIGN board ServiceReportEditor: a 3-column grid (item | result | row
 * actions). The result is a segmented control [Normal | Abnormal] (was two paper-form checkboxes)
 * or a measurement input with its unit. Pressing the already-pressed segment clears it back to
 * "not selected", exactly as the old checkbox did.
 * Selecting "Abnormal" immediately reveals a required detail field + photo attachments directly
 * below (never silently cleared if the status is later changed back to Normal — the caller only
 * clears it on an explicit user action). "Normal" reveals an optional one-line detail + photos.
 */
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
  // When set, the row gains a trailing remove-item button (per-report checklist customization —
  // each job differs, see docs/MODULES/Service.md); the parent only passes this while the report
  // is an editable Draft.
  onRemove?: () => void;
  // When set, the label becomes editable in place (double-click / tap / Enter). Gated by the same
  // `structureEditable` rule as onRemove. A rename keeps the item's key, so any recorded
  // status/abnormalDetail/photos survive it — see docs/MODULES/Service.md.
  onRename?: (label: string) => void;
  // When set, a small toggle in the row-actions column lets this report switch the item between the
  // Normal/Abnormal segmented control and the measurement-value input — same
  // gated-while-editable-Draft rule as onRemove/onRename. Switching never touches `value` (status/
  // abnormalDetail/measurementValue/photos all already coexist on every item regardless of kind —
  // see `ServiceChecklistItemValue`), so toggling back and forth never loses recorded data.
  onChangeKind?: (kind: ServiceChecklistItemKind) => void;
}) {
  const { t } = useI18n();
  const isAbnormal = value.status === "abnormal";
  const isNormal = value.status === "normal";
  const isMeasurement = itemDef.kind === "measurement";
  const kindLabel = isMeasurement ? t("service.checklist.switchToNormalAbnormal") : t("service.checklist.switchToMeasurement");
  const hasActions = !!onRemove || !!onChangeKind;

  return (
    <div className="border-b border-[#eef1f6]">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_240px_80px] gap-x-3 gap-y-2 items-center py-2.5 pl-6 sm:pl-10 pr-6">
        <span className="min-w-0 text-sm text-foreground">
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
        </span>

        {isMeasurement ? (
          disabled ? (
            <span className="text-sm text-foreground tabular-nums">
              {value.measurementValue || <span className="text-[#8a97ad]">{t("common.dash")}</span>}
              {value.measurementValue && itemDef.unit && <span className="text-muted-foreground"> {itemDef.unit}</span>}
            </span>
          ) : (
            // data-field-box: .doc-form paints this box's border itself (index.css) and would repaint
            // a red border grey — so the error state is an outline, which that rule doesn't touch.
            <span data-field-box="" className={`h-9 px-2.5 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 transition-colors ${error ? "outline outline-1 -outline-offset-1 outline-[#e05252]" : ""}`}>
              <input
                type="text"
                aria-label={itemDef.label}
                value={value.measurementValue}
                onChange={(e) => onChange({ ...value, measurementValue: e.target.value })}
                placeholder={t("service.checklist.measurementPlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground tabular-nums placeholder:text-[#8a97ad] outline-none"
              />
              {itemDef.unit && <span className="text-[13px] text-[#8a97ad] flex-shrink-0">{itemDef.unit}</span>}
            </span>
          )
        ) : (
          <span
            role="group"
            aria-label={t("service.checklist.resultAria").replace("{label}", itemDef.label)}
            className={`h-9 rounded-lg border bg-white flex overflow-hidden ${error ? "border-[#e05252]" : "border-[#c3ccda]"}`}
          >
            <SegmentButton
              variant="normal"
              active={isNormal}
              disabled={disabled}
              label={t("service.checklist.normal")}
              onClick={() => onChange({ ...value, status: isNormal ? "not_selected" : "normal" })}
            />
            <span aria-hidden="true" className="w-px bg-[#c3ccda]" />
            <SegmentButton
              variant="abnormal"
              active={isAbnormal}
              disabled={disabled}
              label={t("service.checklist.abnormal")}
              onClick={() => onChange({ ...value, status: isAbnormal ? "not_selected" : "abnormal" })}
            />
          </span>
        )}

        <span className="hidden sm:flex justify-end gap-1">
          {hasActions && onChangeKind && (
            <button
              type="button"
              title={kindLabel}
              aria-label={kindLabel}
              onClick={() => onChangeKind(isMeasurement ? "normalAbnormal" : "measurement")}
              className="w-8 h-8 rounded-lg text-[#8a97ad] hover:text-foreground hover:bg-[#f4f6fa] flex items-center justify-center transition-colors"
            >
              {isMeasurement ? <ToggleLeft size={16} /> : <Ruler size={16} />}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              title={t("service.checklist.removeItem")}
              aria-label={`${t("service.checklist.removeItem")} ${itemDef.label}`}
              onClick={onRemove}
              className="w-8 h-8 rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </span>
        {/* จอแคบ: ปุ่มท้ายแถวย้ายลงมาใต้ผลตรวจ (คอลัมน์ขวาซ่อนไว้) */}
        {hasActions && (
          <span className="flex sm:hidden justify-end gap-1 -mt-1">
            {onChangeKind && (
              <button type="button" title={kindLabel} aria-label={kindLabel} onClick={() => onChangeKind(isMeasurement ? "normalAbnormal" : "measurement")} className="w-8 h-8 rounded-lg text-[#8a97ad] hover:text-foreground hover:bg-[#f4f6fa] flex items-center justify-center">
                {isMeasurement ? <ToggleLeft size={16} /> : <Ruler size={16} />}
              </button>
            )}
            {onRemove && (
              <button type="button" title={t("service.checklist.removeItem")} aria-label={`${t("service.checklist.removeItem")} ${itemDef.label}`} onClick={onRemove} className="w-8 h-8 rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] flex items-center justify-center">
                <X size={16} />
              </button>
            )}
          </span>
        )}
      </div>

      {error && (
        <p className={`${field.error} flex items-center gap-1 pl-6 sm:pl-10 pr-6 -mt-1 pb-2`}><AlertCircle size={13} className="flex-shrink-0" />{error}</p>
      )}

      {isNormal && !isMeasurement && (
        <div className="pl-6 sm:pl-10 pr-6 pb-3.5">
          <div className="pl-3.5 border-l-2 border-[#d6dce6] flex flex-wrap items-center gap-2">
            {/* textarea แถวเดียว ไม่ใช่ input: ช่องนี้ใช้ field เดียวกับรายละเอียดความผิดปกติ (abnormalDetail) ซึ่งอาจมี
                หลายบรรทัด — input จะตัดขึ้นบรรทัดใหม่ทิ้งทันทีที่ผู้ใช้พิมพ์ */}
            <textarea
              value={value.abnormalDetail}
              onChange={(e) => onChange({ ...value, abnormalDetail: e.target.value })}
              disabled={disabled}
              rows={1}
              aria-label={t("service.checklist.detailAria").replace("{label}", itemDef.label)}
              placeholder={t("service.checklist.detailPlaceholder")}
              className={`${field.textarea} flex-1 min-w-[200px] min-h-10 py-2 resize-y`}
            />
            <PhotoAttachments
              photos={value.photos ?? []}
              disabled={disabled}
              disabledReason={photoUploadDisabledReason}
              onUpload={onUploadPhoto}
              onDelete={onDeletePhoto}
              compact
            />
          </div>
        </div>
      )}

      {/* ผลตรวจเก่าที่เคยติ๊กไว้ก่อนเปลี่ยนรายการเป็นช่องกรอกค่า — ยังแสดงรายละเอียด/รูปเดิมให้เห็น (ข้อมูลไม่หาย) */}
      {(isAbnormal || (isNormal && isMeasurement)) && (
        <div className="pl-6 sm:pl-10 pr-6 pb-4">
          <div className={`pl-3.5 border-l-2 flex flex-col gap-3.5 ${isAbnormal ? "border-[#b93636]" : "border-[#d6dce6]"}`}>
            <label className="flex flex-col gap-1.5">
              <span className={field.label}>
                {isAbnormal ? t("service.checklist.abnormalDetailLabel") : t("service.checklist.detailPlaceholder")}
                {isAbnormal && <span className="text-[#b93636]"> *</span>}
              </span>
              <textarea
                value={value.abnormalDetail}
                onChange={(e) => onChange({ ...value, abnormalDetail: e.target.value })}
                disabled={disabled}
                rows={2}
                placeholder={t(isAbnormal ? "service.checklist.abnormalDetailPlaceholder" : "service.checklist.detailPlaceholder")}
                className={`${field.textarea} w-full resize-y`}
              />
            </label>
            <PhotoAttachments
              photos={value.photos ?? []}
              disabled={disabled}
              disabledReason={photoUploadDisabledReason}
              onUpload={onUploadPhoto}
              onDelete={onDeletePhoto}
              required={isAbnormal}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ปุ่มครึ่งหนึ่งของปุ่มแบ่งส่วน ปกติ/ผิดปกติ — กดตัวที่เลือกอยู่ซ้ำ = ยกเลิกการเลือก
// One half of the Normal/Abnormal segmented control — pressing the pressed one clears it.
function SegmentButton({
  variant, active, disabled, label, onClick,
}: {
  variant: "normal" | "abnormal";
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = variant === "normal" ? Check : AlertTriangle;
  const activeClass = variant === "normal" ? "bg-[#e6f4ec] text-[#1b7f4f] font-semibold" : "bg-[#fcebeb] text-[#b93636] font-semibold";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 basis-0 flex items-center justify-center gap-1.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 disabled:cursor-default ${
        active ? activeClass : "bg-white text-[#3d5173] font-medium enabled:hover:bg-[#f4f6fa]"
      }`}
    >
      <Icon size={14} strokeWidth={2.5} />
      {label}
    </button>
  );
}

// แนบรูปภาพประกอบรายการ (ปกติหรือผิดปกติ) — แสดงภาพย่อพร้อมปุ่มลบ และปุ่มถ่าย/เลือกรูปใหม่
// Photo attachments for a Normal or Abnormal item — thumbnail grid with per-photo delete, plus an
// add button. `required` (Abnormal only) shows the red "at least 1 required" hint; Normal items
// can still attach photos, just optionally. `compact` = the one-line Normal variant (40px thumbs
// + a secondary "เพิ่มรูป" button beside the detail field).
function PhotoAttachments({
  photos, disabled, disabledReason, onUpload, onDelete, required, compact = false,
}: {
  photos: ServiceChecklistItemPhoto[];
  disabled: boolean;
  disabledReason?: string;
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (photoId: string) => Promise<void>;
  required?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inactive = disabled || !onUpload;
  // รายงานที่ปิดแล้ว (อ่านอย่างเดียว) ไม่ต้องมีปุ่มเพิ่มรูปที่กดไม่ได้ · พรีวิวรายงานใหม่ยังโชว์ พร้อมเหตุผล
  const showAddButton = !inactive || !!disabledReason;

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

  const thumbSize = compact ? "w-10 h-10" : "w-16 h-16";
  const thumbs = photos.map((p) => (
    <div key={p.id} className={`relative ${thumbSize} rounded-lg overflow-hidden border border-border bg-white group flex-shrink-0`}>
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
  ));

  const fileInput = (
    // No `capture` attribute on purpose. `capture="environment"` told mobile browsers to open
    // the camera *directly*, which skipped the file picker entirely — an engineer could only
    // shoot a new photo and never attach one already in the phone's gallery (reported
    // 2026-08-26). Plain `accept="image/*"` gives the normal picker, which still offers the
    // camera as one of its options, and matches ImageUploadField.tsx, the app's other image
    // input. Do not add `capture` back to "help" on mobile: it removes a choice rather than
    // adding one.
    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
  );

  if (compact) {
    return (
      <>
        {thumbs}
        {showAddButton && (
          <button
            type="button"
            title={disabledReason ?? t("service.checklist.addPhoto")}
            disabled={inactive || uploading}
            onClick={() => inputRef.current?.click()}
            className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border border-[#c3ccda] bg-white text-[13px] font-medium text-foreground hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:hover:bg-white flex-shrink-0"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : inactive ? <ImageOff size={15} /> : <ImagePlus size={15} />}
            {t("service.checklist.addPhoto")}
          </button>
        )}
        {fileInput}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className={field.label}>
        {t("service.checklist.photosLabel")}
        {required && <span className="text-[#b93636]"> *</span>}
        {required && <span className={`font-normal text-xs ml-1.5 ${photos.length === 0 ? "text-[#b93636]" : "text-muted-foreground"}`}>{t("service.checklist.photoRequired")}</span>}
      </span>
      <div className="flex flex-wrap gap-2">
        {thumbs}
        {showAddButton && (
          <button
            type="button"
            title={disabledReason ?? t("service.checklist.addPhoto")}
            disabled={inactive || uploading}
            onClick={() => inputRef.current?.click()}
            className="w-16 h-16 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-[#a3aec2] bg-white text-[#3d5173] text-xs hover:bg-[#f4f6fa] transition-colors disabled:opacity-50 disabled:hover:bg-white"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : inactive ? <ImageOff size={16} /> : <ImagePlus size={16} />}
            {t("service.checklist.addPhoto")}
          </button>
        )}
        {fileInput}
      </div>
      {disabledReason && inactive && <p className={field.help}>{disabledReason}</p>}
    </div>
  );
}
