import { Binary } from "mongodb";
import { getDb } from "../mongodb.js";

/**
 * ที่เก็บไฟล์ — เป็น **interface** เพื่อให้สลับไป object storage (S3 / Cloudflare R2 /
 * DigitalOcean Spaces) ได้ภายหลังโดย**เปลี่ยนแค่ config ไม่ต้องแก้โค้ดในโมดูลไหนเลย**
 * (ข้อ 7.2 ของ `docs/UPLOAD_COMPRESSION_TASK.md`)
 *
 * **วันนี้เก็บใน MongoDB** ตามที่เจ้าของเลือกเมื่อ 2026-09-21 — ระบบนี้ไม่เคยมีไฟล์อยู่บนดิสก์เลย
 * ทุกอย่างเป็น BSON Binary อยู่แล้ว การย้ายลงดิสก์จะต้องเพิ่ม volume ใน `docker-compose.yml`
 * (ไฟล์ที่เจ้าของดูแลเอง) และแก้สคริปต์สำรองข้อมูลซึ่ง dump เฉพาะฐานข้อมูล — เลื่อนไปทำตอนจำเป็นจริง
 *
 * ⚠️ ข้อจำกัดที่ต้องรู้: BSON จำกัด 16MB ต่อ document ดู `maxDocumentBytes` ใน uploadConfig.ts
 */

export interface StorageAdapter {
  /** `key` คือ path เชิงตรรกะ เช่น `uploads/2026/09/<uuid>.webp` — ฝั่ง Mongo ใช้เป็น `_id` */
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** URL สำหรับดาวน์โหลด — Mongo ไม่มี URL ตรง ๆ จึงคืน route ของแอปที่ตรวจสิทธิ์ให้ */
  getUrl(key: string): string;
}

interface StoredBlobFields {
  _id: string;
  data: Binary;
  contentType: string;
  size: number;
  createdAt: string;
}

async function blobs() {
  const db = await getDb();
  return db.collection<StoredBlobFields>("file_blobs");
}

/**
 * เก็บไบต์ไฟล์ใน MongoDB คอลเลกชัน `file_blobs` แยกจากคอลเลกชัน `files` ที่เก็บ metadata
 * โดยตั้งใจ — หน้ารายการไฟล์ query `files` ได้โดยไม่ลากไบต์เป็นสิบเมกมาด้วย ซึ่งเป็นเหตุผลเดียวกับที่
 * ระบบเดิมแยก `*_attachment_files` ออกจากตัวเอกสาร
 */
export const mongoStorage: StorageAdapter = {
  async save(key, data, contentType) {
    const col = await blobs();
    await col.replaceOne(
      { _id: key },
      { data: new Binary(data), contentType, size: data.length, createdAt: new Date().toISOString() },
      { upsert: true },
    );
  },

  async get(key) {
    const col = await blobs();
    const row = await col.findOne({ _id: key });
    if (!row) return null;
    return { data: Buffer.from(row.data.buffer), contentType: row.contentType };
  },

  async delete(key) {
    const col = await blobs();
    await col.deleteOne({ _id: key });
  },

  getUrl(key) {
    return `/api/files/${encodeURIComponent(key)}`;
  },
};

/**
 * ตัวที่ระบบใช้จริง — เลือกจาก `UPLOAD_STORAGE` · วันนี้มีตัวเดียว แต่จุดสลับอยู่ตรงนี้ที่เดียว
 * เพิ่ม adapter ใหม่แล้วมาต่อใน switch นี้ โมดูลอื่นไม่ต้องรู้เรื่องเลย
 */
export function storage(): StorageAdapter {
  const choice = (process.env.UPLOAD_STORAGE ?? "mongo").trim().toLowerCase();
  if (choice !== "mongo") {
    console.warn(`[upload] UPLOAD_STORAGE="${choice}" ยังไม่รองรับ — ใช้ mongo แทน`);
  }
  return mongoStorage;
}

/**
 * แยกโฟลเดอร์ตามปีและเดือน (`uploads/2026/09/<uuid>.<ext>`) ตามข้อ 7.2 — ทำให้สำรองข้อมูลและ
 * ย้ายไป object storage ทีหลังทำเป็นช่วงเวลาได้ · ใช้เวลา **กรุงเทพ** ให้ตรงกับเลขเอกสารทั้งระบบ
 * ซึ่งขึ้นเดือนใหม่ตามเวลาไทย ไม่ใช่ UTC
 */
export function storageKey(uuid: string, ext: string, now: Date = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = bkk.getUTCFullYear();
  const month = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  return `uploads/${year}/${month}/${uuid}.${ext}`;
}
