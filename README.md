# TCS ERP

ระบบ ERP ของ Thai Chemicals Storage ครอบคลุมงานขาย บริการ บัญชี โครงการ ผลิต จัดซื้อ คลังสินค้า/สโตร์ และงานผู้ดูแลระบบในที่เดียว

- **เว็บจริง (production):** https://www.huma-erp.com/ รันบน VPS ของบริษัทเอง
- **เอกสารฉบับเต็ม:** [`docs/CLAUDE.md`](./docs/CLAUDE.md) เป็นจุดเริ่มต้น และลิงก์ไปเอกสารทุกฉบับ

## เทคโนโลยี

| ส่วน | ใช้อะไร |
|---|---|
| หน้าบ้าน | Vite + React 18 + TypeScript (strict) + Tailwind CSS v4 |
| หลังบ้าน | Node.js + Express (`server/`) เรียก handler ใน `api/` ผ่าน `/api/*` |
| ฐานข้อมูล | MongoDB (self-hosted) |
| ทดสอบ | Vitest (มี integration test กับ MongoDB ในหน่วยความจำ) |

สิทธิ์ผู้ใช้ (RBAC) ตรวจที่ฝั่งเซิร์ฟเวอร์ทุก route ที่แก้ข้อมูล ดู [`docs/RBAC.md`](./docs/RBAC.md)

## เริ่มใช้งานบนเครื่อง

ต้องมี Node.js และ MongoDB ที่รันอยู่บนเครื่อง

```bash
npm install
cp .env.example .env   # แล้วแก้ค่าใน .env (อย่างน้อย MONGODB_URI และ JWT_SECRET)
npm run dev
```

เปิด http://localhost:3000 ได้เลย `npm run dev` รันทั้งสองส่วนพร้อมกัน คือ API ที่พอร์ต 3001 และ Vite ที่พอร์ต 3000 โดย Vite ส่งต่อ `/api` ไปที่ API

> ⚠️ **รัน `npm run dev` ได้ทีละตัวเท่านั้น** ก่อนรันให้เช็กว่าพอร์ต 3000/3001 ว่าง (PowerShell: `Get-NetTCPConnection -LocalPort 3000,3001 -State Listen`)
> ทั้งสองพอร์ตตั้งไว้ให้ error ทันทีถ้ามีตัวอื่นใช้อยู่

ถ้าเริ่มกับฐานข้อมูลเปล่า ระบบจะเปิดหน้า **Setup Wizard** ให้สร้างผู้ดูแลระบบคนแรก

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รันระบบเต็มสำหรับพัฒนา (API :3001 + Vite :3000) |
| `npm run build` | ตรวจ type ทั้งหน้าบ้านและ API แล้ว build ไปที่ `dist/` |
| `npm start` | รันแบบ production: Express ตัวเดียวให้บริการทั้ง API และ `dist/` |
| `npm run lint` | ESLint |
| `npm test` | Vitest ทั้งหมด |

## ตัวแปร environment

ดูรายการเต็มพร้อมคำอธิบายใน [`.env.example`](./.env.example) และห้าม commit ไฟล์ `.env` จริง

- `MONGODB_URI`, `MONGODB_DB`: การเชื่อมต่อฐานข้อมูล
- `JWT_SECRET`: กุญแจเซ็น token ตอนเข้าสู่ระบบ
- `PORT`, `APP_URL`, `NODE_ENV`: การตั้งค่าเซิร์ฟเวอร์
- `LINE_*`: การแจ้งเตือนผ่าน LINE
- `UPLOAD_*`: ขนาดไฟล์สูงสุด ชนิดไฟล์ที่รับ และค่าการบีบอัดของไฟล์อัปโหลด

## กฎที่ต้องรู้ก่อนแก้โค้ด

- **อัปโหลดไฟล์ทุกจุดต้องผ่าน `storeUpload()`** ใน `api/_lib/upload/uploadService.ts` เท่านั้น เพราะระบบต้องเก็บข้อมูล 10 ปีและพื้นที่ดิสก์มีจำกัด
  รูปทุกรูปถูกแปลงเป็น WebP และ PDF ถูกบีบด้วย Ghostscript รายละเอียดอยู่ใน [`CLAUDE.md`](./CLAUDE.md)
- **อัปเดตเอกสารในงานเดียวกัน** ทุกครั้งที่แก้โค้ด (CHANGELOG, เอกสารโมดูล) ไม่ใช่ทำทีหลัง
- ฟีเจอร์ที่ผู้ใช้เห็นต้องเพิ่มรายการใน "มีอะไรใหม่" (`src/lib/whatsNew.ts`)
- ข้อความบนหน้าจอทุกคำต้องผ่าน `t()` (`src/lib/i18n.tsx`) มีทั้งไทยและอังกฤษ
- หน้าตาและคำศัพท์ต้องตรงตาม [`DESIGN.md`](./DESIGN.md) และ [`PRODUCT.md`](./PRODUCT.md)

## โครงสร้างโฟลเดอร์

```
api/        handler ของ REST API (+ api/_lib/ ของใช้ร่วม เช่น auth, upload)
server/     Express server ที่ผูก /api/* เข้ากับ handler และเสิร์ฟหน้าเว็บ
src/        หน้าบ้าน React: pages/ (แยกตามโมดูล), components/, lib/
tests/      Vitest
docs/       เอกสารทั้งหมดของโปรเจกต์
```

รายละเอียดทุกไฟล์ดูที่ [`docs/FOLDER_MAP.md`](./docs/FOLDER_MAP.md)

## เอกสารที่ใช้บ่อย

| เอกสาร | เนื้อหา |
|---|---|
| [`docs/MODULE_STATUS.md`](./docs/MODULE_STATUS.md) | แต่ละโมดูลทำอะไรได้ และอะไรถูกถอดออกไปแล้ว (**ดูก่อนคิดว่ามีฟีเจอร์ไหนอยู่**) |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | สถาปัตยกรรมของระบบ |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | collection และรูปร่างข้อมูล |
| [`docs/API.md`](./docs/API.md) | รายการ endpoint |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | การ deploy ขึ้น VPS |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | ประวัติการเปลี่ยนแปลง |
| [`docs/TODO.md`](./docs/TODO.md) | งานที่ยังค้าง |
