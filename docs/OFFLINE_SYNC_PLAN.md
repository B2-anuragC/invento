# Offline operation and synchronization plan

Status: native catalog and transaction milestones implemented (transaction update: 16 October 2026). Prepared 10 October 2026 against the current Expo frontend and NestJS/Prisma backend. Final milestone checks resumed on 11 October 2026; the running backend health endpoint returns HTTP 200.

## Implementation progress

The first Android/iOS milestone now provides:

- SQLite-backed durable business snapshots and an atomic outbox.
- Offline catalog and customer/supplier reads, creation and updates, plus product deactivation and opening stock.
- Cached sales/purchase receipts and history, inventory activity, pricing permissions and a locally calculated overview. These reflect downloaded server records plus pending catalog/stock changes.
- Offline session reopening for a previously downloaded business.
- Automatic sync on launch/foreground, connection recovery and a 30-second foreground timer, with manual Sync now.
- Server-side atomic deduplication, stable client-created IDs, and revision checks on catalog/contact updates, including changes made through existing REST endpoints.
- Pending/conflict feedback and a Device sync status page available through the banner and Profile.

First use still requires an online business download. The local development migration is applied and the backend is rebuilt/restarted after verification. Custom native builds need rebuilding for SQLite/crypto/connectivity dependencies.

This milestone deliberately uses a complete repeatable-read snapshot and one atomic SQLite state document per account/business. It does not yet implement the planned paginated change feed or normalized indexed local tables; those remain necessary for larger datasets. The downloaded inventory activity contains the latest 100 movements, rather than all historical movements.

Sales (including Quick bill) and purchases now save locally with their initial payment details. The SQLite outbox and stock reservation commit atomically. Related catalog, contact and opening-stock commands synchronize first. Each transaction uses a stable request ID against the existing idempotent REST endpoint. A fresh server snapshot replaces provisional stock and receipts atomically; it also reconciles a lost acknowledgement without posting or projecting the transaction twice. Outbox storage version 1 upgrades to version 2; older clients refuse version 2 rather than misreading transaction commands.

Receipts/history distinguish pending synchronization and conflicts from confirmed invoices. GST, stock units and selling-option settings are checked before upload, and the server rejects a changed expected total before recording the transaction. Device sync offers an explicit recalculation preview and approval before retrying changed settings, retaining the original request identity. A partial payment above a revised total needs manual reconciliation. Additional payments on existing receipts and stock adjustments remain online operations.

Unfinished Quick bills have a separate per-account/business draft slot and resume after reopening. Activity links to that draft without replacing the original sales workflow draft. Locally saved pending bills are excluded from unsaved drafts. Sharing a pending receipt and recording additional payments against its provisional ID are disabled until confirmation.

Still to implement: additional payment/adjustment commands, complete conflict-resolution actions (including correcting quantities or partial payments), background worker leasing, offline authorization validity policy, recovery/export tools, large-data paging, offline web storage/asset caching. Web continues using the existing online APIs.

The original milestone verified 135 unit tests, 21 PostgreSQL integration tests and Android/iOS JavaScript exports. The 16 October transaction update passes 189 unit tests, backend/frontend type checks, frontend lint and backend compilation; Android and web exports are checked separately. JavaScript bundle exports are not native app binary builds.

Verification covers restart recovery from persisted state, stable retry IDs after lost responses, local storage failure, dependency blocking, tenant isolation, duplicate server uploads, revisions and restricted-price snapshots. Native airplane-mode visual/end-to-end verification remains outstanding.

## Intended behavior

After signing in and downloading a business once, users can reopen the installed app without a connection and perform normal shop operations. Catalog, contacts, transactions, balances and stock are read from a local database. Saves commit locally immediately and synchronize automatically when the API becomes reachable.

Local success means durably saved on this device. Server confirmation is a separate state. Network failures do not become blocking screen errors; invalid input and actual synchronization conflicts still need visible feedback.

## Current gaps

- `frontend/services/api.ts` exposes direct HTTP reads/writes to screens. There is no replicated business database or operation queue.
- `frontend/app/index.tsx` restores credentials but requires `fetchBusinesses()` before entering the app.
- AsyncStorage currently retains form drafts only. It is not an inventory/accounting database.
- Sales, purchases and payments have retry identifiers, but catalog/contact/inventory mutations do not have a uniform idempotency protocol.
- The backend calculates GST and selling-option prices from current product configuration. Offline receipts must instead retain the agreed configuration at the time of the local sale.
- Server authorization and purchase-price visibility must remain effective in sync responses and local storage.

## Storage and data access

Use `expo-sqlite` on Android/iOS, with database migrations, transactions and foreign keys. Keep credentials in SecureStore. Use a repository layer between screens and storage so screens use the same read/write functions online and offline. HTTP becomes a synchronization transport.

Proposed modules:

