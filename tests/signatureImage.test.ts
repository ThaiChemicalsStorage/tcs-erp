import { describe, it, expect } from "vitest";
import { inkBoundsOf, scaledSignatureSize, SIGNATURE_TARGET_HEIGHT } from "../src/lib/signatureImage";

/**
 * การตัดขอบว่างรอบลายเซ็น (2026-09-07) — เจ้าของบอกว่ารูปที่อัปโหลดบางทีออกมาเล็กเกินและไม่อยาก
 * ไปครอปเอง `inkBoundsOf()` คือส่วนที่ตัดสินว่าอะไรคือหมึกอะไรคือกระดาษ พลาดตรงนี้แล้วลายเซ็นจะถูก
 * ตัดหัวตัดหางบนกระดาษโดยไม่มีใครเห็นจนกว่าจะพิมพ์ออกมา จึงตรึงไว้ทุกกรณีที่ของจริงเจอ
 *
 * ทดสอบด้วย `Uint8ClampedArray` ที่ประกอบเอง ไม่ต้องมี DOM หรือ canvas — ฟังก์ชันนี้ตั้งใจแยกส่วน
 * ที่เป็นตรรกะล้วนออกมาเพื่อการนี้
 */

/** สร้างภาพทึบสีขาว แล้ววาดสี่เหลี่ยมสีที่กำหนดลงไป */
function opaqueImage(width: number, height: number, rect: { x: number; y: number; w: number; h: number; lum?: number } | null, paperLum = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = paperLum;
    data[i + 3] = 255;
  }
  if (rect) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = rect.lum ?? 0;
      }
    }
  }
  return data;
}

/** สร้างภาพพื้นโปร่งใส แล้ววาดสี่เหลี่ยมทึบลงไป (เหมือนลายเซ็นจากแพด) */
function transparentImage(width: number, height: number, rect: { x: number; y: number; w: number; h: number; lum?: number }): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = rect.lum ?? 0;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("inkBoundsOf", () => {
  it("หาขอบหมึกกลางกระดาษขาวได้ตรงตำแหน่ง", () => {
    const data = opaqueImage(100, 60, { x: 30, y: 20, w: 25, h: 12 });
    expect(inkBoundsOf(data, 100, 60)).toEqual({ x: 30, y: 20, width: 25, height: 12 });
  });

  it("รูปถ่ายกระดาษที่ไม่ได้ขาว 255 ก็ยังแยกหมึกออกจากกระดาษได้", () => {
    const data = opaqueImage(100, 60, { x: 10, y: 10, w: 20, h: 10, lum: 40 }, 200);
    expect(inkBoundsOf(data, 100, 60)).toEqual({ x: 10, y: 10, width: 20, height: 10 });
  });

  it("แสงสะท้อนจุดขาวจ้าจุดเดียวต้องไม่ดันเกณฑ์จนกระดาษทั้งแผ่นกลายเป็นหมึก", () => {
    const data = opaqueImage(100, 60, { x: 40, y: 25, w: 10, h: 8, lum: 30 }, 200);
    // จุดสะท้อนแสง 255 หนึ่งจุดที่มุมภาพ — ถ้าใช้ค่าสูงสุดเป็น "กระดาษ" กระดาษ 200 จะกลายเป็นหมึกทั้งแผ่น
    const i = (2 * 100 + 2) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    expect(inkBoundsOf(data, 100, 60)).toEqual({ x: 40, y: 25, width: 10, height: 8 });
  });

  it("ภาพพื้นโปร่งใส: พิกเซลทึบทุกตัวคือหมึก แม้จะเป็นสีอ่อนทั้งภาพ", () => {
    const data = transparentImage(100, 60, { x: 5, y: 6, w: 30, h: 9, lum: 190 });
    expect(inkBoundsOf(data, 100, 60)).toEqual({ x: 5, y: 6, width: 30, height: 9 });
  });

  it("ฝุ่นเม็ดเดียวไม่ลากกรอบออกไปสุดภาพ", () => {
    const data = opaqueImage(100, 60, { x: 40, y: 30, w: 20, h: 10 });
    const speck = (1 * 100 + 1) * 4; // จุดดำเม็ดเดียวมุมบนซ้าย
    data[speck] = data[speck + 1] = data[speck + 2] = 0;
    expect(inkBoundsOf(data, 100, 60)).toEqual({ x: 40, y: 30, width: 20, height: 10 });
  });

  it("ภาพว่างเปล่าคืน null — ไม่มีอะไรให้ครอป", () => {
    expect(inkBoundsOf(opaqueImage(40, 20, null), 40, 20)).toBeNull();
    expect(inkBoundsOf(new Uint8ClampedArray(40 * 20 * 4), 40, 20)).toBeNull();
  });

  it("ข้อมูลไม่ครบหรือขนาดไม่ถูกต้องคืน null ไม่โยน", () => {
    expect(inkBoundsOf(new Uint8ClampedArray(8), 100, 100)).toBeNull();
    expect(inkBoundsOf(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe("scaledSignatureSize", () => {
  it("ขยายให้ได้ความสูงมาตรฐานโดยคงสัดส่วน", () => {
    expect(scaledSignatureSize(200, 100)).toEqual({ width: 400, height: SIGNATURE_TARGET_HEIGHT });
  });

  it("ย่อลงเมื่อภาพที่ครอปได้สูงกว่ามาตรฐาน", () => {
    expect(scaledSignatureSize(800, 400)).toEqual({ width: 400, height: 200 });
  });

  it("ไม่ขยายเกิน 4 เท่า — รูปจิ๋วขยายจนเบลอไม่ช่วยใคร", () => {
    expect(scaledSignatureSize(20, 10)).toEqual({ width: 80, height: 40 });
  });

  it("ขนาดศูนย์คืนศูนย์ ไม่หารด้วยศูนย์", () => {
    expect(scaledSignatureSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
