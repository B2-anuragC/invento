FROM node:24-bookworm-slim AS deps

WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
COPY packages/shared/package*.json ./packages/shared/

WORKDIR /app/backend
RUN npm install --include=dev

WORKDIR /app/packages/shared
RUN npm install --include=dev

FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/backend ./backend
COPY --from=deps /app/packages/shared ./packages/shared
COPY backend ./backend
COPY packages/shared ./packages/shared

WORKDIR /app/packages/shared
RUN npm run build

WORKDIR /app/backend
RUN npm run build && npx prisma generate --schema=./prisma/schema.prisma

FROM node:24-bookworm-slim AS runner

WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_API_PREFIX=api

COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/backend ./backend

WORKDIR /app/backend

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main"]
