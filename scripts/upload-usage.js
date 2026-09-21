/**
 * รายงานว่า "ไฟล์ที่ผู้ใช้อัปโหลดกินพื้นที่ในฐานข้อมูลไปเท่าไหร่" — สคริปต์ของ mongosh
 *
 * ใช้ตอบคำถามเดียว: ควรรีบรันสคริปต์บีบไฟล์เก่า (`compress-existing-uploads.mjs`) แค่ไหน
 * **อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น** รันกับเครื่อง production ได้ปลอดภัย
 *
 * วิธีรันบนเซิร์ฟเวอร์ (ที่โฟลเดอร์ที่มี docker-compose.yml) — ดู docs/DEPLOYMENT.md:
 *
 *   docker compose exec -T mongodb sh -c 'mongosh --quiet \
 *     -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
 *     --authenticationDatabase admin tcs_erp' < scripts/upload-usage.js
 *
 * ถ้าไม่มีโปรเจกต์อยู่บนเซิร์ฟเวอร์ ให้วางเนื้อไฟล์นี้ต่อท้าย `<<'JS'` แทน (ดู CHANGELOG 2026-09-21z)
 */

/** คอลเลกชันที่เก็บไบต์ไฟล์จริง · `file_blobs` คือที่เก็บใหม่ตั้งแต่ 2026-09-21 ที่เหลือคือของเดิม */
const COLLECTIONS = [
  ["document_attachment_files", "ไฟล์แนบ ใบสั่งงาน/ใบขอซื้อ/ใบส่งมอบ/ใบรับสินค้า"],
  ["scope_attachment_files", "ไฟล์แนบ Scope of Work"],
  ["service_checklist_photo_files", "รูปเช็คลิสต์งานบริการ"],
  ["ar_attachment_files", "ไฟล์แนบงวดบัญชี"],
  ["file_blobs", "ระบบอัปโหลดใหม่ (บีบอัดแล้ว)"],
];

function mb(bytes) {
  return (bytes / 1048576).toFixed(1).padStart(8) + " MB";
}

/** `$collStats` เป็นทางที่ไม่ถูก deprecate บน MongoDB 8 · คอลเลกชันที่ไม่มีจะโยน จึงต้อง try */
function statsOf(name) {
  try {
    return db.getCollection(name).aggregate([{ $collStats: { storageStats: {} } }]).toArray()[0].storageStats;
  } catch (e) {
    return { count: 0, size: 0 };
  }
}

print("");
print("ไฟล์ที่ผู้ใช้อัปโหลด — พื้นที่ในฐานข้อมูล");
print("=".repeat(74));

let totalCount = 0;
let totalBytes = 0;
let legacyCount = 0;
let legacyBytes = 0;

for (const [name, label] of COLLECTIONS) {
  const s = statsOf(name);
  totalCount += s.count;
  totalBytes += s.size;
  if (name !== "file_blobs") {
    legacyCount += s.count;
    legacyBytes += s.size;
  }
  print(label.padEnd(46) + String(s.count).padStart(6) + " ไฟล์ " + mb(s.size));
}

print("-".repeat(74));
print("รวมทั้งหมด".padEnd(46) + String(totalCount).padStart(6) + " ไฟล์ " + mb(totalBytes));
print("ยังไม่ได้บีบอัด (ของเดิม)".padEnd(44) + String(legacyCount).padStart(6) + " ไฟล์ " + mb(legacyBytes));

const st = db.stats();
print("");
print("ฐานข้อมูลทั้งหมด        " + mb(st.dataSize) + "   (พื้นที่จริงบนดิสก์ " + mb(st.storageSize) + ")");
print("สัดส่วนที่เป็นไฟล์แนบ    " + (st.dataSize > 0 ? ((totalBytes / st.dataSize) * 100).toFixed(1) : "0") + "%");

/**
 * ประมาณการคร่าว ๆ ว่าบีบแล้วจะประหยัดได้เท่าไหร่ — ตัวเลขจริงต้องดูจาก dry-run ของ
 * `compress-existing-uploads.mjs` ตัวนี้แค่ช่วยตัดสินใจว่าคุ้มจะรันไหม
 *
 * 60% มาจากอะไร: รูปที่ยังไม่เคยผ่านการบีบเลย (ไฟล์แนบเอกสารกับบัญชี) ลดได้ราว 85–95%
 * ส่วนรูปที่เคยบีบฝั่งเบราว์เซอร์มาแล้วลดได้อีกแค่ราว 10% — ของจริงอยู่ระหว่างสองค่านี้
 */
if (legacyBytes > 0) {
  print("");
  print("ถ้าบีบไฟล์เดิมทั้งหมด คาดว่าจะเหลือราว " + mb(legacyBytes * 0.4) + " (ประหยัดราว " + mb(legacyBytes * 0.6) + ")");
  print("ตัวเลขจริงดูได้จาก: node scripts/compress-existing-uploads.mjs   (dry-run ไม่แก้อะไร)");
}
print("");
