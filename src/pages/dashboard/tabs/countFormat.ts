/** ตัวช่วยจัดรูปแบบของแท็บแผนก — แยกจากไฟล์คอมโพเนนต์เพื่อให้ fast refresh ของ Vite ทำงาน */

export const fmtCount = (n: number) => n.toLocaleString("th-TH");

/** จำนวนวันจาก `from` ถึง `to` (YYYY-MM-DD) — ติดลบ = `to` มาก่อน */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
