import { useRef, useState, type ReactNode } from "react";
import { Paperclip, Trash2, Loader2, FileText, Search } from "lucide-react";
import type { User } from "../../lib/users";
import {
  ADDITIONAL_RECIPIENT_KEY, ADDITIONAL_RECIPIENT_LABEL, DOCUMENT_RECIPIENT_DEPARTMENTS, type ChecklistGroup,
} from "../../lib/documentRequirements";
import {
  type ScopeOfWorkAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_SCOPE, formatFileSize,
} from "../../lib/scopeOfWork";
import { ACCEPT_ALL_UPLOADS } from "../../lib/uploadLimits";
import { btn, field, surface } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";

/** ป้าย "เลือกแล้ว N คน" (เขียว) / "ยังไม่ได้เลือก" (ส้ม) / "ไม่บังคับ" (เทา) บนหัวกล่องแผนก */
function CountBadge({ tone, children }: { tone: "done" | "missing" | "neutral"; children: ReactNode }) {
  const style = tone === "done" ? "bg-[#e6f4ec] text-[#1b7f4f]" : tone === "missing" ? "bg-[#fdf3e0] text-[#8a5a00]" : "bg-[#eef1f6] text-[#3d5173]";
  return <span className={`h-[22px] px-2 rounded-full text-xs font-semibold inline-flex items-center whitespace-nowrap ${style}`}>{children}</span>;
}

