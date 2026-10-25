# Invento shop and platform administration

A separate React/Vite/TypeScript workspace, using the existing NestJS backend and PostgreSQL database. No Redis, extra backend, or queue is required.

## Local setup

From the repository root:

```sh
npm install
npm run build:shared
npm --prefix backend run prisma:generate
```

Configure `backend/.env` using its example. Apply the additive migration to your **local development database**:

```sh
npm --prefix backend run prisma:migrate:deploy
```

Use an existing Invento account. Every active business member can sign in directly; assigned permissions determine their workspace. No platform grant is needed. Platform operators can grant global access using the command below. Run these in separate terminals:

```sh
npm run start:backend
npm run start:admin
```

Open http://127.0.0.1:5174. Vite forwards `/api` to `http://127.0.0.1:3000`. `VITE_API_URL` can override the API location (see `.env.example`). The backend prefix must match that URL.

## Shop owners and platform administrators

The same login supports permission-scoped business workspaces and separate platform administration. See [the authorization model, role matrix, migration, API contracts, and rollout](../docs/AUTHORIZATION.md).

Business members see their active businesses and only permitted features. After selecting a business, the **Team** and **Roles** sections use the same centralized APIs as mobile's **Users & permissions** screen. Default and custom roles, activation/deactivation, granular permissions, and recent access history are managed there. Owners are protected; business roles never confer platform privileges.

Platform operators retain global monitoring and restriction controls. Selecting a business opens its management workspace directly, with Roles and Team inside it. Platform access is authorized on every request and recorded automatically; no entry reason form is shown. Account suspension is rejected while it would leave an active business without an active owner.

## Grant the first platform administrator

Only a trusted operator with database access can run this command. Use an existing active account; the script never creates accounts or passwords. From `backend/`, with the correct environment file:

```sh
node --env-file=.env scripts/grant-platform-admin.mjs operator@example.com 'Initial platform administrator setup'
```

The command grants `isPlatformAdmin` and records an audit event in one database transaction. It is also usable for subsequent administrators. The actor is recorded as `operator:<OS user>`; this identifies the operator context rather than an authenticated web administrator. No public API grants platform privileges. Business OWNER/ADMIN membership never grants them.

## Access and restriction policy

- Platform endpoints use the existing access-token guard followed by a separate platform-admin guard. The administrator flag is checked in PostgreSQL on each request.
- All normal domain services use `requireBusinessMembership` to verify active membership and an active business, or explicitly authorized, audited platform support for an active business. No client business ID is trusted by itself. Business-specific financial/product/inventory queries retain their existing tenant scoping and related-record validation.
- Business suspension blocks subsequent business API reads and writes for every member. Login and account-level APIs remain available; users can access other active businesses. The business disappears from the normal business picker. Platform administrators retain explicit monitoring/reactivation access.
- Suspension is checked at request/service admission. It does not cancel requests already admitted, roll back completed writes, or remotely erase cached device data. Reactivation restores normal business API admission. This checkout has no background workers or offline sync API; future workers/sync must call the same restriction policy before executing business work. BullMQ, if needed later, must use PostgreSQL, not Redis.
- User disablement blocks login, refresh, and subsequent authenticated requests. It increments `sessionVersion` and revokes all refresh tokens. Reactivation does not restore old sessions: a fresh login is required.
- Explicit session revocation increments the same version and revokes refresh tokens. Access and refresh token versions are checked server-side; existing tokens fail immediately on subsequent authentication checks. Tokens issued before this migration are treated as version zero, preserving existing mobile sessions until revoked/expired.
- Refresh rotation locks the user row and checks current account/version state inside the transaction. Management actions lock that same user row to serialize refresh against revocation/disablement.
- Management actions require a boolean confirmation and a trimmed 5–500 character reason. Status changes and audit events commit atomically. A PostgreSQL advisory transaction lock serializes platform management and bootstrap grants, protecting the last-active-admin check. There is no deletion, impersonation, platform-role editing, financial editing, or audit editing API.
- Requests already authenticated can finish after revocation/disablement. No policy can retroactively revoke data already returned.

