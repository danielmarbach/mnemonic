FROM node:24 AS builder

WORKDIR /app

COPY package*.json ./
# Docker builds do not need to install repository git hooks.
RUN npm ci --ignore-scripts

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24

WORKDIR /app

COPY package*.json ./
# The runtime image does not contain repository tooling or git hooks.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/build ./build

ENV VAULT_PATH=/vault
ENV OLLAMA_URL=http://host-gateway:11434
ENV EMBED_MODEL=nomic-embed-text-v2-moe
ENV DISABLE_GIT=false

CMD ["node", "build/index.js"]
