# ビルドコンテキストはリポジトリのルート。shared/ を取り込むため。
#   docker build -f backend/Dockerfile -t cokoyo-backend .

FROM node:24-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install
COPY shared ./shared
COPY backend ./backend
RUN cd backend && npm run build

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
