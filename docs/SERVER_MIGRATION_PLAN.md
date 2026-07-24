# แผนย้ายระบบขึ้น Server จริง (Server Migration Plan)

> **บันทึกจากการคุยกันวันที่ 24 ก.ค. 2026** — เก็บไว้เพื่อไม่ต้องอธิบายใหม่
> สถานะ: **ยังไม่เริ่ม — รอจนกว่าระบบจะพัฒนาเสร็จและเจ้าของสั่งให้เริ่ม**

## ข้อตกลงสำคัญ (Key Facts)

- **Vercel ที่ใช้อยู่ตอนนี้ (https://tcs-erp-nine.vercel.app) เป็นแค่ demo สำหรับทดลองระบบเท่านั้น**
  ไม่ใช่ที่อยู่จริงระยะยาว — ของจริงจะขึ้น Server เอง (ยังไม่ได้ตัดสินใจว่าที่ไหน/แบบไหน)
- งานพัฒนาระบบ**ยังไม่เสร็จ** — ระหว่างนี้พัฒนาต่อบน demo ตามปกติ
- **กติกาตั้งแต่ 2026-07-24 เป็นต้นไป:** ฟีเจอร์ใหม่ทุกตัวต้องใช้ของที่ย้ายตามได้
  (MongoDB / Node ธรรมดา / REST ปกติ) — **ห้ามผูกเพิ่มกับบริการเฉพาะของ Vercel**
  (Blob, KV, Edge Config, Cron ฯลฯ) เว้นแต่ตกลงกันก่อนเป็นกรณีไป

## สิ่งที่เคยเจอมาแล้ว (บทเรียน)

ฟีเจอร์แนบไฟล์ Scope of Work (2026-07-24) ตอนแรกสร้างบน **Vercel Blob** แล้วต้องรื้อกลับมาเก็บใน
**MongoDB** (collection `scope_attachment_files`) ภายในวันเดียว หลังจากรู้ว่า Vercel เป็นแค่ demo —
นี่คือเหตุผลของกติกาข้างบน ไฟล์ต้องเดินทางไปกับฐานข้อมูล

## สถานะความพร้อมย้าย ณ ตอนนี้

| ส่วน | ย้ายได้เลย? | หมายเหตุ |
|---|---|---|
| หน้าเว็บ (React/Vite) | ✅ | build เป็นไฟล์ static เสิร์ฟจากที่ไหนก็ได้ (nginx ฯลฯ) |
| ฐานข้อมูล MongoDB Atlas | ✅ | ใช้ Atlas ต่อ หรือย้ายไป MongoDB บนเซิร์ฟเวอร์ตัวเอง (dump/restore) |
| ไฟล์แนบ | ✅ | อยู่ใน MongoDB แล้ว ไปกับฐานข้อมูล |
| อีเมล (Resend REST API) | ✅ | แค่ตั้ง `RESEND_API_KEY` บนโฮสต์ใหม่ |
| ระบบล็อกอิน (bcrypt + JWT cookie) | ✅ | ไม่ผูกกับ Vercel (cookie `secure` ต้องมี HTTPS) |
| **ตัว API — 12 ไฟล์ใน `api/handlers/` + routing ใน `vercel.json`** | ⚠️ | จุดเดียวที่ผูกกับ Vercel Functions — ต้องทำ "เปลือก Express" มาครอบ (ดูแผนข้างล่าง) |

โชคดีที่ logic ธุรกิจเกือบทั้งหมดอยู่ใน `api/_lib/` ซึ่งไม่ผูกกับ Vercel และรูปแบบ req/res ที่ใช้
(`req.query`, `req.body`, `res.status().json()`) เข้ากันได้กับ Express แทบ 100% —
**ไม่ต้องเขียน API ใหม่** แค่เพิ่มชั้นบาง ๆ มาครอบของเดิม

## แผนตอนย้ายจริง (3 ขั้น — ทำเมื่อเจ้าของสั่งเท่านั้น)

1. **สร้าง Express server** (`server/index.ts`) — mount handler ทั้ง 12 ตัวเดิมตามเส้นทางใน
   `vercel.json` + เสิร์ฟหน้าเว็บจาก `dist/` พร้อม SPA fallback
   *(ของแถม: ได้รันระบบเต็มบนเครื่องตัวเองเป็นครั้งแรก ทดสอบได้โดยไม่ต้อง deploy)*
2. **ทำ `.env.example`** — รวบรวมตัวแปรที่ต้องตั้ง: `MONGODB_URI`, JWT secret,
   `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
3. **เขียน `docs/DEPLOYMENT.md`** — คู่มือติดตั้งบนเซิร์ฟเวอร์จริง:
   - Node 20+ / PM2 หรือ systemd (รันตลอด ฟื้นเองเมื่อล่ม)
   - nginx reverse proxy + HTTPS (Let's Encrypt)
   - ตัวเลือกฐานข้อมูล: ใช้ Atlas ต่อ vs ติดตั้ง MongoDB เอง + แผน backup
   - ย้ายค่า env จาก Vercel มาที่โฮสต์ใหม่

ขั้น 1–2 ทำล่วงหน้าได้โดยไม่กระทบ demo บน Vercel (โค้ดเดิมรันบน Vercel ต่อได้ปกติ)

## เอกสารที่เกี่ยวข้อง

- [ARCHITECTURE.md](./ARCHITECTURE.md) — สถาปัตยกรรมปัจจุบัน (Vercel Functions + MongoDB)
- [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Attachments" — ตัวอย่างการรื้อของที่ผูกกับ Vercel ออก
