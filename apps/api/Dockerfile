FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl poppler-utils && rm -rf /var/lib/apt/lists/*

# Install from the repository lockfile; each application is an npm workspace.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace @invento/api --workspace @invento/shared --include=dev

FROM deps AS build
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN npm --workspace @invento/shared run build
RUN npm --workspace @invento/api run prisma:generate && npm --workspace @invento/api run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl poppler-utils && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_API_PREFIX=api
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main"]
