import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import sharp from "sharp";

/**
 * ระบบอัปโหลดกลาง (2026-09-21) — เทสต์ตามรายการในข้อ 8 ของ `docs/UPLOAD_COMPRESSION_TASK.md`
 *
 * เรียก `storeUpload()` ตรง ๆ แทนที่จะยิง HTTP เพราะสิ่งที่ต้องพิสูจน์คือ**ตัวท่อบีบอัดและด่าน
 * ตรวจไฟล์** ไม่ใช่ routing ของโมดูลไหน · ตัว route ต่อโมดูลมีเทสต์ของตัวเองอยู่แล้ว
 *
 * สองข้อที่เทสต์ไม่ได้ครบและต้องรู้ไว้:
 *   - **HEIC จริงจาก iPhone** — เข้ารหัสด้วย HEVC ซึ่งสร้างในเทสต์ไม่ได้ (ไม่มีตัวเข้ารหัส HEVC
 *     ทั้งใน sharp และในเครื่อง) เทสต์จึงครอบได้แค่ทางที่ปฏิเสธ ต้องเอารูปจาก iPhone จริงมาลอง
 *   - **PDF ที่บีบได้จริง** — ต้องมี Ghostscript ติดตั้ง เครื่อง dev ของ Windows ไม่มี เทสต์จึง
 *     ยืนยันแค่ว่า "ไม่มี gs แล้วต้องไม่พัง" ซึ่งเป็นข้อกำหนดข้อ 4.2.3 พอดี
 */

let mongod: MongoMemoryServer;
let ctx: { user: { id: string; fullName: string } };
type StoreUpload = typeof import("../../api/_lib/upload/uploadService.js")["storeUpload"];
type DeleteUpload = typeof import("../../api/_lib/upload/uploadService.js")["deleteUpload"];
type FilesCollection = typeof import("../../api/_lib/upload/uploadService.js")["filesCollection"];
let storeUpload: StoreUpload;
let deleteUpload: DeleteUpload;
let filesCollection: FilesCollection;
let storage: typeof import("../../api/_lib/upload/storage.js")["storage"];

const POLICY = { module: "purchase-requests", docId: "PR-TEST-0001" };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  const svc = await import("../../api/_lib/upload/uploadService.js");
  storeUpload = svc.storeUpload;
  deleteUpload = svc.deleteUpload;
  filesCollection = svc.filesCollection;
  storage = (await import("../../api/_lib/upload/storage.js")).storage;
  ctx = { user: { id: "u1", fullName: "ผู้ทดสอบ หนึ่ง" } };
});

afterAll(async () => {
  const { closeClient } = await import("../../api/_lib/mongodb.js").catch(() => ({ closeClient: undefined }) as never);
  if (typeof closeClient === "function") await closeClient();
  await mongod?.stop();
});

/** ใช้ `as never` เพราะ AuthContext มีฟิลด์อื่นที่ท่ออัปโหลดไม่ได้อ่านเลย (ใช้แค่ id กับ fullName) */
const up = (data: Buffer, fileName: string, policy: Partial<typeof POLICY> & Record<string, unknown> = {}) =>
  storeUpload(ctx as never, { data, fileName }, { ...POLICY, ...policy } as never);

async function jpeg(width: number, height: number, opts: sharp.JpegOptions = {}): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 140, b: 210 } } })
    .jpeg({ quality: 95, ...opts }).toBuffer();
}

