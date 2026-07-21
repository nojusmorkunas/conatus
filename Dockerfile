FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    S3_ENDPOINT=127.0.0.1 S3_PORT=9000 \
    S3_ACCESS_KEY=build-placeholder S3_SECRET_KEY=build-placeholder \
    S3_BUCKET=build-placeholder SMTP_HOST=127.0.0.1 SMTP_PORT=1025 \
    SMTP_FROM=build@localhost npm run build

# The operations image has its own minimal dependency set. It contains the
# schema and auth code needed for migrations/bootstrap, but none of the Next.js
# build output or browser-test toolchain.
FROM node:22-alpine AS ops
WORKDIR /app
ENV NODE_ENV=production
COPY ops/package.json ops/package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts
USER node
CMD ["npm", "run", "migrate"]

FROM ops AS migrate
CMD ["npm", "run", "migrate"]

FROM ops AS bootstrap
CMD ["npm", "run", "bootstrap"]

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000
USER nextjs
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
