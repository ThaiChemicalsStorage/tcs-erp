import type { CompanyHeaderInfo } from "../lib/storage";
import { BrandMark } from "./BrandMark";
import { FacebookIcon, LineAppIcon } from "./PrintSocialIcons";

/**
 * หัวจดหมายสำหรับเอกสารพิมพ์ — แยกออกมาเป็นของกลาง 2026-08-27 ตอนที่ฝ่ายผลิตขอให้ใบเบิก-คืนวัสดุ
 * "ทำเทมเพลตออกมาคล้ายๆของใบเสนอราคา"
 *
 * ⚠️ **ยังไม่ได้ถูกนำไปใช้กับใบเสนอราคาและใบส่งมอบสินค้า** ทั้งที่ตอนวางแผนคิดว่าสองใบนั้นก๊อปหัว
 * จดหมายกันมา — พอเปิดดูจริงกลับพบว่าเป็นคนละดีไซน์: ใบเสนอราคาใช้ Tailwind + สีแบรนด์ + แถบตั้ง
 * "QUOTATION" ส่วนใบส่งมอบใช้ inline style + ค่าคงที่ `LETTERHEAD` ที่ฮาร์ดโค้ดไว้ (ชื่ออังกฤษ,
 * ที่อยู่สองบรรทัด, โลโก้ 88px) การยุบสองอันนั้นเป็นอันเดียวจะ**เปลี่ยนหน้าตาเอกสารที่ใช้งานจริงอยู่**
 * ซึ่งไม่มีใครขอ คอมโพเนนต์นี้จึงถอดแบบมาจาก "ใบเสนอราคา" ตัวเดียว แล้วใช้กับใบเบิกก่อน
 *
 * เป็นไทยตายตัวเหมือนใบพิมพ์ทุกใบในแอปนี้ — ห้ามใส่ `useI18n` (ดู docs/CLAUDE.md)
 */
export function PrintLetterhead({
  companyHeader,
  docLabel,
  rightMeta,
}: {
  companyHeader: CompanyHeaderInfo;
  /** ข้อความบนแถบตั้งมุมขวา เช่น "REQUISITION" — เว้นว่างไว้ถ้าไม่ต้องการแถบ */
  docLabel?: string;
  /** คู่ค่าที่พิมพ์ไว้มุมขวาบน เช่น เลขที่เอกสาร/วันที่ */
  rightMeta?: { label: string; value: string }[];
}) {
  return (
    <div className="relative pb-3 mb-2 border-b-2 border-[#0b1d3a]/10">
      {docLabel && (
        <div className="absolute top-0 right-0 w-6 h-20 bg-[#1a5fb4] flex items-center justify-center">
          <span className="text-white text-[9px] font-bold tracking-[0.2em]" style={{ writingMode: "vertical-rl" }}>
            {docLabel}
          </span>
        </div>
      )}

      <div className={`flex items-start gap-3 ${docLabel ? "pr-8" : ""}`}>
        {companyHeader.logoDataUrl ? (
          <img
            src={companyHeader.logoDataUrl}
            alt={companyHeader.name}
            className="w-12 h-12 rounded-full object-contain border border-[#0b1d3a]/15 bg-white p-0.5 flex-shrink-0"
          />
        ) : (
          <BrandMark size={48} variant="mark" theme="dark" className="flex-shrink-0" />
        )}
        <div className="flex-1">
          <p className="font-bold text-[13px]">{companyHeader.name}</p>
          {companyHeader.address.trim() && (
            <p className="text-[10px] text-[#5a7299] leading-snug">{companyHeader.address}</p>
          )}
          {companyHeader.taxId.trim() && (
            <p className="text-[10px] text-[#5a7299]">เลขประจำตัวผู้เสียภาษี : {companyHeader.taxId}</p>
          )}
          {(companyHeader.phone.trim() || companyHeader.email.trim()) && (
            <p className="text-[10px] text-[#5a7299]">
              {companyHeader.phone.trim() && <>โทรศัพท์ : {companyHeader.phone}</>}
              {companyHeader.phone.trim() && companyHeader.email.trim() && "  "}
              {companyHeader.email.trim() && <>E-mail : {companyHeader.email}</>}
            </p>
          )}
          {(companyHeader.facebookName.trim() || companyHeader.lineId.trim() || companyHeader.website.trim()) && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#5a7299] mt-0.5">
              {companyHeader.facebookName.trim() && (
                <span className="flex items-center gap-1"><FacebookIcon size={11} /> {companyHeader.facebookName}</span>
              )}
              {companyHeader.lineId.trim() && (
                <span className="flex items-center gap-1"><LineAppIcon size={11} /> {companyHeader.lineId}</span>
              )}
              {companyHeader.website.trim() && <span>{companyHeader.website}</span>}
            </div>
          )}
        </div>
        {rightMeta && rightMeta.length > 0 && (
          <div className={`text-right ${docLabel ? "pr-8" : ""}`}>
            {rightMeta.map((m) => (
              <p key={m.label} className="text-[10px] text-[#5a7299]">
                {m.label} : <span className="font-mono text-[#0b1d3a]">{m.value || "-"}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
