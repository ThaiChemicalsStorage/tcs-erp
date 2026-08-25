/**
 * แปลงจำนวนเงินบาทเป็นคำอ่านภาษาไทย — แยกออกมาจาก `quotes.tsx` เมื่อ 2026-08-25
 *
 * Thai baht-in-words conversion. Split out of `src/lib/quotes.tsx` on 2026-08-25 for one specific
 * reason: `api/_lib/arHandler.ts` needs `bahtText()` to stamp `amountTextTh` on every AR document,
 * and that was the **last remaining runtime import of a `.tsx` file from the server**. A `.tsx` in
 * the server's import graph is what caused the 2026-08-21 production crash-loop (the Docker image
 * shipped without `tsconfig.json`, so the runtime could not transpile JSX at boot — see
 * CHANGELOG.md 2026-08-21c). Keeping this in its own dependency-free `.ts` module means the server
 * pulls in ~60 lines of pure arithmetic instead of the whole quotation module (which also drags in
 * `apiClient.ts`), and can never pull in JSX by accident.
 *
 * No imports on purpose. Do not add any.
 */

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// แปลงตัวเลขกลุ่มหลักหน่วยถึงแสนให้เป็นคำอ่านภาษาไทย (ใช้ภายใน bahtText)
// Converts a single digit-group (up to hundred-thousands) into Thai number words (internal helper for bahtText)
function convertDigitGroup(n: number, hasPrecedingDigits: boolean): string {
  if (n === 0) return "";
  const digits = String(n).split("").map(Number);
  const len = digits.length;
  let out = "";
  digits.forEach((d, i) => {
    const pos = len - i - 1;
    if (d === 0) return;
    if (pos === 0 && d === 1 && (len > 1 || hasPrecedingDigits)) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 1 && d === 1) out += "สิบ";
    else out += THAI_DIGITS[d] + THAI_POSITIONS[pos];
  });
  return out;
}

// แปลงจำนวนเงินบาทเป็นคำอ่านภาษาไทย เช่น 802500 -> "(แปดแสนสองพันห้าร้อยบาทถ้วน)"
// Converts a THB amount into its Thai-language words form, e.g. 802500 -> "(แปดแสนสองพันห้าร้อยบาทถ้วน)"
export function bahtText(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const intPart = Math.floor(rounded);
  const satang = Math.round((rounded - intPart) * 100);

  let intText = "ศูนย์";
  if (intPart > 0) {
    const groups: number[] = [];
    let remaining = intPart;
    while (remaining > 0) {
      groups.unshift(remaining % 1000000);
      remaining = Math.floor(remaining / 1000000);
    }
    let hasPrior = false;
    intText = groups
      .map((g, i) => {
        if (g === 0) return "";
        const text = convertDigitGroup(g, hasPrior) + "ล้าน".repeat(groups.length - 1 - i);
        hasPrior = true;
        return text;
      })
      .join("");
  }

  const satangText = satang === 0 ? "ถ้วน" : `${convertDigitGroup(satang, false)}สตางค์`;
  return `(${intText}บาท${satangText})`;
}
