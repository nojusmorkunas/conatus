FROM node:22-alpine AS build
WORKDIR /mcp
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /mcp
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /mcp/dist ./dist
EXPOSE 3001
CMD ["node", "dist/http.js"]