// เลือกพนักงานที่จะรับแจ้งเตือนเอกสารในระบบตามแผนกที่ติ๊กไว้ พร้อมจัดการไฟล์แนบและข้อความเพิ่มเติม
// Picks which employees receive the in-app document notification per checked department, plus attachments and an extra message
export function DocumentRecipientsPicker({
  documentsToSendGroup,
  users,
  value,
  onChange,
  message,
  onMessageChange,
  disabled,
  attachments,
  uploading,
  onUploadAttachment,
  onDeleteAttachment,
  footer,
}: {
  documentsToSendGroup: ChecklistGroup | undefined;
  users: User[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  message: string;
  onMessageChange: (next: string) => void;
  disabled: boolean;
  attachments: ScopeOfWorkAttachment[];
  uploading: boolean;
  onUploadAttachment: (file: File) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  /** แถบท้ายการ์ด (เช่นปุ่ม "ส่งแจ้งเตือนผู้รับเอกสาร") — ไม่ส่ง = ไม่มีแถบ */
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [additionalSearch, setAdditionalSearch] = useState("");
  if (!documentsToSendGroup) return null;
  const checkedByKey = new Map(documentsToSendGroup.options.map((o) => [o.key, o.checked]));
  const checkedDepartments = DOCUMENT_RECIPIENT_DEPARTMENTS.filter((d) => checkedByKey.get(d.key));

  // "ผู้รับเพิ่มเติม" — เลือกพนักงานคนใดก็ได้จากทั้งบริษัท ไม่ผูกกับแผนกในเช็คลิสต์ (2026-08-07)
  // "Additional recipients" — any employee, independent of the checklist departments
  const additionalSelected = value[ADDITIONAL_RECIPIENT_KEY] ?? [];
  const needle = additionalSearch.trim().toLowerCase();
  const matchesSearch = (u: User) =>
    !needle || u.fullName.toLowerCase().includes(needle) || u.department.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle);
  // คนที่เลือกไว้แล้วแสดงก่อนเสมอ (แม้ไม่ตรงคำค้น) เพื่อไม่ให้ตัวเลือกที่ติ๊กไว้หายไปจากสายตา
  const additionalCandidates = [
    ...users.filter((u) => additionalSelected.includes(u.id)),
    ...users.filter((u) => !additionalSelected.includes(u.id) && matchesSearch(u)),
  ];
  const additionalSelectedCount = additionalSelected.filter((id) => users.some((u) => u.id === id)).length;

  // สลับสถานะเลือก/ไม่เลือกผู้รับคนหนึ่งในแผนกที่ระบุ
  // Toggles a single recipient's selection within a given department
  const toggleRecipient = (deptKey: string, userId: string) => {
    if (disabled) return;
    const current = value[deptKey] ?? [];
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    onChange({ ...value, [deptKey]: next });
  };

  const personRow = (u: User, deptKey: string, isSelected: boolean, showDept: boolean) => (
    <label
      key={u.id}
      title={u.email}
      className={`min-h-7 flex items-center gap-2 text-sm select-none rounded-md px-1.5 -mx-1.5 transition-colors ${disabled ? "" : "cursor-pointer hover:bg-[#f4f6fa]"}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        disabled={disabled}
        onChange={() => toggleRecipient(deptKey, u.id)}
        className="w-4 h-4 m-0 accent-[#1a5fb4] flex-shrink-0"
      />
      <span className={`truncate ${isSelected ? "text-foreground" : "text-[#3d5173]"}`}>{u.fullName}</span>
      {showDept && u.department.trim() && <span className="text-xs text-muted-foreground truncate">{u.department.trim()}</span>}
    </label>
  );

  return (
    <section className={`${surface.card} print:hidden`}>
      <div className="px-6 py-4 border-b border-[#eef1f6] flex flex-col gap-1">
        <h2 className={surface.cardTitle}>{t("recipients.title")}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("recipients.intro").replace("{additional}", ADDITIONAL_RECIPIENT_LABEL)}</p>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        {checkedDepartments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {checkedDepartments.map((dept) => {
              const candidates = users.filter((u) => u.department.trim() === dept.label);
              const selected = value[dept.key] ?? [];
              const selectedCount = selected.filter((id) => candidates.some((c) => c.id === id)).length;
              return (
                <div key={dept.key} className="border border-border rounded-[10px] px-3.5 py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-semibold text-sm text-foreground">{dept.label}</span>
                    {candidates.length > 0 && (
                      <CountBadge tone={selectedCount > 0 ? "done" : "missing"}>
                        {selectedCount > 0 ? t("recipients.selectedCount").replace("{n}", String(selectedCount)) : t("recipients.noneSelected")}
                      </CountBadge>
                    )}
                  </div>
                  {candidates.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">{t("recipients.noStaffInDept").replace("{dept}", dept.label)}</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {candidates.map((u) => personRow(u, dept.key, selected.includes(u.id), false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="border border-border rounded-[10px] px-3.5 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{ADDITIONAL_RECIPIENT_LABEL}</span>
            <CountBadge tone={additionalSelectedCount > 0 ? "done" : "neutral"}>
              {additionalSelectedCount > 0 ? t("recipients.selectedCount").replace("{n}", String(additionalSelectedCount)) : t("recipients.optional")}
            </CountBadge>
            <span className="flex-1" />
            {!disabled && (
              <label className="w-full sm:w-[300px] h-9 px-2.5 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
                <Search size={15} className="text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={additionalSearch}
                  onChange={(e) => setAdditionalSearch(e.target.value)}
                  placeholder={t("recipients.searchPlaceholder")}
                  aria-label={t("recipients.searchAria").replace("{label}", ADDITIONAL_RECIPIENT_LABEL)}
                  className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
                />
              </label>
            )}
          </div>
          <span className={field.help}>{t("recipients.additionalHelp")}</span>
          {additionalCandidates.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("recipients.noMatch")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1">
              {additionalCandidates.map((u) => personRow(u, ADDITIONAL_RECIPIENT_KEY, additionalSelected.includes(u.id), true))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="flex flex-col gap-1.5">
            <div className="min-h-9 flex items-center gap-2 flex-wrap">
              <span className={`${field.label} flex-1`}>
                {t("recipients.attachmentsLabel")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("recipients.attachmentsLimit").replace("{max}", String(MAX_ATTACHMENTS_PER_SCOPE)).replace("{mb}", String(Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)))}
                </span>
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || attachments.length >= MAX_ATTACHMENTS_PER_SCOPE}
                  className={btn.secondarySm}
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
                  {uploading ? t("recipients.uploading") : t("recipients.attach")}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ALL_UPLOADS}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadAttachment(file);
                  e.target.value = "";
                }}
              />
            </div>
            {attachments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("recipients.noAttachments")}</p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-[#eef1f6]">
                {attachments.map((a) => (
                  <div key={a.id} className="h-11 pl-3 pr-2 flex items-center gap-2.5 text-sm">
                    <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[#1a5fb4] hover:underline" title={a.fileName}>
                      {a.fileName}
                    </a>
                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{formatFileSize(a.size)}</span>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onDeleteAttachment(a.id)}
                        disabled={uploading}
                        aria-label={t("recipients.deleteAttachment").replace("{name}", a.fileName)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <span className={field.help}>{t("recipients.attachmentsHelp")}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="recipientMessage" className={`${field.label} min-h-9 flex items-center`}>
              {t("recipients.messageLabel")}&nbsp;<span className="font-normal text-muted-foreground">{t("sowdo.optionalParen")}</span>
            </label>
            <textarea
              id="recipientMessage"
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              disabled={disabled}
              rows={3}
              placeholder={t("recipients.messagePlaceholder")}
              className={`${field.textarea} w-full resize-y`}
            />
            <span className={field.help}>{t("recipients.messageHelp")}</span>
          </div>
        </div>
      </div>

      {footer && (
        <div className="px-6 py-3.5 border-t border-[#eef1f6] flex items-center gap-3 flex-wrap">{footer}</div>
      )}
    </section>
  );
}
