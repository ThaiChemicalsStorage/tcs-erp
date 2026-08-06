# TCS ERP — production image: one Node process (server/index.ts) serving the API + built frontend.
# Used by docker-compose.yml (untracked — reference copy in docs/DEPLOYMENT.md "Docker").

FROM node:22-alpine AS build
WORKDIR /app
# mongodb-memory-server (test-only dep) would otherwise download a full mongod binary on install
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/api ./api
# api/ value-imports shared pure helpers from src/lib (see docs/ARCHITECTURE.md), and the
# Quotation Templates import reads the .xlsx in public/ via process.cwd() at runtime.
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "server/index.ts"]
