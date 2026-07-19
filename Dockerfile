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

# Migrations run from the build stage: it still has drizzle-kit and the
# migration SQL, which the standalone runtime image deliberately lacks.
FROM build AS migrate
CMD ["npx", "drizzle-kit", "migrate"]

FROM build AS bootstrap
CMD ["npm", "run", "bootstrap-admin"]

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