- `frontend/services/local-db/`: schema, migrations, transactional access and subscriptions.
- `frontend/services/repositories/`: catalog, customers, suppliers, inventory, sales, purchases, payments and dashboard queries.
- `frontend/services/sync/`: outbox, transport, reconciliation, connectivity and retry scheduling.
- `frontend/components/sync-status.tsx`: offline/pending/syncing/action-needed feedback.
- `backend/src/sync/`: bootstrap, change-feed and mutation endpoints.
- `packages/shared/`: command schemas, decimal calculations and validation rules used by both sides.

Store products and selling options, customers, suppliers, transactions and items, payments, stock movements, confirmed inventory, permitted settings, drafts, outbox entries, server revisions and sync cursors. Partition storage and queries by account and business; never synchronize one account's queue under another account's credentials.

Use decimal strings with decimal arithmetic or explicit scaled integers, rather than floating-point money calculations. Preserve the existing quantity precision, group-to-piece conversion, GST rounding and price restrictions.

## Local writes

Each save performs one local database transaction:

1. Validate input and cached permissions.
2. Allocate cryptographically random stable entity and operation identifiers.
3. Write the entity, item/tax/unit snapshots, stock movements and payment records.
4. Add the corresponding immutable command to the outbox.
5. Commit, notify subscribed screens and show the saved local receipt.

If storage fails, show a real save error. Never claim success before the transaction commits. A sale or purchase must update its local stock and accounting projection atomically with its queue entry.

Prefer backend support for client-assigned UUIDs on new entities, while retaining existing server IDs. Validate identifiers and tenant ownership; globally unique IDs are not authorization. This allows a customer/product created offline to be referenced by an offline sale without later rewriting all relations.

Outbox fields include operation ID, business/user/device identity, entity ID, command type, payload version, base server revision, dependency IDs, local sequence, state, attempts and next retry time. States: pending, sending, synced, retryable failure, needs sign-in, conflict and blocked dependency. A crashed sending operation returns to retryable state with its original identity.

## Server protocol

Add three conceptual endpoints:

- `GET /sync/bootstrap`: paginated, permission-filtered consistent initial snapshot plus a change cursor.
- `POST /sync/push`: bounded batches of commands with individual accepted/duplicate/conflict/rejected results.
- `GET /sync/pull?cursor=...`: paginated committed changes, including inactive/deleted-record markers and permission updates.

All writers, including existing REST endpoints, must emit change events in the same transaction as the domain mutation. Use a commit-safe cursor strategy: naive timestamps or sequence allocation before commit can skip concurrent changes. Snapshot pagination must have a consistent watermark. Expired cursors trigger a safe rebootstrap while retaining unacknowledged local commands.

Add a durable processed-operation table with a tenant-scoped unique operation ID, payload hash and recorded result. The domain mutation and deduplication result commit together. Repeating an identical command returns its recorded result; reusing its ID for different content is a conflict. Cover every mutation, including opening stock and adjustments. Retain deduplication records for the supported offline/retry lifetime.

Reuse the existing inventory engine and locked payment validation. Do not create a parallel sync path that bypasses authorization or business rules. Successful commands return canonical entities/revisions and affected inventory/accounting records.

## Sync lifecycle

1. On first online sign-in, download authorized business data and mark the snapshot usable only after completion.
2. Thereafter, open from local data immediately; attempt refresh/sync independently.
3. Trigger sync on app launch, foreground, connectivity recovery, new queued work and manual Sync now.
4. Check actual API reachability; Wi-Fi connectivity alone does not establish backend availability.
5. Refresh authentication, pull changes, rebase local projections, push ready commands in dependency order, and pull/reconcile again.
6. Persist each acknowledgement and cursor atomically with the corresponding data updates.

Dependencies matter more than a fixed entity-type order: product creation → opening stock → purchase/sale; contact creation → transaction; transaction → payment. Preserve per-entity command order, and block only dependent operations when one command fails. Allow independent work to continue.

Retry timeouts, lost responses, rate limits and transient server failures with backoff and jitter; reuse the original command IDs. Validation failures and conflicts are not retried endlessly. Serialize foreground/background workers with a recoverable lease. Background sync is best effort; foreground/relaunch sync provides the reliable recovery path.

Store confirmed server state separately from pending local operations. Displayed stock and balances are confirmed values plus unacknowledged effects. When a command is acknowledged, remove its pending effect and replace confirmed state atomically to prevent double-counting.

## Conflict rules

| Case | Proposed behavior |
| --- | --- |
| Different fields edited on the same contact/product | Three-way field merge when safe; otherwise ask which value to retain. Use revisions, not device clocks. |
| Same field changed on two devices | Mark needs review; show local and server values. Do not silently overwrite. |
| Duplicate SKU/barcode | Preserve the local product and dependent work; offer correcting the identifier or mapping to the existing product. |
| GST, selling options or group size changed | Preserve the local receipt's price/tax/unit snapshots. Validate against retained product revisions; do not silently reprice on upload. Unsupported/deactivated configurations need review. |
| Two devices record opening stock | Accept one initialization; preserve the other as a conflict for explicit correction. Never silently turn it into an adjustment. |
| Concurrent payments exceed the balance | Preserve the local payment evidence and flag for reconciliation. Do not silently truncate or delete an actual recorded payment. |
| Permissions revoked while offline | Recheck at synchronization. Stop affected uploads and hide/purge newly restricted cached fields on reconnection; retain a recoverable audit of unsynced work. |
| Deletion/inactivation with pending dependents | Propagate tombstones, preserve local commands, and require resolution rather than dropping dependent transactions. |

