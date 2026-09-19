# Invento — Architecture Decisions

This document records important technical/product decisions and the reason
behind them.

## ADR-001 — PostgreSQL

**Decision:** Use PostgreSQL as the primary database.

**Reason:**

Invento contains strongly relational business data:

- Products
- Purchases
- Sales
- Inventory
- Suppliers
- Customers
- Users
- Businesses

Transactions and consistency are important, so a relational database is a
good foundation.

## ADR-002 — Prisma

**Decision:** Use Prisma as the ORM.

**Reason:**

Prisma provides:

- Strong TypeScript integration
- Type-safe database access
- Schema-driven development
- Good developer experience for a NestJS application

## ADR-003 — Inventory Transactions as Source of Truth

**Decision:** Inventory changes are represented by inventory transactions.

**Reason:**

A mutable stock number alone does not explain why stock changed.

A transaction ledger provides:

- History
- Auditability
- Debuggability
- Reconciliation

The current inventory can be maintained as a projection for fast reads.

## ADR-004 — Multi-Tenant from the Beginning

**Decision:** Business-owned data is scoped by `business_id`.

**Reason:**

Invento is intended to support multiple shops/businesses.

Adding tenancy later would require significant database and authorization
changes.

## ADR-005 — AI Requires User Confirmation

**Decision:** AI creates proposals that must be reviewed/confirmed before
business transactions are executed.

**Reason:**

AI can make mistakes when interpreting handwriting, language, prices, or
products.

Inventory and financial data must remain under user control.

## ADR-006 — API-First Development

**Decision:** Build the core backend APIs before major mobile UI development.

**Reason:**

The business logic and data model should be centralized in the backend.

The mobile application should primarily consume stable APIs rather than
reimplementing business logic.

## ADR-007 — No Custom Handwriting Model Initially

**Decision:** Use existing vision/document AI initially.

**Reason:**

Custom model training adds significant complexity and is unnecessary before
real-world data and failure patterns are understood.

## ADR-008 — Shared Package Must Remain Framework-Agnostic

**Decision:** `@invento/shared` contains only genuinely shared types and pure
utilities.

**Reason:**

The frontend should not become coupled to NestJS or Prisma implementation
details.
