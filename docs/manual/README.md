# คู่มือการใช้งาน — วิธีทำงานกับคู่มือ

คู่มือตัวจริงมีที่เดียวคือ `public/manual.html` (+ ภาพใน `public/manual-images/`) · ตั้งแต่ 2026-10-06 เปิดได้เฉพาะคนที่ล็อกอินแล้ว
(nginx `auth_request` — ดู [DEPLOYMENT.md](../DEPLOYMENT.md)) · ปุ่ม "คู่มือการใช้งาน" บนแถบบนของแอปเปิดบทของหน้าที่ผู้ใช้อยู่
(`NAV_MANUAL_CHAPTER` ใน `src/lib/manualSections.ts` — เพิ่มหน้าใหม่ต้องเพิ่มแถวในตารางนี้ด้วย ไม่งั้น `tests/manualNavChapters.test.ts` ตก)

## สร้าง PDF

```bash
npm install --no-save puppeteer-core          # ไม่ได้อยู่ใน devDependencies โดยตั้งใจ
npx vite --port 3000                          # หรือ npm run dev — ต้องมีอะไรเสิร์ฟ public/ ที่ :3000
node docs/manual/generate-pdf.mjs             # → dist-manual/คู่มือการใช้งาน TCS ERP.pdf (gitignored)
```

รันจริงครั้งแรกหลังเขียนสคริปต์ใหม่เมื่อ 2026-10-06: ได้ PDF 206 หน้า ภาพ 94 ภาพ ~32MB เรนเดอร์ปกติ (ตรวจหน้าปกและหน้าที่มีภาพเป็นภาพแล้ว)
สคริปต์ปฏิเสธการเขียนลง `public/` — PDF มีข้อมูลลูกค้าจริง อย่าคัดลอกไปไว้ที่ที่เปิดได้โดยไม่ล็อกอิน

## ถ่ายภาพหน้าจอทำคู่มือ — ปิดทัวร์ไม่ให้เด้งบัง

ทัวร์ประจำหน้า (`useModuleTour`) เล่นเองครั้งแรกที่ผู้ใช้เปิดหน้านั้น และกล่องชวนทัวร์หลักโผล่มุมขวาล่างตอนล็อกอินครั้งแรก — ทั้งสองอย่าง
บังภาพที่จะถ่าย ปิดทั้งหมดในเบราว์เซอร์ที่ใช้ถ่ายด้วยสวิตช์เดียว (เพิ่ม 2026-10-06, `src/lib/tour.ts`):

```js
// ใน DevTools console ของเบราว์เซอร์ที่ใช้ถ่าย
localStorage.setItem("tcs_erp_tours_disabled", "1");   // ปิด
localStorage.removeItem("tcs_erp_tours_disabled");     // เปิดคืน

// หรือใน Playwright ก่อน page.goto() แรก
await page.addInitScript(() => localStorage.setItem("tcs_erp_tours_disabled", "1"));
```

สวิตช์นี้ทำให้ทุกทัวร์ถูกนับว่า "ดูแล้ว" โดยไม่บันทึกอะไรเพิ่ม — ลบสวิตช์แล้วทัวร์ที่ยังไม่เคยเล่นจะกลับมาเล่นตามปกติ · ปุ่มเล่นทัวร์ซ้ำข้างชื่อหน้ายังกดได้

รายการภาพที่ต้องถ่ายอยู่ที่ `docs/manual/figures.json`