### Stock policy decision

Recommended default: validate sales against the device's local stock; mark offline transactions as locally saved pending synchronization. The server still enforces nonnegative confirmed stock. If another device consumed that stock, preserve the offline sale and show an actionable conflict. A rejected stock mutation is not proof that a physical sale did not happen, so resolution must reconcile the real transaction and stock rather than silently discard it.

For guaranteed conflict-free offline sales across several devices, implement server-issued per-device stock allocations; offline devices may sell only their allocated quantities. This restricts offline selling but prevents competing claims to the same stock. The alternative is an explicit business policy accepting negative stock, which changes the current inventory rules. Unrestricted offline selling, unrestricted multi-device use and a guaranteed nonnegative shared balance cannot all be promised simultaneously.

## UX and authentication

- Show a small Offline banner, pending count and last-sync time; keep regular screens usable.
- Receipt labels distinguish Saved on device, Syncing, Synced and Needs attention. Offline receipts have stable local references; preserve references if server invoice numbers are assigned later.
- Activity includes locally completed transactions separately from editable drafts. Dashboard/contact totals include pending local effects with a pending indicator.
- Provide a Sync status page for conflicts, retries and diagnostics. Keep normal offline work free of network error dialogs.
- Allow offline reopening only for a previously authenticated account with downloaded authorized data. Token expiry alone must not erase local data; pause uploads until refresh/reauthentication succeeds.
- Initial login/register, password recovery, new membership verification and security/access changes require server connectivity. Business creation can be staged locally if needed, but cannot claim server registration or verified membership until accepted.
- Do not cache fields the current role is forbidden to see. A disconnected device cannot learn that its permissions were just revoked; define an offline authorization validity window.
- Logout/account switching must stop the old sync worker and protect pending work. Offer synchronization/export before destructive local reset; never silently wipe unsynced records.
- Validate protection of customer/financial data at rest and app access. Device storage loss/uninstallation can lose unsynced data; design a recovery/export option.

## Platforms

Use an installed release/development build with its JavaScript bundle packaged locally for meaningful offline startup; relying on a disconnected Metro server is not a valid offline test.

Native Android/iOS is the first implementation target. Preserve web builds behind the same repository interface. If offline browser use is required, add an IndexedDB-backed adapter and service-worker asset caching/update strategy so a browser can start offline too. Expo SQLite web support is currently alpha and requires additional WASM/hosting configuration, so web needs its own deliberate validation.

## Delivery sequence

1. Agree stock-conflict policy, native/web scope and offline authorization window. Write the command/versioning contract.
2. Implement backend idempotency, revisions, retained product configurations, bootstrap and committed change feed.
3. Add the local database, repositories, initial snapshot and offline session restoration. Verify offline reading and restart recovery.
4. Move catalog/contact mutations and inventory operations to local transactions plus outbox. Implement dependency processing and reconcile conflicts.
5. Move sales, purchases and payments to local accounting/stock transactions and snapshot-preserving synchronization.
6. Switch all lists, details, categories, search, dashboard, receipts and permitted settings to local queries. Integrate existing drafts.
7. Add sync-status/conflict UX, recovery tools, migration handling and platform packaging. Roll out behind a feature flag after end-to-end tests.

Read-only caching is a milestone, not completion of the requested offline workflow. Full delivery includes all normal shop writes and their synchronization.

## Acceptance tests

- Download a business, enable airplane mode, restart the app and browse all downloaded screens without API failure dialogs.
- Offline: create a product/customer/supplier, record opening stock, purchase and sell decimal/group quantities, edit products, record payments, and verify stock, tax and balances immediately.
- Force-close during saves and sync; recover queued operations and preserve transactional local state.
- Reconnect and verify each operation changes server data exactly once, including when the response is lost after server commit.
- Verify a second device receives the results, deletions and permission changes through pull sync.
- Test conflicting product edits, duplicate SKUs, competing sales, competing opening stock and payment overrun with actionable preserved records.
- Test changed GST/selling options during offline work: receipt values must remain stable or require explicit resolution.
- Test expired tokens, revoked memberships, account/business switching and restricted purchase-price caches.
- Test interrupted bootstrap, stale cursors, database migrations, storage failures, large queues and long offline intervals.

References: [Expo local-first architecture](https://docs.expo.dev/guides/local-first/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo NetInfo](https://docs.expo.dev/versions/latest/sdk/netinfo/).
