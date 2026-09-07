/**
 * ตัดขอบว่างรอบลายเซ็นให้อัตโนมัติ (2026-09-07) — เจ้าของแจ้งว่า *"เวลาอัปโหลดรูปลายเซ็นเข้าไป
 * แบบนี้แล้วมันบางทีรูปเล็กเกินบ้าง เค้าไม่ต้องไปปรับเองอะ"*
 *
 * ต้นเหตุไม่ใช่ขนาดกรอบบนใบพิมพ์ แต่เป็น**ขอบว่างในไฟล์**: รูปถ่ายลายเซ็นบนกระดาษมีเนื้อหมึกอยู่กลาง
 * ภาพนิดเดียว ที่เหลือเป็นกระดาษเปล่า · `PrintSignatureLine` ย่อทั้งภาพให้พอดีกรอบ เส้นหมึกจริงจึง
 * เหลือนิดเดียว ส่วนคนที่ครอปมาชิดขอบเองได้ลายเซ็นเต็มกรอบ — ขนาดที่เห็นเลยไม่เท่ากันสักคน
 *
 * ทางแก้: หาขอบเขตของหมึกจริงตอนรับภาพ ตัดขอบว่างทิ้ง แล้วขยายให้ได้ความสูงมาตรฐาน ทุกลายเซ็นจึง
 * ออกมาเต็มกรอบเท่ากันหมดโดยผู้ใช้ไม่ต้องทำอะไรเลย · **ไม่ได้ลบพื้นหลัง** รูปถ่ายกระดาษยังมีพื้นขาว
 * ติดมาเหมือนเดิม (เจ้าของเลือกทางนี้ 2026-09-07 — การทำพื้นโปร่งใสเสี่ยงกินเส้นบาง ๆ ไปด้วย)
 *
 * ใช้กับทั้งรูปที่อัปโหลดและลายเซ็นที่เซ็นบนแพด — แพดเป็นพื้นโปร่งใสอยู่แล้ว การตัดขอบจึงแม่นยำ และ
 * ทำให้ลายเซ็นสองทางเข้าออกมาขนาดเดียวกัน ซึ่งเป็นสิ่งที่คำสั่งนี้ต้องการ
 */

/** ความสูงมาตรฐานของลายเซ็นหลังตัดขอบ (px) — ใหญ่พอสำหรับใบพิมพ์ 300dpi โดยไฟล์ยังเล็ก */
export const SIGNATURE_TARGET_HEIGHT = 200;
/** ขยายได้มากสุดกี่เท่าจากขนาดที่ครอปได้ — กันรูปจิ๋วถูกดันจนเบลอเป็นก้อน */
const MAX_UPSCALE = 4;
/** เว้นขอบรอบหมึกเป็นสัดส่วนของด้านที่ยาวกว่า — ลายเซ็นที่ชิดขอบเป๊ะอ่านแล้วอึดอัด */
const PAD_RATIO = 0.04;

export interface InkBoundsOptions {
  /** ต่ำกว่านี้ถือว่าโปร่งใส = พื้นหลัง (0-255) */
  alphaThreshold?: number;
  /**
   * ความสว่างของ "หมึก" เทียบกับกระดาษ — พิกเซลที่มืดกว่ากระดาษเกินสัดส่วนนี้คือหมึก
   * ใช้ค่าสัมพัทธ์ ไม่ใช่ค่าคงที่ เพราะรูปถ่ายกระดาษจริงไม่เคยขาว 255 (เงา แสงเหลือง ฟิล์มกล้อง)
   */
  inkRatio?: number;
}

export interface InkBounds { x: number; y: number; width: number; height: number }

/**
 * ขอบเขตของหมึกใน `ImageData` — คืน `null` เมื่อทั้งภาพว่าง (ไม่มีอะไรให้ครอป)
 *
 * ฟังก์ชันล้วน ไม่แตะ DOM เพื่อให้เทสต์ได้ตรง ๆ — ตรรกะการหาขอบคือจุดที่พลาดแล้วลายเซ็นจะถูกตัดหัว
 * ตัดหางโดยไม่มีใครเห็นจนกว่าจะพิมพ์ออกมาบนกระดาษ
 *
 * สองโหมดในฟังก์ชันเดียว เพราะภาพสองชนิดที่เข้ามาต่างกันคนละเรื่อง:
 *   - **ภาพที่มีพื้นโปร่งใส** (ลายเซ็นจากแพด, PNG ที่ครอปมาแล้ว) — พิกเซลทึบทุกตัวคือหมึก ไม่ต้อง
 *     เดาความสว่างเลย · เดาแล้วจะพังกับลายเซ็นสีอ่อนทั้งภาพ ซึ่งไม่มีอะไรให้เทียบว่าอันไหนกระดาษ
 *   - **ภาพทึบทั้งใบ** (รูปถ่ายกระดาษ) — เทียบกับความสว่างของกระดาษที่วัดจากเปอร์เซ็นไทล์ที่ 90
 *     ไม่ใช่ค่าสูงสุด เพราะแสงสะท้อนจุดเดียวที่ 255 จะดันเกณฑ์จนกระดาษทั้งแผ่นกลายเป็นหมึก
 *
 * กันจุดรบกวน: แถวที่มีพิกเซลหมึกน้อยกว่า `minRun` ไม่นับเป็นขอบ ไม่งั้นฝุ่นเม็ดเดียวหรือมุมภาพที่มืด
 * จากเลนส์จะลากกรอบออกไปจนสุดภาพ แล้วการครอปก็ไม่ได้ช่วยอะไรเลย
 */
