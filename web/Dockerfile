# QA Hub em produção (saída "standalone" do Next).
#   docker compose build qa-hub

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S qahub && adduser -S qahub -G qahub
COPY --from=build --chown=qahub:qahub /app/.next/standalone ./
COPY --from=build --chown=qahub:qahub /app/.next/static ./.next/static
COPY --from=build --chown=qahub:qahub /app/public ./public
# Evidências (EVIDENCE_STORAGE=local) ficam num volume montado aqui.
RUN mkdir -p /app/.evidence && chown qahub:qahub /app/.evidence
USER qahub
EXPOSE 3000
CMD ["node", "server.js"]
