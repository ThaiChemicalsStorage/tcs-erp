/**
 * `libheif-js` ไม่มี type declarations มาให้ (เป็น WASM build ที่ emscripten สร้าง)
 * ประกาศเฉพาะส่วนที่เราใช้จริง — ตัวถอดรหัส HEIC/HEVC ที่ sharp ทำไม่ได้
 * ดูเหตุผลเต็มใน `compressImage.ts` ฟังก์ชัน `decodeHeic()`
 */
declare module "libheif-js" {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
  }
  export class HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[];
  }
}
