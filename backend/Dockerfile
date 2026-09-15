# ビルドコンテキストはリポジトリのルート。shared/ を取り込むため。
#   docker build -f backend/Dockerfile -t cokoyo-backend .

FROM node:24-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install
COPY shared ./shared
COPY backend ./backend
RUN cd backend && npm run build
# shared/ は backend/package.json の外にあるので、モジュール形式がずれると
# 実行時まで気づけない。ビルド直後に読み込めることを確かめる。
RUN node --input-type=module -e "\
  const m = await import('/app/backend/dist/shared/app-types.js'); \
  if (!m.BUILDING_LABELS) { console.error('shared module did not load as ESM'); process.exit(1); }"

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist

# SQLite のファイルはボリュームに置く。
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

ENV PORT=8080 DB_PATH=/data/cokoyo.db
EXPOSE 8080
CMD ["node", "dist/backend/src/index.js"]
