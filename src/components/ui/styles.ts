/**
 * สูตรคลาสกลางของดีไซน์ใหม่ (REDESIGN 2026-09-30) — ใช้ร่วมกันทุกหน้าแทนการเขียนสีเองในแต่ละไฟล์
 * รายละเอียดกฎอยู่ใน DESIGN.md · อย่าเพิ่มสีใหม่ที่นี่โดยไม่แก้ DESIGN.md ด้วย
 */

export const btn = {
  primary: "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1d3a] text-white text-sm font-semibold hover:bg-[#1a2f55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
  secondary: "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#c3ccda] bg-white text-foreground text-sm font-medium hover:bg-[#f4f6fa] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
  danger: "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#b93636] text-white text-sm font-semibold hover:bg-[#9e2c2c] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
  text: "h-9 px-2.5 -mx-2.5 inline-flex items-center gap-2 rounded-lg text-[#1a5fb4] text-sm font-medium hover:bg-[#e8f0fb] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
  /** ปุ่มเล็กในหัวการ์ด */
  primarySm: "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0b1d3a] text-white text-[13px] font-semibold hover:bg-[#1a2f55] transition-colors disabled:opacity-60 whitespace-nowrap",
  secondarySm: "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c3ccda] bg-white text-foreground text-[13px] font-medium hover:bg-[#f4f6fa] transition-colors disabled:opacity-60 whitespace-nowrap",
  icon: "w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground transition-colors disabled:opacity-40",
} as const;

export const field = {
  /** กล่องช่องกรอก 40px — ใส่ w-full เองตามที่วาง */
  input: "h-10 px-3 rounded-lg border border-[#c3ccda] bg-white text-sm text-foreground placeholder:text-[#8a97ad] outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors disabled:bg-[#f8f9fc] disabled:text-muted-foreground",
  /** ช่องในตาราง 36px */
  cell: "h-9 px-2.5 rounded-lg border border-[#c3ccda] bg-white text-sm text-foreground placeholder:text-[#8a97ad] outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors",
  textarea: "px-3 py-2.5 rounded-lg border border-[#c3ccda] bg-white text-sm text-foreground leading-relaxed placeholder:text-[#8a97ad] outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors disabled:bg-[#f8f9fc] disabled:text-muted-foreground",
  /** กรอบรวม (ไอคอน + ช่องพิมพ์) */
  box: "h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors",
  label: "text-[13px] font-medium text-[#26395a]",
  help: "text-xs text-muted-foreground",
  error: "text-xs text-[#b93636]",
} as const;

export const surface = {
  card: "bg-card border border-border rounded-xl",
  cardHead: "px-6 py-4 border-b border-[#eef1f6] flex items-center gap-3",
  cardTitle: "text-base font-semibold text-foreground",
} as const;

export const table = {
  head: "h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]",
  // relative: ข้อความ sr-only ในหัวคอลัมน์เป็น absolute — ถ้าไม่มีกรอบอ้างอิงจะหลุดกล่องเลื่อนของตาราง ดันทั้งหน้าให้เลื่อนข้างได้บนมือถือ
  th: "relative px-3 first:pl-5 last:pr-5 text-left font-semibold whitespace-nowrap",
  row: "h-[60px] border-b border-[#eef1f6] bg-white hover:bg-[#f8f9fc] transition-colors",
  td: "px-3 first:pl-5 last:pr-5 align-middle",
  code: "font-mono text-[13px] font-medium text-foreground",
  money: "text-right tabular-nums font-semibold",
} as const;
