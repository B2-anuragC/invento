# Invento handoff - Phase 6

Phases 1-6 are committed through `abb195e` (Phase 6). Focused database,
authentication, inventory-validation and documentation fixes are uncommitted;
inspect git status before editing. Do not begin Phase 7 (Dashboard) without
explicit user instruction.

Read copilot-instructions.md, PROJECT_CONTEXT.md, DEVELOPMENT_PLAN.md and the
relevant docs before changing code. Existing implementation is authoritative.

## Phase 6 implementation

- `backend/src/customers/`: customer CRUD, active/inactive lifecycle, search,
  active membership and OWNER/ADMIN write authorization.
- `backend/src/sales/`: create/list/detail and metadata-only PATCH; required
  customer, sale date, payment method and positive unique product lines.
- Phase 6 migration `20260920085540` is restored from Git; `20260920120000`
  reconciles it with the current Customer/Sale/SaleItem schema.
- Sale totals use Decimal with half-up cent rounding per line before summation.
- Stock changes exclusively use InventoryService.applyMovement(input, tx).
  The inventory engine locks/checks stock before each item insert; all writes
  share the sale transaction. Insufficient stock rolls back everything.
- Sale line items and financial fields are immutable; see ADR-011.

## Verification

Unit tests include snapshot/restore rollback using the real InventoryService.
`backend/test/sales.e2e-spec.ts` adds opt-in PostgreSQL HTTP tests for the stock
sequence, rollback on item two, concurrent oversell, lifecycle, tenant/role
isolation, validation and immutable sale items.

Standard checks:

```sh
npm run build
npm --prefix backend test
npm --prefix backend run lint
npm --prefix backend run prisma:validate
npm --prefix backend run test:e2e
```

The PostgreSQL sales suite requires RUN_DATABASE_TESTS=1 and a migrated database.
Without opt-in it is skipped. For the isolated database already created locally:

```sh
docker exec invento-backend node test/run-phase6-verification.mjs
```

The runner uses container credentials, substitutes the database name with
`invento_phase6_verify`, applies migrations and runs the full e2e suite. Tests
remove their own fixtures; the verification database/schema is retained.
Regenerate the container Prisma client after schema edits.

## Database reconciliation (resolved)

Recovered `20260920085540_phase6_customers_sales` from Git with its exact
original checksum. The newer migration now applies only the schema differences
in one transaction. It was successfully applied to invento_dev without resetting
or deleting application data, and Prisma reports no schema difference. The
empty verification database was rebuilt to test the complete migration chain.
The newer migration originally applied only to that disposable verification DB;
any other copy with the old migration checksum must be reconciled before reuse.
A pre-change backup is at /tmp/invento_before_phase6_reconciliation.sql inside
the invento-postgres container.

## Focused hardening

Refresh tokens are conditionally consumed and replaced in one transaction;
concurrent reuse returns 401. Replacement failures roll back consumption.
Inventory methods validate finite, positive quantities and database precision/
range before writes; opening stock still permits zero.

## Boundaries and known debt

Frontend business screens and Phase 7+ are not implemented. Existing Phase 2
technical debt includes remaining HTTP auth coverage gaps and generic Prisma
error mapping. Refresh rotation atomicity is now fixed and concurrency-tested. Keep unrelated changes outside the phase scope.

Final verification: 86/86 unit tests, 8/8 end-to-end tests, backend build and
lint passed. The development database matches Prisma with no schema diff.
The full monorepo build passed during Phase 6 implementation.
