#!/usr/bin/env node
/**
 * บีบอัดไฟล์ที่อัปโหลดไว้แล้ว ให้ได้ผลเหมือนไฟล์ใหม่ (ข้อ 9 ของ `docs/UPLOAD_COMPRESSION_TASK.md`)
 *
 *   node scripts/compress-existing-uploads.mjs              # dry-run — ไม่แก้อะไรเลย (ค่าเริ่มต้น)
 *   node scripts/compress-existing-uploads.mjs --apply      # ทำจริง
 *   node scripts/compress-existing-uploads.mjs --limit 50   # จำกัดจำนวนไฟล์ต่อรอบ
 *
 * ⚠️ **ห้ามรันโหมด --apply กับข้อมูลจริงโดยไม่ได้รับคำสั่งจากเจ้าของ** และควรสำรองฐานข้อมูลก่อน
 * (`scripts/backup-to-gdrive.sh`) — สคริปต์นี้เขียนทับ path และข้อมูลไฟล์ในฐานข้อมูล
 *
 * คุณสมบัติที่ข้อ 9 กำหนดและสคริปต์นี้ทำครบ:
 *   - dry-run แสดงว่าจะบีบไฟล์ไหนและคาดว่าประหยัดได้เท่าไหร่ โดยไม่แก้อะไรจริง
 *   - อัปเดต path และข้อมูลในฐานข้อมูลให้ตรงกับไฟล์ใหม่
 *   - **รันซ้ำได้อย่างปลอดภัย** — ไฟล์ที่ย้ายแล้วมี `fileId` อยู่ จึงถูกข้ามทุกรอบถัดไป
 *   - **หยุดกลางคันแล้วรันต่อได้** — ทำทีละไฟล์และ commit ทีละไฟล์ ไม่มี transaction คร่อมหลายไฟล์
 */

import { MongoClient } from "mongodb";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) || Infinity : Infinity;
})();

