# Invento — Database Design Principles

## Database

PostgreSQL is the primary database.

Prisma is the ORM.

## Core Entities

```text
Business
User
BusinessUser
RefreshToken
Product

Product
ProductAlias

Supplier
Customer

Purchase
PurchaseItem

Sale
SaleItem

Inventory
InventoryTransaction

StockAdjustment

AIDocument
AIDocumentItem
AIProductMatch

AuditLog
```

## Multi-Tenant Rule

Business-owned records should contain `business_id`.

Examples:

- Product
- Supplier
- Customer
- Purchase
- Sale
- Inventory
- InventoryTransaction

Always enforce business ownership at the service/authorization layer.

Authentication credentials are stored as salted scrypt password hashes.
Refresh tokens are stored only as HMAC hashes, are single-use during refresh,
and can be revoked on logout.

## Inventory Source of Truth

Inventory transactions are immutable business events.

Example:

```text
Opening Stock  +100
Purchase        +50
Sale            -20
Damage           -5
Return          +10
--------------------
Current         135
```

The `inventories` table may store current stock for fast reads, but it is not
the historical source of truth.

## Transaction Types

Potential transaction types:

- PURCHASE
- SALE
- RETURN_IN
- RETURN_OUT
- ADJUSTMENT_IN
- ADJUSTMENT_OUT
- DAMAGE
- EXPIRED

The exact enum can evolve with requirements.

## Money

Use PostgreSQL `NUMERIC`, not floating point.

Suggested:

```text
NUMERIC(12,2)
```

for monetary values.

## Quantity

Use:

```text
NUMERIC(12,3)
```

because quantities may contain decimals.

Examples:

- 1.250 KG
- 2.500 L
- 3.750 M

## Historical Data

Do not physically delete records that are referenced by historical business
transactions.

Prefer deactivation for:

- Products
- Suppliers
- Customers

## JSONB

JSONB is appropriate for flexible AI data such as:

- Raw model output
- Extraction metadata
- Debug information

Important business data must remain relational.

## Atomic Business Operations

Purchases and sales should use database transactions.

For a purchase:

```text
Purchase
+ Purchase Items
+ Inventory Transactions
+ Inventory Projection
```

must commit atomically.

For a sale:

```text
Sale
+ Sale Items
+ Inventory Transactions
+ Inventory Projection
```

must commit atomically.

## Implemented: Inventory & InventoryTransaction (Phase 4)

```prisma
model Inventory {
  id         String   @id @default(cuid())
  businessId String
  productId  String   @unique
  quantity   Decimal  @db.Decimal(12, 3)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model InventoryTransaction {
  id              String                   @id @default(cuid())
  businessId      String
  productId       String
  type            InventoryTransactionType
  quantity        Decimal                  @db.Decimal(12, 3)
  balanceAfter    Decimal                  @db.Decimal(12, 3)
  note            String?
  createdByUserId String
  createdAt       DateTime                 @default(now())
}

enum InventoryTransactionType {
  OPENING_STOCK
  PURCHASE
  SALE
  RETURN_IN
  RETURN_OUT
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
  DAMAGE
  EXPIRED
}
```

`InventoryTransaction` rows are immutable and are the source of truth.
`Inventory` holds one row per product with the current quantity as a fast-read
projection. `quantity` on the transaction is signed (positive for inflow
types, negative for outflow types); `balanceAfter` records the resulting
projection value at the time of the transaction for auditability.

Every mutation (`backend/src/inventory/inventory.service.ts`) runs inside a
Prisma interactive transaction: the `Inventory` row is locked with
`SELECT ... FOR UPDATE`, the new balance is computed, and the operation is
rejected before any write if the balance would go negative. Opening stock may
only be recorded once per product (enforced by the unique `productId` index);
a second attempt is rejected as a conflict. `PURCHASE` and `SALE` are reserved
for the Purchases/Sales phases and are not written by any Phase 4 endpoint.

### Transaction composability (for Phase 5/6)

`InventoryService.applyMovement()` and `InventoryService.recordOpeningStock()`
both accept an optional `Prisma.TransactionClient` as their last argument.
When omitted, the method starts its own `$transaction` (today's standalone
behavior, used by the `/inventory/*` HTTP endpoints). When a caller passes an
existing transaction client, the row lock, negative-stock check, ledger
insert, and projection update all join that caller's transaction instead of
starting a nested one.

This lets `PurchaseService`/`SaleService` (Phase 5/6) compose
`Purchase + PurchaseItems + InventoryTransactions + Inventory projection` (or
the equivalent for a Sale) inside a single atomic `prisma.$transaction`, by
calling `inventoryService.applyMovement(input, tx)` for each line item using
the same transaction client used for the Purchase/Sale/Item writes — instead
of re-implementing stock calculation, negative-stock validation, ledger
creation, or row locking.

