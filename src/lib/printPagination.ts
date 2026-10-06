/**
 * แบ่งหน้าใบพิมพ์แบบฟอร์มจากความสูงที่วัดได้ (2026-10-06) — ตัวคำนวณของ `PaginatedPrintForm` แยกออกมาให้เทสต์ได้โดยไม่ต้องมีเบราว์เซอร์
 * หน่วยเป็น px ทั้งหมด · `available` = ความสูงที่เหลือให้ตารางในหนึ่งหน้า (หักหัวเอกสาร หัวตาราง ท้ายกระดาษแล้ว)
 */
export interface PrintLayout {
  /** `rows` = index ของบรรทัดในหน้านั้น · `blanks` = จำนวนแถวว่างที่เติมให้เต็มหน้า · `last` = หน้าที่มีช่องเซ็น */
  pages: { rows: number[]; blanks: number; last: boolean }[];
}

/**
 * แบ่งหน้าจากความสูงที่วัดได้ — แยกออกมาให้เทสต์ได้โดยไม่ต้องมีเบราว์เซอร์
 * `firstAvailable` = ที่ว่างของหน้าแรก (น้อยกว่าหน้าอื่นเมื่อมีส่วนที่พิมพ์เฉพาะหน้าแรก เช่นเช็คลิสต์ของ Scope of Work) · ไม่ระบุ = เท่าหน้าอื่น
 */
export function paginate({ available, firstAvailable, rowHeights, blankHeight, footerHeight }: {
  available: number; firstAvailable?: number; rowHeights: number[]; blankHeight: number; footerHeight: number;
}): PrintLayout {
  const pages: PrintLayout["pages"] = [];
  const room = () => (pages.length === 0 ? firstAvailable ?? available : available);
  let cur: number[] = [];
  let used = 0;
  const closePage = () => {
    pages.push({ rows: cur, blanks: Math.max(0, Math.floor((room() - used) / blankHeight)), last: false });
    cur = [];
    used = 0;
  };
  rowHeights.forEach((h, i) => {
    // บรรทัดเดียวสูงเกินหน้าก็ต้องวางสักที่ — วางลงหน้าว่างแล้วปล่อยล้น ดีกว่าวนไม่จบ
    if (cur.length > 0 && used + h > room()) closePage();
    cur.push(i);
    used += h;
  });
  // ช่องเซ็นไม่พอที่ — หน้านี้เติมแถวว่างให้เต็ม แล้วยกช่องเซ็นไปหน้าใหม่ที่มีหัวและตารางว่างเต็มหน้า
  if ((cur.length > 0 || pages.length === 0) && used + footerHeight > room()) closePage();
  pages.push({ rows: cur, blanks: Math.max(0, Math.floor((room() - used - footerHeight) / blankHeight)), last: true });
  return { pages };
}
