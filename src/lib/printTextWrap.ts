/**
 * ตัดข้อความยาวเป็นหลายบรรทัดตามความกว้างจริงเป็นมิลลิเมตร (added 2026-10-06) — ใช้กับใบพิมพ์ที่วางข้อมูล
 * ตำแหน่งสัมบูรณ์ (ฟอร์ม NCR) ซึ่งเบราว์เซอร์ตัดบรรทัดให้เองไม่ได้: แต่ละบรรทัดต้องตกลงในแถวของฟอร์ม
 * และนับเป็นแถวตอนแบ่งหน้า ไม่งั้นข้อความที่ยาวเกินช่องจะถูกตัดหายเงียบ ๆ
 *
 * ตัดตามคำ (Intl.Segmenter แยกคำภาษาไทยได้) — คำเดียวที่ยาวเกินบรรทัดตัดทีละตัวอักษร (grapheme)
 * เพื่อไม่ให้สระ/วรรณยุกต์หลุดจากพยัญชนะ · วัดความกว้างด้วย canvas ตามฟอนต์จริง
 * ถ้าไม่มี canvas (เทสต์ใน Node) ใช้ค่าประมาณจากจำนวนตัวอักษรแทน
 */

const PX_PER_MM = 96 / 25.4;

export type TextMeasurer = (text: string) => number;

type Segmenter = { segment(input: string): Iterable<{ segment: string }> };
type SegmenterCtor = new (locale: string, options: { granularity: "word" | "grapheme" }) => Segmenter;

function segmenter(granularity: "word" | "grapheme"): Segmenter | null {
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  return Ctor ? new Ctor("th", { granularity }) : null;
}

function splitWords(text: string): string[] {
  const seg = segmenter("word");
  if (seg) return Array.from(seg.segment(text), (s) => s.segment);
  return text.split(/(\s+)/).filter(Boolean);
}

function splitGraphemes(text: string): string[] {
  const seg = segmenter("grapheme");
  if (seg) return Array.from(seg.segment(text), (s) => s.segment);
  return Array.from(text);
}

// สระบน/ล่าง วรรณยุกต์ และเครื่องหมายผสมอื่น ๆ ไม่กินความกว้าง
const COMBINING = /[̀-ͯัิ-ฺ็-๎]/g;

/** ประมาณความกว้างเมื่อไม่มี canvas — ตัวอักษรเฉลี่ยกว้างราว 0.55 เท่าของขนาดฟอนต์ */
export function approximateMeasurer(fontPx: number): TextMeasurer {
  return (text) => text.replace(COMBINING, "").length * fontPx * 0.55;
}

let canvasCtx: CanvasRenderingContext2D | null | undefined;

/** ตัววัดความกว้างจริงด้วย canvas ตาม CSS font (เช่น `"14px 'Noto Sans Thai'"`) */
export function canvasMeasurer(cssFont: string, fallbackFontPx: number): TextMeasurer {
  if (canvasCtx === undefined) {
    canvasCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  const ctx = canvasCtx;
  if (!ctx) return approximateMeasurer(fallbackFontPx);
  return (text) => {
    ctx.font = cssFont;
    return ctx.measureText(text).width;
  };
}

/** ตัดข้อความเป็นบรรทัดที่กว้างไม่เกิน `widthMm` — ขึ้นบรรทัดใหม่ตาม "\n" ในข้อความด้วย */
export function wrapTextToWidth(text: string, widthMm: number, measure: TextMeasurer): string[] {
  const maxPx = widthMm * PX_PER_MM;
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    let wrapped = false;
    const push = () => { out.push(line.trimEnd()); line = ""; wrapped = true; };
    for (const word of splitWords(paragraph)) {
      // ช่องว่างหลังจุดตัดบรรทัดไม่ต้องยกไปขึ้นต้นบรรทัดใหม่ (แต่ย่อหน้าต้นข้อความเดิมเก็บไว้)
      if (wrapped && !line && !word.trim()) continue;
      if (measure(line + word) <= maxPx) { line += word; continue; }
      if (line.trim()) push();
      const trimmed = word.replace(/^\s+/, "");
      if (measure(trimmed) <= maxPx) { line = trimmed; continue; }
      // คำเดียวยาวเกินบรรทัด (เช่นเลขยาว ๆ หรือคำไทยติดกันที่แยกไม่ได้) — ตัดทีละตัวอักษร
      for (const g of splitGraphemes(trimmed)) {
        if (line && measure(line + g) > maxPx) push();
        line += g;
      }
    }
    push();
  }
  return out;
}
