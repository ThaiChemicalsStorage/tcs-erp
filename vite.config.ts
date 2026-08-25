import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Dev-only: /api is proxied to the Express API server (`npm run dev` starts both — see
  // server/index.ts, default port 3001). In production Express serves the built dist/ itself,
  // so everything is same-origin and no proxy exists.
  // `strictPort` ห้ามขยับพอร์ตเองเด็ดขาด — ถ้า 3000 ไม่ว่างต้องล้มไปเลย ห้ามเลื่อนไป 3001
  // เพราะ 3001 คือพอร์ตของ API ซึ่งเป็นปลายทางของพร็อกซีข้างล่างนี้เอง (เคยพังมาแล้ว 2026-08-25:
  // vite ไปยึด 3001 แล้วพร็อกซี /api กลับเข้าหาตัวเอง วนไม่รู้จบจนเครื่องเปิด socket ไม่ได้)
  //
  // `strictPort` is load-bearing, not tidiness. Vite's default is to increment when its port is
  // taken — and the next port up is 3001, the API port this very proxy targets. On 2026-08-25 a
  // second `npm run dev` did exactly that: Vite took 3001, that stack's API could not bind and
  // died, and Vite proxied /api straight back into itself. ~13k self-connections and ENOBUFS on
  // every request until the processes were killed. Failing loudly on a busy port is the only safe
  // behaviour here.
  server: { port: 3000, strictPort: true, proxy: { "/api": "http://localhost:3001" } },

})
