# TCS ERP — one Dockerfile, two targets (see docker-compose.yml):
#   target: app    → Node process serving the API (server/index.ts)
#   target: web    → nginx serving the built frontend + proxying /api to app:3001

FROM node:22-alpine AS build
WORKDIR /app
# mongodb-memory-server (test-only dep) would otherwise download a full mongod binary on install
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- API ----
FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production
# Ghostscript — ตัวบีบอัด PDF ของระบบอัปโหลด (api/_lib/upload/compressPdf.ts)
# ไม่มีก็ไม่พัง: PDF จะถูกเก็บขนาดเดิมพร้อม log ตามข้อ 4.2.3 ของ docs/UPLOAD_COMPRESSION_TASK.md
# แต่จะไม่ประหยัดพื้นที่เลย ซึ่งเป็นเหตุผลทั้งหมดของงานนี้
#
# sharp (ตัวบีบรูป) **ไม่ต้องติดตั้งอะไรเพิ่ม** — มี prebuilt สำหรับ musl (@img/sharp-linuxmusl-x64)
# จึงอยู่บน alpine ได้ตามเดิม และ HEIC ถอดรหัสด้วย libheif-js ที่เป็น WebAssembly ล้วน
RUN apk add --no-cache ghostscript
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev
COPY --from=build /app/server ./server
COPY --from=build /app/api ./api
# api/ value-imports shared pure helpers from src/lib (see docs/ARCHITECTURE.md), and the
# Quotation Templates import reads the .xlsx in public/ via process.cwd() at runtime.
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
# tsconfig has to ship too — WITHOUT IT THE CONTAINER CRASH-LOOPS (fixed 2026-08-21).
# CMD runs the TypeScript sources through tsx, and tsx reads tsconfig.json to decide which JSX
# transform to use. `"jsx": "react-jsx"` (the automatic runtime) is what lets a .tsx file use JSX
# without importing React. With no tsconfig to find, tsx falls back to the CLASSIC runtime and emits
# React.createElement(...) instead — so src/lib/quotes.tsx, which api/ value-imports for its shared
# amount helpers and which carries JSX status icons, died on startup with
# "ReferenceError: React is not defined" at every boot. Host/PM2 deploys never hit this because the
# repo checkout already has tsconfig.json sitting next to the sources.
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.api.json ./tsconfig.api.json
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "server/index.ts"]

# ---- nginx ----
FROM nginx:alpine AS web
# Certs are NOT baked in — mounted at runtime from ./nginx/certs (see docker-compose.yml)
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
EXPOSE 443