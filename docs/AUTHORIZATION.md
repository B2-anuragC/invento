# Centralized business authorization

One User identity and the existing access/refresh token flow serve Expo (native and web) and the admin web workspace. A BusinessUser membership has exactly one BusinessRole, identified by (businessId, key). Effective permissions are that role's code-recognized permissions. OWNER is a protected, full-access ownership role. Unknown permissions and unknown roles fail closed. Business membership status is independent of account status.

## Initial matrix and migration

| Role | Default authority |
| --- | --- |
| Owner | All catalog permissions; protected ownership |
| Admin | All catalog permissions; cannot alter ownership or grant beyond current authority |
| Manager | Operational catalog, inventory, sales, purchases, reports, pricing reads and files; no role/member administration or business settings |
| Salesperson | Product/stock reads, customer creation/editing, sales creation/read, file access |
| Viewer | Operational reads; no prices, membership administration or writes |
| Member (legacy) | Existing read access, including member directory; legacy price visibility setting retained |

The additive migration seeds roles per existing business and preserves membership role strings, users, and activation state. Other legacy role strings become business-local roles with their previous read-only surface and previous purchase-price visibility; they receive no new write authority. A role that is missing from the database still has no grants. No accounts or sessions are recreated. New businesses seed roles and owner membership atomically. Default permission arrays are snapshots: future permission additions do not automatically empower existing non-owner roles.

## API contract

All business routes require existing Bearer authentication and the selected business. Access-management routes use `/businesses/:businessId/access`:

- GET `me`: effective role and permissions, available to every active member.
- GET `catalog`: code-defined permissions (roles.view).
- GET/POST `roles`: list/create business-local roles (roles.view/roles.manage).
- PATCH/DELETE `roles/:key`: configure/delete a custom or configurable default role; OWNER cannot be changed or deleted. Assigned roles cannot be deleted.
- GET/POST `members`: list all memberships including inactive / add an existing account with a role (members.view/members.invite).
- PATCH `members/:userId`: change role and/or isActive (members.update; deactivation also requires members.remove).
- GET `audit`: bounded recent business authorization events (audit.view).

Legacy `/businesses/:id/users` writes delegate to this same management service. No alternate role-writing path is allowed. Unknown permission identifiers, foreign role keys, self-role changes, self-role permission edits, and authority expansion beyond the actor's effective permissions are rejected. Managing a target also requires authority over its existing role permissions. Only an owner can assign/change OWNER. Authorization mutations take a shared account/ownership lifecycle advisory lock followed by a per-business PostgreSQL advisory lock. This deliberately serializes infrequent administration writes, including account suspension and business creation, to prevent newly added ownership from escaping suspension checks. Domain reads/writes do not take this global management lock. The last active owner counts only active memberships of active accounts, including owners of suspended businesses. Account suspension takes the same lock before checking ownership.

Permissions, memberships, account status, and business status are read from PostgreSQL on each operation. Existing JWTs carry identity/session version, not role claims. Changes affect subsequent operations immediately; admitted operations may finish. The clients refresh access on focus, business changes, and every 15 seconds, and fail closed on authorization/network errors. Native domain reads and writes also verify live effective access before using the local cache; permission changes refresh the snapshot without replaying queued writes and redact local projections. This intentionally requires connectivity for those UI operations. Existing durable outbox data is retained and replay is reauthorized. Device-local-only mode is isolated from cloud identities and cannot use centralized business access; configure EXPO_PUBLIC_LOCAL_ONLY=false and EXPO_PUBLIC_API_URL for this feature. No device-only identity is silently uploaded or converted into a server account. Access management is online only; local-only mode cannot represent centralized access. Previously downloaded data cannot be remotely erased from a disconnected device. Offline replay reauthorizes at the server; snapshots include only allowed entities.

Platform privileges are separate. The admin web client marks scoped business requests with `X-Platform-Access: business-management`. The server verifies current active platform privileges and the selected active business, and persists an audit event with the standard reason “Platform business management” before returning data. There is no reason-entry screen. The older optional `X-Platform-Access-Reason` header remains supported for integrations that supply a specific reason. Platform monitoring reads are audited as well. No platform flag is converted into a stored business membership. Business roles cannot grant platform privileges.

The catalog is `packages/shared/src/permissions.ts`. Add identifiers there, explicitly map the operation in the server guard and service, add client controls, and add enforcement tests. Cancellation and export are not cataloged because the current backend has no such operations. New handlers in protected business controllers are denied until mapped. Record IDs remain checked against the selected business by domain services.

No production migration is automatically applied. Deploy the additive SQL migration and regenerate Prisma before deploying apps/api/clients together. Existing email verification, email invitations, push notifications, and secure remote deletion of offline data are unavailable; this implementation adds existing registered accounts and does not send invitation email.

## Validation and rollout

Run `npm run build:shared`, `npm --prefix apps/api run prisma:validate`, `npm --prefix apps/api run prisma:generate`, `npm --prefix apps/api test`, apps/api/admin builds, and the frontend typecheck/lint. Meaningful PostgreSQL/HTTP and migration-preservation tests use an isolated migrated database:

```sh
npm --prefix apps/api run test:authorization:db -- --database 'postgresql://user:password@localhost:5432/invento_authorization_test'
```

The runner rejects database names without `_test` or `_review`. Tests create their own accounts/businesses and remove only their fixtures. A migration-preservation test runs the additive migration in a temporary schema inside a rolled-back transaction. The HTTP suite covers live permission changes on unchanged JWTs, membership isolation, foreign resources/roles, self-escalation, status-update deletion bypasses, price redaction, platform support audit failure, role-change audit rollback, sync filtering/replay denial, simultaneous owner demotions, and account-suspension ownership checks. No email delivery or Redis is needed by these focused authorization tests; production file processing uses BullMQ’s PostgreSQL backend and the persistent upload volume. Old queued uploads without actor identity must be resubmitted. New queued uploads recheck both account and resource authority at execution; platform jobs require their original persisted support authorization and recheck current platform access.

Deploy migration before the new backend, regenerate Prisma, and release clients with the same catalog. Old clients must reconnect for an access-bearing snapshot; clients with no permission snapshot fail closed for local staging. Older clients that retain cached data cannot be remotely erased. Do not claim offline revocation or cache erasure for disconnected old versions. A coordinated release or minimum-client-version policy is required if that is a release condition.