describe("รูปภาพ", () => {
  it("รูปใหญ่จากมือถือ: ย่อเหลือ 2000px แปลงเป็น WebP และมีรูปย่อ", async () => {
    const big = await jpeg(4000, 3000);
    const file = await up(big, "photo.jpg");

    expect(file.status).toBe("compressed");
    expect(file.mime).toBe("image/webp");
    expect(file.size, "ต้องเล็กลงจริง").toBeLessThan(file.sizeBefore);
    expect(file.thumbnailUrl, "ต้องมีรูปย่อ").not.toBe("");

    const files = await filesCollection();
    const row = await files.findOne({ _id: file.id });
    expect(row?.width).toBe(2000);
    expect(row?.height).toBe(1500);
    // ขนาดก่อน/หลังต้องถูกบันทึกทั้งคู่ (ข้อ 7.1) — เป็นข้อมูลเดียวที่ตอบได้ว่าประหยัดไปเท่าไหร่
    expect(row?.sizeBefore).toBe(big.length);
    expect(row?.sizeAfter).toBeLessThan(big.length);
  });

  it("EXIF orientation 6: ต้องหมุนให้ถูกทิศก่อนลบ metadata", async () => {
    const landscape = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 20, g: 200, b: 90 } } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const file = await up(landscape, "rotated.jpg");

    const files = await filesCollection();
    const row = await files.findOne({ _id: file.id });
    // orientation 6 = หมุนตามเข็ม 90° → รูป 800x400 ต้องกลายเป็น 400x800
    expect(row?.width, "ถ้าไม่หมุน จะได้ 800 — แปลว่าลบ EXIF ก่อนหมุน").toBe(400);
    expect(row?.height).toBe(800);
  });

  it("ลบ metadata ทิ้งหมด รวมถึงข้อมูลกล้องและลิขสิทธิ์", async () => {
    const withExif = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg().withMetadata({ exif: { IFD0: { Copyright: "ความลับ", Artist: "ส่วนตัว" } } }).toBuffer();
    const file = await up(withExif, "meta.jpg");
    const blob = await storage().get((await (await filesCollection()).findOne({ _id: file.id }))!.storageKey);
    const meta = await sharp(blob!.data).metadata();
    expect(meta.exif, "EXIF ต้องไม่ติดไปกับไฟล์ที่เก็บ").toBeUndefined();
  });

  it("PNG พื้นหลังโปร่งใส: ต้องคงความโปร่งใส", async () => {
    const png = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.35 } } })
      .png().toBuffer();
    const file = await up(png, "transparent.png");
    const blob = await storage().get((await (await filesCollection()).findOne({ _id: file.id }))!.storageKey);
    const meta = await sharp(blob!.data).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it("รูปเล็กกว่า 2000px: ต้องไม่ถูกขยาย", async () => {
    const small = await jpeg(640, 480);
    const file = await up(small, "small.jpg");
    const row = await (await filesCollection()).findOne({ _id: file.id });
    expect(row?.width).toBe(640);
    expect(row?.height).toBe(480);
  });

  it("รูปที่บีบแล้วใหญ่กว่าเดิม: เก็บไฟล์เดิม ไม่ใช่ไฟล์ที่ใหญ่ขึ้น", async () => {
    // JPEG คุณภาพต่ำมากขนาดจิ๋ว — WebP q80 มักใหญ่กว่า
    const tiny = await jpeg(16, 16, { quality: 20 });
    const file = await up(tiny, "tiny.jpg");
    expect(file.size, "ไฟล์ที่เก็บต้องไม่ใหญ่กว่าไฟล์ที่ผู้ใช้ส่งมา").toBeLessThanOrEqual(file.sizeBefore);
    if (file.status === "skipped") expect(file.mime).toBe("image/jpeg");
  });
});

describe("ด่านตรวจไฟล์", () => {
  it(".exe ที่เปลี่ยนนามสกุลเป็น .jpg ต้องถูกปฏิเสธ", async () => {
    // MZ header ของ Windows PE — ตรวจจาก magic bytes จึงจับได้ แม้ชื่อไฟล์จะเป็น .jpg
    const exe = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00", "latin1"), Buffer.alloc(2048, 0x41)]);
    await expect(up(exe, "innocent.jpg")).rejects.toThrow(/ไม่รองรับไฟล์ชนิดนี้/);
  });

  it("ไฟล์ zip ต้องถูกปฏิเสธ แม้จะเป็นตระกูลเดียวกับ docx", async () => {
    // PK.. แต่ไม่มีโครงสร้าง OOXML ข้างใน → file-type ตอบ "zip" ซึ่งไม่อยู่ใน whitelist
    const zip = Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), Buffer.alloc(512, 0)]);
    await expect(up(zip, "archive.zip")).rejects.toThrow(/ไม่รองรับไฟล์ชนิดนี้/);
  });

  it("ไฟล์ใหญ่เกินกำหนดต้องถูกปฏิเสธพร้อมข้อความภาษาไทยที่บอกเพดาน", async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024, 0x20); // ข้อความล้วน → เพดานเอกสาร 10MB
    await expect(up(huge, "huge.txt")).rejects.toThrow(/ไฟล์ใหญ่เกิน 10MB/);
  });

  it("ไฟล์ว่างเปล่าถูกปฏิเสธ", async () => {
    await expect(up(Buffer.alloc(0), "empty.txt")).rejects.toThrow(/ไฟล์ว่างเปล่า/);
  });

  it("whitelist ของโมดูลแคบกว่าค่ากลางได้ — โมดูลรูปอย่างเดียวต้องไม่รับ PDF", async () => {
    const pdf = minimalPdf();
    await expect(up(pdf, "doc.pdf", { allowedKinds: ["jpg", "png", "webp"] })).rejects.toThrow(/ไม่รองรับไฟล์ชนิดนี้/);
  });

  it("whitelist ของโมดูลกว้างกว่าค่ากลางไม่ได้ — ชนิดนอกค่ากลางถูกตัดทิ้ง", async () => {
    // "zip" ไม่เคยอยู่ในค่ากลาง โมดูลขอเพิ่มเองไม่ได้
    const zip = Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), Buffer.alloc(512, 0)]);
    await expect(up(zip, "a.zip", { allowedKinds: ["zip", "jpg"] })).rejects.toThrow(/ไม่รองรับไฟล์ชนิดนี้/);
  });
});