The inflow/outflow direction for each `InventoryTransactionType` is defined
once in `backend/src/inventory/inventory.movement-types.ts`
(`isInflowTransaction`) and is not duplicated anywhere else. Any future caller
(including Purchase/Sale services) must reuse this function rather than
re-deriving which transaction types increase vs. decrease stock.

## Future Schema Considerations

Potential future entities may include:

- Product price history
- Payment records
- Expenses
- Tax/GST structures
- Warehouses
- Purchase recommendations
- Business insights

Do not add these before the product requires them.

## Implemented: Suppliers & Purchases (Phase 5)

```prisma
model Supplier {
  id          String         @id @default(cuid())
  businessId  String
  name        String
  contactName String?
  phone       String?
  email       String?
  address     String?
  status      SupplierStatus @default(ACTIVE)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

enum SupplierStatus {
  ACTIVE
  INACTIVE
}

model Purchase {
  id              String         @id @default(cuid())
  businessId      String
  supplierId      String
  invoiceNumber   String?
  purchaseDate    DateTime
  total           Decimal        @db.Decimal(14, 2)
  status          PurchaseStatus @default(COMPLETED)
  note            String?
  createdByUserId String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
}

enum PurchaseStatus {
  DRAFT
  COMPLETED
  CANCELLED
}

model PurchaseItem {
  id            String   @id @default(cuid())
  purchaseId    String
  productId     String
  quantity      Decimal  @db.Decimal(12, 3)
  purchasePrice Decimal  @db.Decimal(12, 2)
  lineTotal     Decimal  @db.Decimal(14, 2)
  createdAt     DateTime @default(now())
}
```

Suppliers follow the same deactivation convention as Products: `DELETE
/suppliers/:id` sets `status = INACTIVE` rather than deleting the row, so
historical purchases remain attached to a valid (if inactive) supplier
reference (`Purchase.supplierId` has no `onDelete: Cascade`; it uses
`onDelete: Restrict` to make this explicit at the database level).
`PurchaseItem.productId` also uses `onDelete: Restrict` for the same reason —
a product referenced by historical purchase items cannot be hard-deleted.

`PurchaseService.create()` composes the entire purchase inside one
`prisma.$transaction`:

```text
prisma.$transaction(async (tx) => {
  validate supplier (active, belongs to business)
  validate every product (active, belongs to business)
  validate quantity/price (positive, no duplicate products in one purchase)
  compute lineTotal = quantity * purchasePrice, total = sum(lineTotal)
  tx.purchase.create(...)
  tx.purchaseItem.createMany(...)
  for each item: inventoryService.applyMovement({ type: PURCHASE, ... }, tx)
})
```

Every purchase item's inventory effect is applied via
`InventoryService.applyMovement(input, tx)` — the same transaction-composable
primitive documented above — passing the outer transaction client so the
Purchase row, PurchaseItems, InventoryTransactions, and Inventory projection
update all commit or roll back together. `PurchaseService` does not
recompute stock, re-lock rows, or re-derive inflow/outflow direction; it
reuses the Inventory Engine and the shared `isInflowTransaction()` utility
exclusively. Purchase totals are always computed server-side from
`quantity × purchasePrice`; client-supplied totals are never trusted.

`PATCH /purchases/:id` only updates purchase metadata (`invoiceNumber`,
`purchaseDate`, `note`) — see ADR-010 in `DECISIONS.md` for why purchase
items are immutable after creation.

## Implemented: Customers & Sales (Phase 6)

`Customer` mirrors Supplier contact fields and ACTIVE/INACTIVE lifecycle, with
business/status and business/name indexes. DELETE deactivates the customer.
`Sale` requires businessId, customerId, saleDate, paymentMethod and createdByUserId;
optional metadata is invoiceNumber and note. Status defaults to COMPLETED.
`SaleItem` stores productId, quantity (NUMERIC(12,3)), sellingPrice (NUMERIC(12,2))
and lineTotal (NUMERIC(14,2)); Sale.total is NUMERIC(14,2).
Customer and product references use ON DELETE RESTRICT to preserve history.

PaymentMethod values: CASH, UPI, CARD, BANK_TRANSFER, OTHER. Draft/cancelled enum
values are reserved; this phase exposes no draft, cancellation or reversal flow.

Sales validate tenant membership/role, customer/product ownership and status,
nonempty unique items, decimal precision/range, positive quantity/price, payment
method and sale date. Line totals use Decimal multiplication rounded half-up to
two places; the sale total sums those rounded lines. Overflow is rejected.

Within one outer Prisma transaction, the sale is created, then products are
processed in sorted ID order. For each product, InventoryService.applyMovement
receives SALE and the outer client. Its locked balance check rejects overselling
before the SaleItem insert. Ledger/projection writes and all sale records commit
or roll back together. SalesService does not directly read/write inventory tables
or duplicate inventory locking, stock arithmetic or direction classification.
The ledger note includes the sale ID, following the purchase audit convention.

See ADR-011 for immutable sale fields and STATUS.md for the pre-existing local
database migration mismatch and isolated verification database.
