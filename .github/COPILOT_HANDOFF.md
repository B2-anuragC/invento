# Invento handoff ? Phase 6

Phases 1?5 are committed through `7d886dc` (Phase 5). Phase 6 Customers & Sales
is implemented in the working tree; inspect git status before editing. Do not
begin Phase 7 (Dashboard) without explicit user instruction.

Read copilot-instructions.md, PROJECT_CONTEXT.md, DEVELOPMENT_PLAN.md and the
relevant docs before changing code. Existing implementation is authoritative.

## Phase 6 implementation

- `backend/src/customers/`: customer CRUD, active/inactive lifecycle, search,
  active membership and OWNER/ADMIN write authorization.
- `backend/src/sales/`: create/list/detail and metadata-only PATCH; required
  customer, sale date, payment method and positive unique product lines.
- `backend/prisma/migrations/20260920120000_phase6_customers_sales/`: Customer,
  Sale, SaleItem and enums with restricted historical customer/product references.
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

## Existing development database mismatch

`invento_dev` already has `20260920085540_phase6_customers_sales`, absent from
this checkout. Its customer lacks contactName, sale customerId is nullable and
PaymentMethod additionally allows CREDIT. The new migration cannot be applied
over it as-is. Its failed attempt was marked rolled back; existing data/schema
were preserved. Reconcile the earlier migration before running this checkout's
customer/sales APIs on that database. Do not reset it or mark mismatching
migrations applied. Fresh migrations and tests passed in `invento_phase6_verify`.

## Boundaries and known debt

Frontend business screens and Phase 7+ are not implemented. Existing Phase 2
technical debt includes HTTP auth coverage gaps, refresh rotation atomicity and
generic Prisma error mapping. Keep unrelated changes outside the phase scope.

Final verification: 76/76 backend unit tests, 7/7 end-to-end tests (including
6 PostgreSQL sales tests), backend lint, Prisma validation and full monorepo
build passed. Phase 6 changes are uncommitted.