/** PDF ว่างเปล่าที่ถูกต้องตามรูปแบบ — พอให้ `file-type` ตอบว่าเป็น pdf */
function minimalPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n", "latin1");
}

describe("PDF และไฟล์ที่ไม่บีบ", () => {
  it("PDF ที่บีบไม่ได้ (ไม่มี Ghostscript หรือเล็กลงไม่ถึง 10%) ต้องอัปโหลดสำเร็จโดยเก็บไฟล์เดิม", async () => {
    const pdf = minimalPdf();
    const file = await up(pdf, "เอกสารไทย.pdf");

    expect(file.status, "ห้ามเป็น compressed ถ้าบีบไม่ลง").not.toBe("compressed");
    expect(file.size, "เนื้อไฟล์ต้องเป็นของเดิมครบถ้วน").toBe(pdf.length);
    expect(file.mime).toBe("application/pdf");

    const row = await (await filesCollection()).findOne({ _id: file.id });
    expect(row?.statusReason, "ต้องบันทึกเหตุผลไว้ให้ตามสืบได้").not.toBe("");
  });

  it("PDF เสียหายต้องอัปโหลดสำเร็จ ไม่ใช่ทำให้ผู้ใช้อัปโหลดไม่ได้", async () => {
    const broken = Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), Buffer.alloc(4096, 0xff)]);
    const file = await up(broken, "corrupt.pdf");
    expect(file.id).toBeTruthy();
    expect(file.size).toBe(broken.length);
  });

  it("ไฟล์ข้อความเก็บตามเดิม และชื่อไฟล์ภาษาไทยถูกเก็บครบ", async () => {
    const txt = Buffer.from("บรรทัดหนึ่ง\nบรรทัดสอง\n", "utf8");
    const file = await up(txt, "รายงานประจำเดือน กันยายน.txt");
    expect(file.size).toBe(txt.length);
    expect(file.originalName, "ชื่อไทยต้องไม่เพี้ยน").toBe("รายงานประจำเดือน กันยายน.txt");
  });

  it("CSV แยกจาก TXT ด้วยนามสกุล เพราะเนื้อไฟล์เหมือนกันทุกประการ", async () => {
    const csv = Buffer.from("รหัส,ชื่อ\nP-001,ปั๊ม\n", "utf8");
    const file = await up(csv, "products.csv");
    expect(file.mime).toBe("text/csv");
  });
});

describe("การเก็บและการลบ", () => {
  it("ชื่อไฟล์ผู้ใช้ไม่เคยถูกใช้เป็น path — เก็บเป็น UUID แยกตามปี/เดือน", async () => {
    const file = await up(await jpeg(100, 100), "../../etc/passwd.jpg");
    const row = await (await filesCollection()).findOne({ _id: file.id });
    expect(row?.storageKey, "ต้องไม่มีเศษของชื่อไฟล์ผู้ใช้อยู่ใน path").toMatch(
      /^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.\w+$/,
    );
    expect(row?.storageKey).not.toContain("passwd");
    expect(row?.originalName, "ชื่อเดิมยังเก็บไว้แสดงผล").toBe("../../etc/passwd.jpg");
  });

  it("ลบไฟล์แล้วไบต์จริงและรูปย่อต้องหายจาก storage ด้วย ไม่ใช่แค่แถว", async () => {
    const file = await up(await jpeg(900, 700), "delete-me.jpg");
    const row = await (await filesCollection()).findOne({ _id: file.id });
    expect(row?.thumbnailKey).not.toBe("");
    expect(await storage().get(row!.storageKey)).not.toBeNull();

    await deleteUpload(file.id);

    expect(await storage().get(row!.storageKey), "ไฟล์จริงต้องถูกลบ").toBeNull();
    expect(await storage().get(row!.thumbnailKey), "รูปย่อต้องถูกลบด้วย").toBeNull();
    expect(await (await filesCollection()).findOne({ _id: file.id })).toBeNull();
  });

  it("บันทึกผู้อัปโหลดและโมดูลเจ้าของไฟล์ครบตามข้อ 7.1", async () => {
    const file = await up(await jpeg(200, 200), "owned.jpg", { module: "job-orders", docId: "JO-1" });
    const row = await (await filesCollection()).findOne({ _id: file.id });
    expect(row?.uploadedBy).toBe("u1");
    expect(row?.uploadedByName).toBe("ผู้ทดสอบ หนึ่ง");
    expect(row?.module).toBe("job-orders");
    expect(row?.docId).toBe("JO-1");
    expect(row?.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
