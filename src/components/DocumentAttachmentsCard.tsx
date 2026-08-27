import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import {
  type DocumentAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_DOCUMENT,
  formatFileSize,
} from "../lib/documentAttachments";
import { useI18n } from "../lib/i18n";

/**
 * การ์ดแนบไฟล์ที่ใช้ร่วมกันได้ทุกเอกสาร — แกะออกมาจากที่ฝังอยู่ใน `DocumentRecipientsPicker.tsx`
 * ของ Scope of Work เมื่อ 2026-08-27 ตอนที่ฝ่ายโครงการขอให้ใบสั่งงานแนบไฟล์ได้
 *
 * ต่างจากต้นฉบับสองอย่าง: ข้อความทั้งหมดผ่าน `t()` (ของเดิมฮาร์ดโค้ดไทยไว้) และไม่ผูกกับ Scope of Work
 * **ยังไม่ได้ย้าย Scope of Work มาใช้ตัวนี้** — โมดูลนั้นใช้งานหนัก เสี่ยงเกินคุณค่าในรอบเดียวกัน ค้างใน TODO.md
 */
export function DocumentAttachmentsCard({
  attachments,
  disabled,
  onUpload,
  onDelete,
}: {
  attachments: DocumentAttachment[];
  /** ปิดการแนบ/ลบ เช่นเมื่อผู้ใช้ไม่มีสิทธิ์แก้เอกสารนี้ (สถานะเอกสารไม่ได้ปิด — ไฟล์แนบเป็นข้อมูลตามหลัง) */
  disabled: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (attachmentId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const full = attachments.length >= MAX_ATTACHMENTS_PER_DOCUMENT;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    // เช็คขนาดฝั่งหน้าจอก่อน เพื่อบอกผู้ใช้ทันทีโดยไม่ต้องอัปโหลดไฟล์ใหญ่ขึ้นไปให้เซิร์ฟเวอร์ปฏิเสธ
    // (เซิร์ฟเวอร์ยังเช็คซ้ำอยู่ดี — อันนั้นคือด่านจริง อันนี้แค่ช่วยให้รู้เร็ว)
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(t("attachments.tooLarge").replace("{mb}", String(Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024))));
      return;
    }
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("attachments.uploadFailed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">{t("attachments.title")}</h2>
        <span className="text-xs text-muted-foreground">
          {attachments.length}/{MAX_ATTACHMENTS_PER_DOCUMENT} · {t("attachments.limit").replace("{mb}", String(Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)))}
        </span>
      </div>

      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || full}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-2"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            {full ? t("attachments.full") : t("attachments.attach")}
          </button>
        </>
      )}

      {error && <p className="text-xs text-[#e05252] mb-2">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("attachments.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs border border-border/60 rounded-lg px-2.5 py-1.5">
              <FileText size={13} className="text-muted-foreground flex-shrink-0" />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate text-foreground hover:text-[#c9a84c] transition-colors"
                title={a.fileName}
              >
                {a.fileName}
              </a>
              <span className="text-muted-foreground font-mono flex-shrink-0">{formatFileSize(a.size)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => void onDelete(a.id)}
                  title={t("attachments.remove")}
                  className="text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
