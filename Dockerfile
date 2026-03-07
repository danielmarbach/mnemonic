FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY *.ts tsconfig*.json ./
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache git openssh-client

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build

ENV VAULT_PATH=/vault
ENV OLLAMA_URL=http://host-gateway:11434
ENV EMBED_MODEL=nomic-embed-text
ENV DISABLE_GIT=false

CMD ["node", "build/index.js"]
