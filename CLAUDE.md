# TCS ERP

Full project documentation lives in [`docs/`](./docs/CLAUDE.md) — **read `docs/CLAUDE.md` first**, it's the entry point and links to everything else (status, changelog, architecture, database, API, UI guidelines, RBAC, and per-module docs). Two things used to live inside it and now sit beside it, so the entry point stays small: [`docs/MODULE_STATUS.md`](./docs/MODULE_STATUS.md) (what each module is and what was deliberately removed — **check it before assuming a feature exists**) and [`docs/FOLDER_MAP.md`](./docs/FOLDER_MAP.md) (annotated tree of `api/`, `server/`, `src/`).

⚠️ **Before building anything in Accounting, Purchasing/Inventory, or a new document-generation module**: read the active coordination note at the top of `docs/CLAUDE.md` and `docs/TODO.md` High Priority — two parallel workstreams (Accounting module vs. Material Requisition/PR/Production Order/Job Delivery Note) are starting at the same time and will need to connect to each other; scope/ownership boundaries aren't agreed yet.

Quick facts:
- Vite + React 18 + TypeScript (strict) + Tailwind v4 frontend, **real backend**: Node.js + self-hosted MongoDB (see `docs/ARCHITECTURE.md`). Since the ~2026-08-07 cutover, production runs on a self-hosted VPS (**https://www.huma-erp.com/**) via the **standalone Express server** (`server/`, routes `/api/*` via `API_ROUTES` in `server/app.ts` to the `api/` handlers — see `docs/DEPLOYMENT.md`). The app has no Vercel dependency of any kind (all Vercel artifacts removed from the repo 2026-09-14). Every domain lib calls a real REST API and RBAC is enforced server-side (`requirePermission()` on every mutating route). See `docs/RBAC.md`, `docs/DATABASE.md`, and `docs/SERVER_MIGRATION_PLAN.md`.
- `npm run dev` (full local stack: Express API :3001 + Vite :3000 with `/api` proxy; env from `.env`) / `npm start` (production: one Express process serving API + `dist/`) / `npm run build` / `npm run lint` / `npm test` (vitest, added 2026-07-29 — includes in-memory-MongoDB integration tests).
- **Only ever run one `npm run dev` at a time, and check nothing is already holding :3000/:3001 first** (`Get-NetTCPConnection -LocalPort 3000,3001 -State Listen`). Orphaned dev servers are a recurring hazard on this machine. Both ports now fail loudly on a collision (`strictPort: true` in `vite.config.ts`, an `EADDRINUSE` handler in `server/index.ts`) — before 2026-08-25 a second stack silently let Vite take :3001 and proxy `/api` into itself, which exhausted the machine's sockets (`ENOBUFS` everywhere). See CHANGELOG.md 2026-08-25d.
- **Documentation must be updated as part of every task, not after.** See the standing rule at the bottom of `docs/CLAUDE.md`.

## กฎการอัปโหลดรูปและไฟล์ (บังคับใช้กับทุกส่วนของเว็บ)

ระบบต้องเก็บข้อมูล 10 ปี และพื้นที่ดิสก์มีจำกัด ทุกไฟล์จึงต้องถูกบีบอัดก่อนเก็บ

- ทุกการอัปโหลดในทุกโมดูล ทั้งของเดิมและฟีเจอร์ใหม่ ต้องเรียก `storeUpload()` ใน
  **`api/_lib/upload/uploadService.ts`** เท่านั้น
- **ห้ามเขียนโค้ดบันทึกไฟล์เองในโมดูลใดๆ** — ห้ามเขียน `Binary` ลงคอลเลกชันของตัวเอง
- รูปทุกรูป: หมุนตาม EXIF → ลบ metadata → ย่อด้านยาวไม่เกิน 2000px → แปลงเป็น WebP quality 80
  → สร้างรูปย่อ 400px · **ลำดับหมุนก่อนลบ metadata ห้ามสลับ** ไม่งั้นรูปจากมือถือจะตะแคงถาวร
- PDF ทุกไฟล์: บีบอัดด้วย Ghostscript (~150dpi) ถ้าไม่เล็กลงอย่างน้อย 10% ให้เก็บไฟล์เดิม
- DOCX/XLSX/PPTX: ไม่บีบซ้ำ (เป็น zip อยู่แล้ว) แต่ต้องจำกัดขนาด
- ต้องมี whitelist ชนิดไฟล์ และ**ตรวจจากเนื้อไฟล์จริง (magic bytes) ทุกครั้ง** ห้ามเชื่อนามสกุล
  หรือ `Content-Type` ที่ browser ส่งมา
- ต้องจำกัดขนาดไฟล์ทุกครั้ง — ค่าเริ่มต้นอยู่ที่ **`api/_lib/upload/uploadConfig.ts`** และปรับได้
  จาก environment variable (`UPLOAD_*` ใน `.env.example`) **ห้าม hardcode**
- ไฟล์ทุกไฟล์ต้องบันทึกในตาราง **`files`** พร้อมขนาดก่อนและหลังบีบอัด
- ไฟล์ดาวน์โหลดผ่าน **`GET /api/files/:id`** ซึ่งตรวจสิทธิ์ตามโมดูลเจ้าของไฟล์
  โมดูลใหม่ต้องลงทะเบียนใน `MODULE_PERMISSION` (`api/_lib/upload/filesHandler.ts`)
  มิฉะนั้นไฟล์จะเปิดไม่ได้เลย — ตั้งใจให้พลาดในทางที่ปลอดภัย
- **เมื่อลบรายการ ต้องลบไฟล์จริงด้วย** ผ่าน `deleteUpload()` / `deleteUploadsOf()`
- เมื่อสร้างหรือแก้ฟีเจอร์ใดที่มีการอัปโหลด ให้ตรวจทุกครั้งว่าใช้ service กลางและทำตามกฎนี้ครบ
- ถ้าต้องการยกเว้นกฎ เช่น เก็บรูปความละเอียดสูง รับวิดีโอ หรือรับ zip **ให้ถามเจ้าของโปรเจกต์ก่อน**

⚠️ **ข้อยกเว้นที่ยังเหลืออยู่ (ตั้งใจ)**: รูปโปรไฟล์ โลโก้ ตราประทับ และลายเซ็น ยังเก็บเป็น base64
ฝังในเอกสาร (`users`, `company`) ไม่ได้ผ่าน service กลาง — เจ้าของเลือกไม่ย้ายในรอบ 2026-09-21
เพราะใบพิมพ์ทุกใบอ่าน `signatureDataUrl` ตรง ๆ และรวมกันไม่ถึง 1MB · ทั้งหมดถูกบีบเป็น WebP
ฝั่งเบราว์เซอร์อยู่แล้ว (`src/lib/imageCompression.ts`)
