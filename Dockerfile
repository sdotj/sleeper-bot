# --- build stage: compile the server (tsc) and the web app (vite) ---
FROM node:22-slim AS builder
WORKDIR /app

# Server deps (incl. dev, for tsc) + build.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Web deps + build.
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

# --- runtime stage: prod deps + compiled output only ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
# Bundled example data the app falls back to (KTC values, DST tier). Real
# secrets/config come from env (SLEEPBOT_CONFIG_JSON, DATABASE_URL, ...).
COPY config ./config

EXPOSE 8787
CMD ["node", "dist/api/index.js"]
