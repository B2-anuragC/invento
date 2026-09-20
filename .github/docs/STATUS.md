# Invento — Current Status

## Current Phase

**Phase 6 - Customers & Sales (completed and verified)**

The repository foundation is already created as an npm-workspaces monorepo
with:

- NestJS backend
- Expo Router frontend
- `@invento/shared` package

## Current Priority

Build the backend core before major mobile UI development.

## Priority Order

1. Database
2. Authentication
3. Business/User
4. Products (completed)
5. Inventory (completed)
6. Suppliers (completed)
7. Purchases (completed)
8. Sales (completed)
9. Customers (completed)
10. Dashboard
11. Tests
12. API documentation

## Not Current Priority

- AI bill scanner
- Voice input
- Advanced business intelligence
- Custom handwriting models
- Complex ERP/accounting features

## First Backend Milestone

The backend should support this complete flow:

```text
User
 ↓
Business
 ↓
Product
 ↓
Opening Stock
 ↓
Purchase
 ↓
Inventory Increase
 ↓
Sale
 ↓
Inventory Decrease
 ↓
Transaction History
 ↓
Dashboard
```

## Definition of First Milestone

Example:

```text
Create Rice
    ↓
Opening stock: 100 KG
    ↓
Purchase: +50 KG
    ↓
Stock: 150 KG
    ↓
Sale: -20 KG
    ↓
Stock: 130 KG
```

The backend must correctly preserve the transaction history and current stock.

## How to Update This File

Update this document when the actual implementation state changes.

Keep it factual and concise.

Use it to answer:

- What is already implemented?
- What is currently being worked on?
- What is next?
- What important issues/blockers exist?

## Phase 4 — Inventory Engine Implementation Notes

Implemented `Inventory` (current-stock projection) and `InventoryTransaction`
(immutable ledger) models, plus `InventoryTransactionType` enum
(`OPENING_STOCK, PURCHASE, SALE, RETURN_IN, RETURN_OUT, ADJUSTMENT_IN,
ADJUSTMENT_OUT, DAMAGE, EXPIRED`).

Endpoints (`backend/src/inventory/`):

```text
POST /api/inventory/opening-stock
POST /api/inventory/adjustments
GET  /api/inventory
GET  /api/inventory/:productId
GET  /api/inventory/:productId/history
```

`GET /api/products/:id/stock` and `GET /api/products/:id/transactions` now
delegate into the inventory module instead of returning `501`.

Every stock mutation runs inside a Prisma interactive transaction: the current
`Inventory` row is row-locked (`SELECT ... FOR UPDATE`), the new balance is
computed, negative balances are rejected before any write, and the ledger
entry plus projection update commit together. Opening stock may be recorded
once per product; a second attempt is rejected as a conflict rather than
silently overwriting history. `PURCHASE`/`SALE` transaction types exist in the
enum for later phases but are not triggered by any Phase 4 endpoint.

Verified: mandatory sequence `100 + 50 - 20 - 5 = 125` (unit test and live
smoke test), insufficient-stock rejection with no partial writes, tenant
isolation, and role-based authorization (read = any active member, write =
OWNER/ADMIN).

### Transaction composability refactor

`InventoryService.applyMovement()` and `InventoryService.recordOpeningStock()`
now accept an optional `Prisma.TransactionClient` so future Purchase/Sale
services can compose their own atomic transaction (Purchase/Sale + items +
inventory movement) by passing their transaction client through instead of
each inventory mutation opening its own nested `$transaction`. Existing
`/inventory/*` and `/products/:id/stock|transactions` endpoints are
unaffected — they call these methods without a transaction client and get
identical standalone behavior to before. Inflow/outflow direction for each
`InventoryTransactionType` was extracted to
`backend/src/inventory/inventory.movement-types.ts::isInflowTransaction` as
the single shared source of truth, so no future service duplicates that
determination. See `.github/docs/DATABASE.md` for details.

## Phase 5 — Suppliers & Purchases Implementation Notes

Implemented `Supplier`, `Purchase`, and `PurchaseItem` models plus
`SupplierStatus` (`ACTIVE`/`INACTIVE`) and `PurchaseStatus`
(`DRAFT`/`COMPLETED`/`CANCELLED`) enums.

