import { useRef, useState } from "react";
import { AlertTriangle, Check, Circle, Camera, X, Loader2, ImageOff } from "lucide-react";
import type { ServiceChecklistItemDef } from "../lib/serviceTemplates";
import type { ServiceChecklistItemValue, ServiceChecklistItemStatus, ServiceChecklistItemPhoto } from "../lib/serviceReports";
import { useI18n } from "../lib/i18n";

// ควบคุมรายการตรวจเช็คหนึ่งรายการ — สามตัวเลือก (ยังไม่ระบุ/ปกติ/ผิดปกติ) หรือช่องกรอกค่าที่วัดได้
// Renders one checklist item's control — a 3-way Normal/Abnormal toggle, or a measurement input.
// Selecting "Abnormal" immediately reveals a required detail field + photo attachment (never
// silently cleared if the status is later changed back to Normal — the caller only clears it on an
// explicit user action).
export function ServiceChecklistItemControl({
  itemDef,
  value,
  onChange,
  disabled,
  error,
  onUploadPhoto,
  onDeletePhoto,
  photoUploadDisabledReason,
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
}) {
  const { t } = useI18n();

  if (itemDef.kind === "measurement") {
    return (
      <div className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <label className="text-sm text-foreground flex-1 min-w-0">{itemDef.label}</label>
        <div className="flex items-center gap-2 flex-shrink-0 sm:w-64">
          <input
            type="text"
            value={value.measurementValue}
            onChange={(e) => onChange({ ...value, measurementValue: e.target.value })}
            disabled={disabled}
            placeholder={itemDef.unit ? `${t("service.checklist.measurementPlaceholder")} (${itemDef.unit})` : t("service.checklist.measurementPlaceholder")}
            className={`h-9 w-full px-3 text-sm bg-secondary border rounded-lg outline-none transition-colors disabled:opacity-60 ${
              error ? "border-[#e05252]/60" : "border-border focus:border-[#c9a84c]/50"
            }`}
          />
        </div>
        {error && <p className="text-[11px] text-[#e05252] sm:hidden">{error}</p>}
      </div>
    );
  }

  const options: { key: ServiceChecklistItemStatus; label: string; icon: typeof Circle; activeClass: string }[] = [
    { key: "normal", label: t("service.checklist.normal"), icon: Check, activeClass: "bg-[#2aa36b] text-white border-[#2aa36b]" },
    { key: "abnormal", label: t("service.checklist.abnormal"), icon: AlertTriangle, activeClass: "bg-[#e05252] text-white border-[#e05252]" },
  ];

  return (
    <div className="py-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <label className="text-sm text-foreground flex-1 min-w-0">{itemDef.label}</label>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {options.map((opt) => {
            const active = value.status === opt.key;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, status: active ? "not_selected" : opt.key })}
                aria-pressed={active}
                className={`min-h-9 flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border transition-all disabled:opacity-60 ${
                  active ? opt.activeClass : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <Icon size={13} /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-[11px] text-[#e05252] mt-1">{error}</p>}
      {value.status === "abnormal" && (
        <div className="mt-2 pl-0 sm:pl-3 border-l-2 border-[#e05252]/40 space-y-2">
          <textarea
            value={value.abnormalDetail}
            onChange={(e) => onChange({ ...value, abnormalDetail: e.target.value })}
            disabled={disabled}
            rows={2}
            placeholder={t("service.checklist.abnormalDetailPlaceholder")}
            className="w-full px-3 py-2 text-sm bg-[#e05252]/5 border border-[#e05252]/25 rounded-lg outline-none focus:border-[#e05252]/60 transition-colors disabled:opacity-60 resize-y"
          />
          <PhotoAttachments
            photos={value.photos ?? []}
            disabled={disabled}
            disabledReason={photoUploadDisabledReason}
            onUpload={onUploadPhoto}
            onDelete={onDeletePhoto}
          />
        </div>
      )}
    </div>
  );
}

// แนบรูปภาพประกอบรายการที่ผิดปกติ — แสดงภาพย่อพร้อมปุ่มลบ และปุ่มถ่าย/เลือกรูปใหม่
// Photo attachments for an Abnormal item — thumbnail grid with per-photo delete, plus an add button.
function PhotoAttachments({
  photos, disabled, disabledReason, onUpload, onDelete,
}: {
  photos: ServiceChecklistItemPhoto[];
  disabled: boolean;
  disabledReason?: string;
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (photoId: string) => Promise<void>;
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
      <p className="text-[11px] font-medium text-[#a75d1a] mb-1.5">
        {t("service.checklist.photosLabel")} {photos.length === 0 && <span className="text-[#e05252]">*{t("service.checklist.photoRequired")}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted group">
            <img src={p.url} alt={p.fileName} className="w-full h-full object-cover" />
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
