// ตรวจสอบว่าค่าที่ให้มาเป็นวันที่แบบ YYYY-MM-DD ที่ถูกต้องจริง หรือเป็นค่าว่าง (ไม่ throw error)
// Checks that a value is either empty or a genuinely valid YYYY-MM-DD calendar date (never throws).
export function isValidIsoDateOrEmpty(v: string): boolean {
  if (v === "") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}