Endpoints:

```text
POST   /api/suppliers
GET    /api/suppliers
GET    /api/suppliers/:id
PATCH  /api/suppliers/:id
DELETE /api/suppliers/:id      (deactivates; does not delete)

POST   /api/purchases
GET    /api/purchases
GET    /api/purchases/:id
PATCH  /api/purchases/:id      (metadata only — see ADR-010)
```

`PurchasesService.create()` validates the supplier (belongs to the business,
`ACTIVE`), every product (belongs to the business, `ACTIVE`), rejects
non-positive quantities/prices and duplicate products within one purchase,
and computes `lineTotal`/`total` server-side — client-supplied totals are
never trusted. The whole operation (`Purchase` + `PurchaseItem`s + one
`InventoryTransaction` per line item + the `Inventory` projection update)
runs inside a single `prisma.$transaction`, calling
`InventoryService.applyMovement(input, tx)` for each item so the Inventory
Engine remains the only place that locks rows, validates non-negative stock,
or writes ledger/projection changes — `PurchaseService` never touches
`Inventory`/`InventoryTransaction` directly. If any step fails (invalid
product, insufficient handling, DB error), the entire transaction rolls
back: no `Purchase`, `PurchaseItem`, or inventory change persists.

Verified: purchase creation with single/multiple items, correct totals,
correct `PurchaseItem` rows, inventory increasing correctly with a `PURCHASE`
inventory transaction, supplier/product/quantity/price validation, duplicate
product rejection, tenant isolation, manager-only authorization, and full
rollback when an inventory operation fails mid-transaction — via unit tests
and a live end-to-end Docker smoke test (register → business → product →
opening stock → supplier → purchase → verify stock/ledger/tenant isolation).


## Phase 6 - Customers & Sales

Implemented customer CRUD with ACTIVE/INACTIVE lifecycle and sales create/list/
detail/metadata-update APIs under `/api/customers` and `/api/sales`. Reads require
active business membership; writes require OWNER/ADMIN. Customers and products
must be active and belong to the selected business when creating a sale.

Sales require `customerId`, `saleDate`, `paymentMethod` and positive item
`quantity`/`sellingPrice` decimal strings. Supported payment methods are CASH,
UPI, CARD, BANK_TRANSFER and OTHER. Totals are computed server-side from rounded
line totals. Sale items, customer, payment method, total and status are immutable;
PATCH accepts only invoiceNumber, saleDate and note (ADR-011).

A single transaction creates the sale and calls InventoryService.applyMovement
with SALE and the outer transaction client before inserting each item. Stock
checks and locks remain in the inventory engine. Any failure rolls back all sale,
item, ledger and projection changes. Product IDs are processed in stable order.

Verification includes unit tests, HTTP/PostgreSQL rollback and concurrent oversell
tests, tenant/role checks, customer lifecycle, metadata-only PATCH, and the
mandatory stock sequence 100 + 50 - 20 = 130 with oversell rejected.

### Database reconciliation and focused hardening

Recovered the original `20260920085540_phase6_customers_sales` migration from
Git history and verified its checksum against the development database. The
newer `20260920120000_phase6_customers_sales` migration now applies only the
schema differences in one transaction: customer contactName, required sale
customerId, and the supported PaymentMethod values. No sales existed in the
legacy database; existing application records were preserved. Both invento_dev
and a fresh migration replay now match schema.prisma; the mismatch is resolved.
The empty invento_phase6_verify database was rebuilt with the reconciled chain.

Refresh-token rotation now conditionally consumes an unrevoked/unexpired token
and creates its replacement in the same transaction. Concurrent reuse is
rejected; replacement failures roll back consumption. Inventory's internal
movement/opening-stock APIs now reject non-finite, negative, overprecision and
out-of-range quantities, with zero allowed only for opening stock.

Final verification: 86/86 backend unit tests, 8/8 end-to-end tests (including
PostgreSQL concurrent refresh and sales tests), backend build and lint passed.
Prisma reports no schema difference for invento_dev. The earlier full monorepo
build passed. Phase 6 is committed as abb195e; these fixes are uncommitted.
Phase 7 has not been started.