The UI stores tokens only in memory and supports refresh while the page remains open. Reload requires login. Sign-out revokes the current refresh token and clears browser memory; it does not invalidate its previously issued access token. Use the explicit revoke-sessions action to invalidate all issued tokens. Session views list unexpired/unrevoked refresh-token records, not device identities. Refresh rotation creates a replacement record.

## Schema and metrics

Migration `20261024000000_platform_admin` adds administrator/version fields, nullable login/activity timestamps, and an indexed audit table. Defaults preserve existing accounts and memberships. No tenant backfill, fabricated IDs, destructive SQL, or new database is involved. Existing users are not platform administrators until explicitly granted access. Existing domain services enforce tenant relationships; the database still uses its original single-ID foreign keys rather than composite tenant foreign keys, so direct SQL must preserve those boundaries. Login/activity history remains null until new events occur; there is no historical backfill.

Overview aggregates use database counts. Active/suspended businesses use `Business.isActive`. User/product totals include inactive records. Login-today counts unique users whose last successful password login is since 00:00 UTC; registration and refresh are excluded. Activity means successful token authentication for an API request, including requests subsequently rejected by domain authorization, with database timestamp writes throttled to once per five minutes. Recent activity uses rolling 7/30-day windows and is never described as online presence.

Sales/purchase counts include COMPLETED transactions only, using `saleDate`/`purchaseDate`, from inclusive to exclusive. Default period is the preceding 30 days; custom periods are limited to 366 days. All platform metric boundaries are UTC and labeled in the UI. Business dashboard India-time behavior is unchanged. Aggregate counts are current observations, not a single transactionally consistent snapshot under concurrent writes.

Membership counts include inactive memberships. Business lists show up to five active OWNER memberships; there is no single owner field. Business-wide recent-activity history is unavailable and is labeled accordingly. Read-only detail tabs and audit logs use bounded pagination (1–100 rows) with stable ordering. User responses explicitly select public monitoring fields and exclude password hashes, token hashes, and session versions.

Audit records intentionally have no cascading target foreign keys so their identity/value history can survive future retention/deletion workflows. Access through the admin API is read-only; database operators retain ordinary database privileges. Store only targeted status values and reasons, never credentials or complete request payloads.

## Build, deployment, and verification

```sh
npm run build:admin
npm --prefix backend run lint
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
```

Serve `admin/dist` using your existing hosting infrastructure, over HTTPS, with `/api` routed to the existing backend. Hash navigation requires no SPA rewrite. `VITE_API_URL`, when supplied, is a public build-time setting, never a secret. Production migrations belong in your normal reviewed deployment process; none are automatically run by this web app.

Database integration tests opt in and must use an isolated, migrated test database:

```sh
RUN_DATABASE_TESTS=1 NODE_ENV=test DATABASE_URL='<test-postgres-url>' \
  JWT_ACCESS_SECRET='<test-secret-at-least-32-characters>' \
  JWT_REFRESH_SECRET='<different-test-secret-at-least-32-characters>' \
  npm --prefix backend run test:e2e
```

The tests create and remove their own fixtures. Database suites run sequentially because dashboard assertions inspect platform-wide totals. Coverage includes unauthenticated/business-user denial, public privilege-injection rejection, cross-business access and relationships, suspension, disablement, access/refresh revocation, confirmation validation, last-admin protection under concurrency, audit rollback, pagination, and aggregate calculations.

Known limits: existing authentication has no MFA, account recovery, or login rate limiting. This feature reuses that authentication; it does not claim to add those capabilities. Browser visual QA depends on an available connected browser. OCR/job monitoring, safe retries, subscriptions, usage limits, exports, and support roles remain outside this version.
