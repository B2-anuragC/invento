# Invento — Database Design Principles

## Database

PostgreSQL is the primary database.

Prisma is the ORM.

## Core Entities

```text
Business
User
BusinessUser

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