/** อ่าน MONGODB_URI จาก .env แบบเดียวกับ server/env.ts (dotenv ไม่ override ค่าที่ตั้งไว้แล้ว) */
function mongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envFile = path.resolve(process.cwd(), ".env");
  if (existsSync(envFile)) {
    const m = /^MONGODB_URI=(.*)$/m.exec(readFileSync(envFile, "utf8"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("ไม่พบ MONGODB_URI — ตั้งเป็น environment variable หรือใส่ไว้ใน .env");
}

/**
 * คอลเลกชันไฟล์เก่าทั้ง 4 ชุด และวิธีผูกกลับไปหาเอกสารเจ้าของ
 *
 * `ownerUpdate` คือฟังก์ชันที่เขียน `fileId`/`url` ใหม่กลับเข้าเอกสารต้นทาง — ต้องทำ ไม่งั้นหน้าจอ
 * จะยังชี้ไปที่ URL เดิมซึ่งไบต์ถูกย้ายออกไปแล้ว
 */
const SOURCES = [
  {
    collection: "document_attachment_files",
    module: (row) => row.docType,
    docId: (row) => row.docId,
    idField: "attachmentId",
    ownerCollection: (row) => row.docType.replace(/-/g, "_"),
    ownerArray: "attachments",
  },
  {
    collection: "scope_attachment_files",
    module: () => "scope-of-works",
    docId: (row) => row.scopeOfWorkId,
    idField: "attachmentId",
    ownerCollection: () => "scope_of_works",
    ownerArray: "attachments",
  },
  {
    collection: "service_checklist_photo_files",
    module: () => "service-reports",
    docId: (row) => row.serviceReportId,
    idField: "photoId",
    ownerCollection: () => "service_reports",
    ownerArray: null, // รูปฝังลึกใน checklist — จัดการแยก ดู `relinkServicePhoto()`
  },
  {
    collection: "ar_attachment_files",
    module: () => "ar-milestones",
    docId: (row) => row.milestoneId,
    idField: "attachmentId",
    ownerCollection: null, // แถวเดิมเก็บ metadata อยู่แล้ว แค่เติม fileId ลงไป
    ownerArray: null,
  },
];

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const client = new MongoClient(mongoUri());
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "tcs_erp");

  console.log(APPLY
    ? "โหมด: ทำจริง (--apply) — จะเขียนทับข้อมูลในฐานข้อมูล\n"
    : "โหมด: dry-run — ไม่แก้อะไรทั้งสิ้น ใส่ --apply เพื่อทำจริง\n");

  // นำเข้าแบบ dynamic เพื่อให้ dry-run ที่ไม่มี sharp ติดตั้งยังรันได้ถึงขั้นรายงาน
  const { compressImage } = await import("../api/_lib/upload/compressImage.ts");
  const { compressPdf } = await import("../api/_lib/upload/compressPdf.ts");
  const { detectFile } = await import("../api/_lib/upload/fileKinds.ts");
  const { uploadConfig } = await import("../api/_lib/upload/uploadConfig.ts");
  const { storage, storageKey } = await import("../api/_lib/upload/storage.ts");
  const cfg = uploadConfig();
  const store = storage();

  let scanned = 0, skipped = 0, converted = 0, before = 0, after = 0, failed = 0;
  const perCollection = {};

  for (const src of SOURCES) {
    const rows = await db.collection(src.collection)
      // ไฟล์ที่ย้ายแล้วมี fileId — ข้ามทุกรอบถัดไป ทำให้รันซ้ำได้อย่างปลอดภัย
      .find({ fileId: { $exists: false }, data: { $exists: true } })
      .limit(Number.isFinite(LIMIT) ? LIMIT : 0)
      .toArray();
    if (rows.length === 0) continue;
    perCollection[src.collection] = { count: 0, before: 0, after: 0 };

    for (const row of rows) {
      scanned++;
      const data = Buffer.from(row.data.buffer ?? row.data);
      const fileName = row.fileName || "file";
      before += data.length;
      perCollection[src.collection].before += data.length;

      let out = data;
      try {
        const detected = await detectFile(data, fileName);
        if (!detected) {
          skipped++;
          console.log(`  ข้าม  ${fileName} — ระบุชนิดไฟล์ไม่ได้`);
          perCollection[src.collection].after += data.length;
          after += data.length;
          continue;
        }
        if (detected.family === "image") {
          out = (await compressImage(data, detected.kind, cfg, true)).data;
        } else if (detected.family === "pdf") {
          out = (await compressPdf(data, cfg)).data;
        }
      } catch (err) {
        failed++;
        console.log(`  ล้มเหลว ${fileName} — ${err?.message ?? err} (เก็บไฟล์เดิม)`);
        out = data;
      }

      after += out.length;
      perCollection[src.collection].after += out.length;
      perCollection[src.collection].count++;
      if (out.length < data.length) converted++;

      const saved = data.length - out.length;
      const pct = data.length > 0 ? ((saved / data.length) * 100).toFixed(0) : "0";
      console.log(`  ${APPLY ? "ย้าย " : "จะย้าย"} ${fileName.padEnd(36).slice(0, 36)} ${mb(data.length)} → ${mb(out.length)} (ลด ${pct}%)`);

      if (!APPLY) continue;

      // ── ทำจริง: เก็บลง storage ใหม่ → เขียนแถวใน files → ผูกกลับเข้าเอกสาร → ลบไบต์เดิม ──
      const detected = await detectFile(out, fileName);
      const id = row[src.idField];
      const key = storageKey(id, detected?.ext ?? "bin");
      await store.save(key, out, detected?.mime ?? "application/octet-stream");
      await db.collection("files").replaceOne({ _id: id }, {
        originalName: fileName, storageKey: key, thumbnailKey: "",
        mime: detected?.mime ?? "application/octet-stream",
        sizeBefore: data.length, sizeAfter: out.length,
        status: out.length < data.length ? "compressed" : "skipped",
        statusReason: out.length < data.length ? "" : "บีบแล้วไม่เล็กลง",
        width: null, height: null,
        uploadedBy: row.createdBy ?? "", uploadedByName: "",
        uploadedAt: row.createdAt ?? new Date().toISOString(),
        module: src.module(row), docId: src.docId(row), isDeleted: false,
      }, { upsert: true });

      // เอกสารต้นทางต้องชี้มาที่ URL ใหม่ ไม่งั้นหน้าจอจะเปิดไฟล์ไม่ได้
      if (src.ownerCollection && src.ownerArray) {
        await db.collection(src.ownerCollection(row)).updateOne(
          { [`${src.ownerArray}.id`]: id },
          {
            $set: {
              [`${src.ownerArray}.$.fileId`]: id,
              [`${src.ownerArray}.$.url`]: `/api/files/${encodeURIComponent(id)}`,
              [`${src.ownerArray}.$.size`]: out.length,
            },
          },
        );
      } else if (src.collection === "service_checklist_photo_files") {
        await relinkServicePhoto(db, src.docId(row), id, out.length);
      }

      // เติม fileId แล้วเอาไบต์ออกจากแถวเดิม — แถวยังอยู่เพื่อเก็บ metadata เฉพาะโมดูล (เช่น checklistKey)
      await db.collection(src.collection).updateOne(
        { [src.idField]: id }, { $set: { fileId: id, size: out.length }, $unset: { data: "" } },
      );
    }
  }

  console.log("\n─────────────────────────────────────────────");
  for (const [name, s] of Object.entries(perCollection)) {
    console.log(`${name.padEnd(32)} ${String(s.count).padStart(4)} ไฟล์  ${mb(s.before)} → ${mb(s.after)}`);
  }
  console.log("─────────────────────────────────────────────");
  console.log(`สแกน ${scanned} ไฟล์ · เล็กลง ${converted} · ข้าม ${skipped} · ล้มเหลว ${failed}`);
  console.log(`รวม ${mb(before)} → ${mb(after)}  ประหยัด ${mb(before - after)}` +
    (before > 0 ? ` (${(((before - after) / before) * 100).toFixed(1)}%)` : ""));
  if (!APPLY && scanned > 0) console.log("\nยังไม่ได้แก้อะไร — ใส่ --apply เพื่อทำจริง (สำรองฐานข้อมูลก่อน)");

  await client.close();
}

/** รูปเช็คลิสต์ฝังอยู่ใน `checklist[].groups[].items[].photos[]` ซึ่งลึกเกินกว่าจะใช้ `$` positional */
async function relinkServicePhoto(db, reportId, photoId, size) {
  const reports = db.collection("service_reports");
  const doc = await reports.findOne({ _id: reportId });
  if (!doc?.checklist) return;
  let touched = false;
  const checklist = doc.checklist.map((s) => ({
    ...s,
    groups: s.groups.map((g) => ({
      ...g,
      items: g.items.map((it) => {
        if (!(it.photos ?? []).some((p) => p.id === photoId)) return it;
        touched = true;
        return {
          ...it,
          photos: it.photos.map((p) => (p.id !== photoId ? p
            : { ...p, fileId: photoId, url: `/api/files/${encodeURIComponent(photoId)}`, size })),
        };
      }),
    })),
  }));
  if (touched) await reports.updateOne({ _id: reportId }, { $set: { checklist } });
}

main().catch((err) => {
  console.error("สคริปต์ล้มเหลว:", err);
  process.exit(1);
});
