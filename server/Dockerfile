# API image. Build context is the repository root, because the API runs the shared domain code in /src.
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-audit --no-fund
COPY src ./src
COPY server ./server
RUN cd server && npm run typecheck && npm run build

FROM node:22-alpine
# Chromium and Thai/Latin fonts render emailed documents to PDF.
RUN apk add --no-cache tzdata chromium font-noto font-noto-thai
ENV NODE_ENV=production \
    TZ=Asia/Bangkok \
    PORT=3000 \
    MIGRATIONS_DIR=/app/sql \
    UPLOAD_DIR=/data/uploads \
    CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY server/sql ./sql
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/index.js"]