export function inkBoundsOf(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: InkBoundsOptions = {},
): InkBounds | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;
  const alphaThreshold = opts.alphaThreshold ?? 16;
  const inkRatio = opts.inkRatio ?? 0.85;

  const histogram = new Uint32Array(256);
  let opaque = 0;
  let transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) { transparent += 1; continue; }
    opaque += 1;
    histogram[luminanceOf(data, i)] += 1;
  }
  if (opaque === 0) return null;

  // ภาพที่มีพื้นโปร่งใส: ทึบ = หมึก · ภาพทึบทั้งใบ: มืดกว่ากระดาษเกินเกณฑ์ = หมึก
  const threshold = transparent > 0 ? 255 : percentileOf(histogram, opaque, 0.9) * inkRatio;

  const minRun = width >= 50 ? 2 : 1;
  let top = -1, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y += 1) {
    let count = 0, rowLeft = width, rowRight = -1;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + x * 4;
      if (data[i + 3] < alphaThreshold) continue;
      if (luminanceOf(data, i) > threshold) continue;
      count += 1;
      if (x < rowLeft) rowLeft = x;
      if (x > rowRight) rowRight = x;
    }
    if (count < minRun) continue;
    if (top < 0) top = y;
    bottom = y;
    if (rowLeft < left) left = rowLeft;
    if (rowRight > right) right = rowRight;
  }
  if (top < 0 || right < left) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function luminanceOf(data: Uint8ClampedArray, i: number): number {
  return Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
}

/** ความสว่างที่เปอร์เซ็นไทล์ที่กำหนด อ่านจากฮิสโทแกรม 256 ช่อง */
function percentileOf(histogram: Uint32Array, total: number, percentile: number): number {
  const target = Math.max(1, Math.floor(total * percentile));
  let seen = 0;
  for (let value = 0; value < 256; value += 1) {
    seen += histogram[value];
    if (seen >= target) return value;
  }
  return 255;
}

/** ขนาดปลายทางหลังตัดขอบ — แยกออกมาเพราะกฎ "ห้ามขยายเกิน 4 เท่า" ต้องตรึงไว้ด้วยเทสต์ */
export function scaledSignatureSize(width: number, height: number, targetHeight = SIGNATURE_TARGET_HEIGHT): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(targetHeight / height, MAX_UPSCALE);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * ตัดขอบว่างของลายเซ็นแล้วขยายให้ได้ความสูงมาตรฐาน — คืนค่าเดิมเมื่อทำไม่ได้
 *
 * "ทำไม่ได้" ครอบคลุมทั้งภาพว่างเปล่า ภาพที่อ่านไม่ออก และเบราว์เซอร์ที่ไม่มี canvas ทุกกรณีต้อง
 * ไม่โยน เพราะการบันทึกลายเซ็นต้องสำเร็จเสมอ การครอปเป็นของแถมที่พลาดได้โดยไม่พาอย่างอื่นล้ม
 */
export async function trimSignatureDataUrl(dataUrl: string, targetHeight = SIGNATURE_TARGET_HEIGHT): Promise<string> {
  if (!dataUrl) return dataUrl;
  try {
    const image = await loadImage(dataUrl);
    const source = document.createElement("canvas");
    source.width = image.naturalWidth || image.width;
    source.height = image.naturalHeight || image.height;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    if (!sourceCtx || source.width === 0 || source.height === 0) return dataUrl;
    sourceCtx.drawImage(image, 0, 0);

    const { data } = sourceCtx.getImageData(0, 0, source.width, source.height);
    const bounds = inkBoundsOf(data, source.width, source.height);
    if (!bounds) return dataUrl;

    const pad = Math.round(Math.max(bounds.width, bounds.height) * PAD_RATIO);
    const x = Math.max(0, bounds.x - pad);
    const y = Math.max(0, bounds.y - pad);
    const w = Math.min(source.width - x, bounds.width + pad * 2);
    const h = Math.min(source.height - y, bounds.height + pad * 2);

    const size = scaledSignatureSize(w, h, targetHeight);
    const out = document.createElement("canvas");
    out.width = size.width;
    out.height = size.height;
    const ctx = out.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, x, y, w, h, 0, 0, size.width, size.height);
    return out.toDataURL("image/webp", 0.92);
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("ไม่สามารถอ่านรูปลายเซ็นได้"));
    img.src = src;
  });
}
