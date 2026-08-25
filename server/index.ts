import "./env.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3001;

const server = createApp().listen(port, () => {
  console.log(`TCS ERP server listening on http://localhost:${port}`);
});

// พอร์ตไม่ว่าง = ต้องบอกให้ชัดแล้วออก ไม่ใช่โยน stack trace ดิบ ๆ ทิ้งไว้
// ตอน dev ถ้า API ตายเงียบ ๆ แบบนี้ Vite จะยังรันต่อและพร็อกซีไปยังพอร์ตที่ไม่มีใครฟัง
// (หรือแย่กว่านั้น ไปเจอ vite อีกตัวที่ยึดพอร์ตนี้ไว้ — เหตุการณ์ 2026-08-25)
//
// A busy port must say so and exit, not surface as a raw stack trace. In dev this failure is
// especially quiet: Vite keeps running and proxies /api at a port with nothing behind it — or, if
// another Vite has taken it, at another Vite. See the 2026-08-25 note in vite.config.ts.
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `TCS ERP server: port ${port} is already in use — another instance is probably still running.\n` +
      `Stop it first (Windows: Get-NetTCPConnection -LocalPort ${port} -State Listen, then Stop-Process -Id <pid>), ` +
      `or start this one on a different port with PORT=<n> npm start.`,
    );
    process.exit(1);
  }
  throw err;
});
