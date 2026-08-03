import { useRef } from "react";
import { Check, Paperclip, Trash2, Loader2, FileText } from "lucide-react";
import type { User } from "../../lib/users";
import { DOCUMENT_RECIPIENT_DEPARTMENTS, type ChecklistGroup } from "../../lib/documentRequirements";
import {
  type ScopeOfWorkAttachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_SCOPE, formatFileSize,
} from "../../lib/scopeOfWork";

// เลือกพนักงานที่จะรับอีเมลเอกสารตามแผนกที่ติ๊กไว้ พร้อมจัดการไฟล์แนบและข้อความเพิ่มเติม
// Picks which employees receive the document email per checked department, plus attachments and an extra message
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
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  if (!documentsToSendGroup) return null;
  const checkedByKey = new Map(documentsToSendGroup.options.map((o) => [o.key, o.checked]));
  const checkedDepartments = DOCUMENT_RECIPIENT_DEPARTMENTS.filter((d) => checkedByKey.get(d.key));
  if (checkedDepartments.length === 0) return null;

  // สลับสถานะเลือก/ไม่เลือกผู้รับคนหนึ่งในแผนกที่ระบุ
  // Toggles a single recipient's selection within a given department
  const toggleRecipient = (deptKey: string, userId: string) => {
    if (disabled) return;
    const current = value[deptKey] ?? [];
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    onChange({ ...value, [deptKey]: next });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 print:hidden">
      <h2 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        ผู้รับเอกสาร
      </h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        ติ๊กเลือกพนักงานในแต่ละแผนกที่เลือกไว้ใน "เอกสารส่งถึง" ด้านบน — เมื่อกดปุ่ม "ส่งอีเมลแจ้งผู้รับเอกสาร" ระบบจะส่งอีเมลไปยังพนักงานที่ติ๊กเลือกไว้เท่านั้น
      </p>
      <div className="space-y-4">
        {checkedDepartments.map((dept) => {
          const candidates = users.filter((u) => u.department.trim() === dept.label);
          const selected = value[dept.key] ?? [];
          const selectedCount = selected.filter((id) => candidates.some((c) => c.id === id)).length;
          return (
            <div key={dept.key} className="border border-border/70 rounded-lg p-3 bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-foreground">{dept.label}</p>
                {candidates.length > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${selectedCount > 0 ? "bg-[#2aa36b]/15 text-[#2aa36b]" : "bg-[#e08a3c]/15 text-[#e08a3c]"}`}>
                    {selectedCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5"><Check size={10} /> เลือกแล้ว {selectedCount} คน</span>
                    ) : (
                      "ยังไม่ได้เลือกผู้รับ"
                    )}
                  </span>
                )}
              </div>
              {candidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  ยังไม่มีพนักงานที่ตั้งค่าแผนกเป็น "{dept.label}" — ตั้งค่าได้ที่หน้าจัดการผู้ใช้งาน
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {candidates.map((u) => {
                    const isSelected = selected.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        title={u.email}
                        className={`flex items-center gap-2 text-xs text-foreground select-none rounded-md px-1.5 py-1 -mx-1.5 transition-colors ${disabled ? "" : "cursor-pointer hover:bg-secondary/60"}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={() => toggleRecipient(dept.key, u.id)}
                          className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c] disabled:opacity-60 flex-shrink-0"
                        />
                        <span className={isSelected ? "font-medium text-foreground" : "text-muted-foreground"}>{u.fullName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border/70">
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-xs font-semibold text-foreground">
            ไฟล์แนบ <span className="font-normal text-muted-foreground">(ไม่บังคับ — สูงสุด {MAX_ATTACHMENTS_PER_SCOPE} ไฟล์ ไฟล์ละไม่เกิน {Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB)</span>
          </label>
          {!disabled && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= MAX_ATTACHMENTS_PER_SCOPE}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50 flex-shrink-0"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
              {uploading ? "กำลังอัปโหลด..." : "แนบไฟล์"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadAttachment(file);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          ไฟล์ที่แนบจะถูกส่งเป็นลิงก์ในอีเมลถึงผู้รับเอกสารด้วย — ระบบจำกัดขนาดและจำนวนไฟล์ไว้เพื่อประหยัดพื้นที่จัดเก็บ
        </p>
        {attachments.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">ยังไม่มีไฟล์แนบ</p>
        ) : (
          <div className="border border-border/70 rounded-lg divide-y divide-border/60">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                <FileText size={14} className="text-[#c9a84c] flex-shrink-0" />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-0 truncate font-medium text-foreground hover:text-[#c9a84c] transition-colors"
                  title={a.fileName}
                >
                  {a.fileName}
                </a>
                <span className="text-muted-foreground font-mono flex-shrink-0">{formatFileSize(a.size)}</span>
                {!disabled && (
                  <button
                    onClick={() => onDeleteAttachment(a.id)}
                    disabled={uploading}
                    aria-label={`ลบไฟล์แนบ ${a.fileName}`}
                    className="text-muted-foreground hover:text-[#e05252] transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border/70">
        <label htmlFor="recipientMessage" className="block text-xs font-semibold text-foreground mb-1">
          ข้อความเพิ่มเติมถึงผู้รับ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
        </label>
        <p className="text-[11px] text-muted-foreground mb-2">
          ข้อความนี้จะแสดงด้านบนเนื้อหาอัตโนมัติในอีเมล เช่น ระบุกำหนดเวลา หรือคำแนะนำเพิ่มเติมสำหรับผู้รับ
        </p>
        <textarea
          id="recipientMessage"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="เช่น กรุณาตรวจสอบและตอบกลับภายในวันศุกร์นี้"
          className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#c9a84c]/50 disabled:opacity-60 resize-y"
        />
      </div>
    </div>
  );
}
