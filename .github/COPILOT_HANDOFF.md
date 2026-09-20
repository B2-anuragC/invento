# Invento Copilot Handoff Context

Use this document together with `.github/copilot-instructions.md` and
`.github/DEVELOPMENT_PLAN.md` when continuing development with another Copilot
account.

## Continuation prompt

```text
You are continuing development of Invento in this repository.

Before making changes, read:
- .github/copilot-instructions.md
- .github/DEVELOPMENT_PLAN.md
- .github/PROJECT_CONTEXT.md
- .github/PROJECT_STRUCTURE.md
- .github/docs/ARCHITECTURE.md
- .github/docs/DATABASE.md
- .github/docs/DECISIONS.md
- .github/docs/REQUIREMENTS.md
- .github/docs/STATUS.md

Phase 1, Phase 2, and Phase 3 are implemented. Phase 3 Products is complete
and verified. The next phase is Phase 4 — Inventory Engine.

Do not start Phase 5 or any later phase. Before coding, inspect the current
repository, Prisma schema/migrations, authentication, business membership,
product module, tests, and Docker development setup. Follow the phase-specific
acceptance criteria and verification gate in DEVELOPMENT_PLAN.md. Update
documentation when implementation state changes. Stop after the requested
phase verification and provide the required Phase Completion Report.
```

## Repository and stack

- Monorepo root: `D:\projects\personal\invento`
- Backend: NestJS + TypeScript + Prisma + PostgreSQL
- Frontend: Expo Router / React Native
- Shared package: `@invento/shared`
- Backend layering: Controller → Service → Prisma → PostgreSQL
- Multi-tenancy: business membership must be checked before business-owned
  resource access.

## Completed phases

### Phase 1 — Backend Foundation

- NestJS application structure.
- PostgreSQL/Prisma setup.
- Global validation, response, and exception handling.
- Health endpoint.
- Swagger at `/docs`.
- Vitest unit/e2e configuration.

### Phase 2 — Authentication, Users & Business

Important files:

- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.guard.ts`
- `backend/src/auth/auth.crypto.ts`
- `backend/src/businesses/businesses.controller.ts`
- `backend/src/businesses/businesses.service.ts`
- `backend/prisma/migrations/20260920000000_phase2_auth/migration.sql`

Endpoints:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me

POST   /api/businesses
GET    /api/businesses/:id
PATCH  /api/businesses/:id
GET    /api/businesses/:id/users
POST   /api/businesses/:id/users
PATCH  /api/businesses/:id/users/:userId
DELETE /api/businesses/:id/users/:userId
```

Authentication uses scrypt password hashes, short-lived HMAC access tokens, and
database-backed single-use refresh tokens. Roles are `OWNER`, `ADMIN`, and
`MEMBER`.

### Phase 3 — Products

Important files:

- `backend/src/products/products.module.ts`
- `backend/src/products/products.controller.ts`
- `backend/src/products/products.service.ts`
- `backend/src/products/dto/product.dto.ts`
- `backend/src/products/products.service.spec.ts`
- `backend/prisma/migrations/20260920000001_phase3_products/migration.sql`
- `backend/prisma/schema.prisma`

Endpoints:

```text
POST   /api/products
GET    /api/products
GET    /api/products/search
GET    /api/products/:id
PATCH  /api/products/:id
DELETE /api/products/:id
GET    /api/products/:id/stock
GET    /api/products/:id/transactions
```

Product requests require:

```http
Authorization: Bearer <access-token>
X-Business-Id: <business-id>
```

Products have:

- business ownership
- name
- SKU
- optional barcode
- validated unit
- purchase price
- selling price
- minimum stock
- `ACTIVE`/`INACTIVE` status

SKU and barcode uniqueness are scoped per business. `DELETE` deactivates rather
than physically deleting. Product stock and transaction endpoints intentionally
return `501 Not Implemented`; those belong to Phase 4.

## Phase 4 next scope

Implement only the Inventory Engine:

```text
POST /api/inventory/opening-stock
POST /api/inventory/adjustments
GET  /api/inventory
GET  /api/inventory/:productId
GET  /api/inventory/:productId/history
```

Required transaction types include:

```text
PURCHASE
SALE
RETURN_IN
RETURN_OUT
ADJUSTMENT_IN
ADJUSTMENT_OUT
DAMAGE
EXPIRED
```

Inventory transaction history is the source of truth. Current stock is a
projection. Stock must not become negative, operations must be auditable and
atomic, and all inventory data must be business-scoped.

Do not implement suppliers, purchases, sales, dashboard, or AI during Phase 4.

## Docker development workflow

Development Compose files:

- `docker-compose.yml`
- `docker-compose.dev.yml`
- `backend/Dockerfile`
- `docs/DOCKER_DEVELOPMENT.md`

Start:

```bash
npm run docker:dev
```

View backend logs:

```bash
npm run docker:dev:logs
```

Stop:

```bash
npm run docker:dev:down
```

The backend and shared source use bind mounts. `node_modules` and PostgreSQL
data use named Docker volumes. TypeScript polling is enabled in:

- `backend/tsconfig.json`
- `packages/shared/tsconfig.json`

Polling is required because Windows Docker bind mounts may not reliably emit
native filesystem events. After changing Compose or watcher settings, recreate
the stack with `docker:dev:down` followed by `docker:dev`.

The Dockerfile generates Prisma before compiling the backend. This ordering is
required whenever the Prisma schema changes.

## Verification commands

From the repository root:

```bash
npm run build
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix backend run lint
npm --prefix backend run prisma:validate
npm --prefix backend run prisma:migrate:deploy
```

Docker must be running for migration deployment and live container verification.

## Current verification state

Before handoff:

- Phase 3 migration applied successfully to the configured PostgreSQL database.
- Full repository build passed.
- Backend tests passed.
- Backend lint passed.
- Prisma validation passed.
- Docker Compose development stack was recreated successfully.
- Product routes appeared in container logs.
- A host source edit updated compiled output inside the backend container.

## Important known considerations

- Phase 2 has known technical debt around missing HTTP-level auth/tenant
  integration coverage, refresh rotation atomicity, and generic Prisma error
  mapping. Do not silently expand scope unless the requested phase requires it.
- Product APIs currently use `X-Business-Id` as the business context.
- Product stock/history routes are explicit Phase 4 boundaries.
- Do not add inventory fields or stock mutation logic to Product services.
- Do not commit secrets. Development JWT values are only in the Compose
  development override.
- Inspect `git status` before editing because the working tree may contain
  uncommitted implementation and generated-file changes.
