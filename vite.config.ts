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
  server: { port: 3000, proxy: { "/api": "http://localhost:3001" } },

})
