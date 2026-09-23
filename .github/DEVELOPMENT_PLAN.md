# Invento — Development Plan

## Purpose

This document is the master development execution plan for Invento.

Invento is an AI-powered inventory and business management application for small retailers and businesses.

The application should first establish a reliable, non-AI business and inventory system. AI features are added only after the core application is stable.

This document is intended to be used by GitHub Copilot in VS Code as the implementation plan.

---

# Critical Development Rules

## 1. Work one phase at a time

Copilot MUST NOT implement multiple phases in one task.

For each phase:

```text
Read documentation
        ↓
Inspect existing code
        ↓
Understand requirements
        ↓
Plan implementation
        ↓
Implement current phase
        ↓
Run verification
        ↓
Fix discovered issues
        ↓
Update documentation
        ↓
Report phase status
        ↓
STOP
```

Copilot must stop after completing and verifying the current phase.

The next phase should only begin after the developer explicitly asks Copilot to proceed.

---

## 2. Never assume existing implementation is missing

Before creating or modifying anything:

1. Inspect the existing implementation.
2. Check the current database schema.
3. Check existing modules.
4. Check existing tests.
5. Check package dependencies.
6. Check project documentation.
7. Reuse existing patterns where appropriate.

Do not recreate functionality that already exists.

---

## 3. Documentation hierarchy

Before implementation, read:

```text
.github/copilot-instructions.md
.github/PROJECT_CONTEXT.md
.github/PROJECT_STRUCTURE.md
.github/docs/PRODUCT.md
.github/docs/REQUIREMENTS.md
.github/docs/ARCHITECTURE.md
.github/docs/DATABASE.md
.github/docs/DECISIONS.md
.github/docs/STATUS.md
```

Read only the documents relevant to the current phase when appropriate, but always read `PROJECT_CONTEXT.md` and `copilot-instructions.md`.

---

# Technology Stack

## Backend

* NestJS
* TypeScript
* PostgreSQL
* Prisma
* REST API
* Swagger/OpenAPI
* Vitest/Jest according to existing project configuration

## Frontend

* React Native
* Expo
* Expo Router

## Shared

* `@invento/shared`

## Development

* Node.js
* npm
* Docker where appropriate
* Git

---

# Architecture Principles

## Backend layering

```text
Controller
    ↓
Service
    ↓
Prisma / Repository
    ↓
PostgreSQL
```

Controllers should remain thin.

Business logic belongs in services/domain logic.

---

# Multi-Tenancy

Invento is a multi-business application.

The expected relationship is:

```text
User
 ├── Business A
 └── Business B
```

Business-owned resources must be isolated.

Every business API must validate:

```text
Authentication
      ↓
Business membership
      ↓
Role/permission
      ↓
Resource ownership
```

Never trust a client-provided `businessId` without authorization validation.

Cross-business data access must never be possible.

---

# Inventory Principle

Inventory is business-critical.

Inventory transactions are the source of truth.

The inventory projection/current-stock table exists for efficient reads.

Expected flow:

```text
Business Transaction
        ↓
Inventory Transaction
        ↓
Inventory Projection
```

Inventory-affecting operations include:

* Opening stock
* Purchase
* Sale
* Return in
* Return out
* Adjustment
* Damage
* Expiry

Do not directly modify inventory from arbitrary controllers or services.

Purchases and sales must maintain database consistency using database transactions.

---

# AI Principle

AI is an interpretation layer.

AI must never directly mutate inventory.

The intended flow is:

```text
Image / Voice / Text
        ↓
AI processing
        ↓
Structured proposal
        ↓
Product matching
        ↓
User review
        ↓
User confirmation
        ↓
Normal business transaction
        ↓
Inventory update
```

AI-generated data must be validated by the backend.

---

# Phase 1 — Backend Foundation

## Status

**Expected status: COMPLETED**

This phase establishes the technical foundation for the backend.

## Scope

* NestJS configuration
* PostgreSQL setup
* Prisma setup
* Environment configuration
* Global validation
* Error handling
* Swagger
* Health check
* Initial project structure
* Initial migration

## Acceptance Criteria

* Backend starts successfully.
* PostgreSQL connection works.
* Prisma is correctly configured.
* Database migrations work.
* Environment variables are validated.
* Global request validation is enabled.
* Global exception handling is configured.
* Swagger/OpenAPI is available.
* Health endpoint works.
* Existing tests continue to pass.
* Production build succeeds.

## Verification Gate

Run:

```bash
npm run build
npm test
```

Also verify:

```text
[ ] Backend starts
[ ] Database connection succeeds
[ ] Prisma commands work
[ ] Migration works
[ ] Swagger works
[ ] Health endpoint works
[ ] Validation works
[ ] Error handling works
[ ] Tests pass
[ ] Build passes
```

### Phase 1 completion rule

Do not proceed if any critical verification fails.

---

# Phase 2 — Authentication, Users & Business

## Objective

Implement user identity, authentication, business creation and business membership.

## Scope

### Authentication

Implement:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

Use the authentication architecture documented in the project.

Authentication implementation must be secure and extensible.

### Users

Support:

* User identity
* User profile
* Authentication state

### Business

Implement:

```text
POST   /businesses
GET    /businesses/:id
PATCH  /businesses/:id
```

### Business users

Implement:

```text
GET    /businesses/:id/users
POST   /businesses/:id/users
PATCH  /businesses/:id/users/:userId
DELETE /businesses/:id/users/:userId
```

## Roles

Implement the minimum role model required by the current requirements.

Keep authorization extensible.

Do not introduce unnecessary complex RBAC.

## Business Rules

* A user must be authenticated before accessing protected resources.
* A user can belong to one or more businesses.
* Users can only access businesses they belong to.
* Business-owned resources must be isolated.
* Unauthorized business access must return an appropriate error.
* Users cannot modify another user's membership without appropriate permission.

## Acceptance Criteria

```text
[ ] User can register
[ ] User can login
[ ] Authentication token/session works
[ ] Refresh mechanism works if implemented
[ ] Logout works
[ ] /auth/me returns authenticated user
[ ] User can create a business
[ ] User can retrieve their business
[ ] User can update their business
[ ] User can view business users
[ ] Authorized user can manage memberships
[ ] Unauthorized user cannot access business
[ ] Cross-business access is prevented
[ ] Authentication errors are handled correctly
[ ] Validation is implemented
[ ] Swagger documentation exists
[ ] Tests cover authentication
[ ] Tests cover authorization
[ ] Tests cover tenant isolation
```

## Verification Gate

Test at minimum:

```text
User A → Business A → allowed
User A → Business B → denied
User B → Business B → allowed
Unauthenticated → protected API → denied
```

Also verify:

```text
[ ] Unit tests pass
[ ] Integration tests pass
[ ] Build passes
[ ] TypeScript checks pass
[ ] API documentation is correct
[ ] No sensitive information is returned
```

### STOP

Do not begin Phase 3 automatically.

---

# Phase 3 — Products

## Objective

Create the product catalog that will be used by inventory, purchases, sales and eventually AI product matching.

## Scope

Implement:

```text
POST   /products
GET    /products
GET    /products/:id
PATCH  /products/:id
DELETE /products/:id
GET    /products/search
GET    /products/:id/stock
GET    /products/:id/transactions
```

## Product Information

Support the fields required by the product requirements, such as:

* Name
* SKU
* Barcode
* Unit
* Purchase price
* Selling price
* Minimum stock
* Status
* Business ownership

Do not add unnecessary product complexity.

## Product Lifecycle

Prefer deactivation over physical deletion where historical transactions depend on a product.

Example:

```text
ACTIVE
  ↓
INACTIVE
```

Historical transactions must remain understandable.

## Product Search

Support efficient search by relevant fields.

The exact search implementation should remain simple initially.

Advanced semantic/AI matching belongs to a later phase.

## Acceptance Criteria

```text
[ ] Product can be created
[ ] Product can be retrieved
[ ] Product list works
[ ] Product can be updated
[ ] Product can be deactivated
[ ] Product search works
[ ] SKU uniqueness is enforced appropriately
[ ] Barcode handling works where provided
[ ] Unit is validated
[ ] Prices are validated
[ ] Minimum stock is validated
[ ] Product belongs to a business
[ ] Cross-business product access is prevented
[ ] Product history remains available after deactivation
[ ] Validation exists
[ ] Swagger documentation exists
[ ] Tests exist
```

## Verification Gate

Verify:

```text
Business A
 └── Product A

Business B
 └── Product B
```

Ensure:

```text
Business A cannot retrieve Product B.
```

Also test:

```text
Create
→ Read
→ Update
→ Search
→ Deactivate
→ Retrieve history
```

### STOP

Do not begin Phase 4 automatically.

---

# Phase 4 — Inventory Engine

## Objective

Build the core inventory engine.

This is one of the most critical phases in Invento.

## Scope

Implement:

```text
POST /inventory/opening-stock
POST /inventory/adjustments
GET  /inventory
GET  /inventory/:productId
GET  /inventory/:productId/history
```

Implement the inventory transaction model.

## Transaction Types

Support the required types:

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

Use the project's database documentation as the source of truth for the final model.

## Source of Truth

Inventory transaction history is the source of truth.

Current stock is a projection/read model.

Expected model:

```text
InventoryTransaction
        ↓
Inventory Projection
```

## Example

```text
Opening stock = 100 KG

Purchase = +50 KG

Current stock = 150 KG

Sale = -20 KG

Current stock = 130 KG

Damage = -5 KG

Current stock = 125 KG
```

## Critical Business Rules

* Stock cannot become negative unless explicitly supported by a documented business rule.
* Inventory changes must be auditable.
* Every stock-changing operation should create an appropriate inventory transaction.
* Historical transactions must not be silently changed.
* Inventory operations must be atomic.
* Concurrent stock operations must not corrupt stock.
* Business ownership must be enforced.

## Acceptance Criteria

```text
[ ] Opening stock works
[ ] Stock adjustment works
[ ] Inventory transaction is created
[ ] Current stock is correctly calculated
[ ] Inventory history is available
[ ] Stock cannot become invalid
[ ] Insufficient stock is rejected
[ ] Inventory transaction and stock projection remain consistent
[ ] Multi-tenant isolation works
[ ] Authorization works
[ ] Concurrent operations are considered
[ ] Database transaction is used where required
[ ] Inventory changes are auditable
[ ] Tests cover positive stock changes
[ ] Tests cover negative stock changes
[ ] Tests cover insufficient stock
[ ] Tests cover rollback
[ ] Tests cover tenant isolation
```

## Mandatory Verification

Test:

```text
100 opening
+50 purchase
-20 sale
-5 damage
=125
```

Also test failure:

```text
Stock = 10

Sale = 20

Expected:
Sale rejected
Stock remains 10
No partial inventory transaction
```

Test rollback:

```text
Operation fails halfway
        ↓
Database state unchanged
```

### Critical Rule

Do not proceed to Purchases/Sales until inventory consistency tests pass.

### STOP

Do not begin Phase 5 automatically.

---

# Phase 5 — Suppliers & Purchases

## Objective

Implement supplier management and purchase transactions.

## Suppliers

Implement:

```text
POST   /suppliers
GET    /suppliers
GET    /suppliers/:id
PATCH  /suppliers/:id
DELETE /suppliers/:id
```

## Purchases

Implement:

```text
POST  /purchases
GET   /purchases
GET   /purchases/:id
PATCH /purchases/:id
```

## Purchase Information

A purchase should support:

* Supplier
* Invoice number
* Purchase date
* Items
* Product
* Quantity
* Purchase price
* Total
* Business ownership

## Critical Purchase Flow

```text
Create Purchase
       ↓
Validate supplier
       ↓
Validate products
       ↓
Validate quantities/prices
       ↓
Create purchase
       ↓
Create purchase items
       ↓
Create inventory transactions
       ↓
Update inventory projection
       ↓
Commit transaction
```

All relevant operations must be atomic.

## Acceptance Criteria

```text
[ ] Supplier CRUD works
[ ] Supplier belongs to business
[ ] Purchase can be created
[ ] Purchase items can be added
[ ] Purchase totals are calculated correctly
[ ] Supplier is validated
[ ] Product ownership is validated
[ ] Inventory increases correctly
[ ] Inventory transaction is created
[ ] Purchase history works
[ ] Purchase detail works
[ ] Invalid purchase is rejected
[ ] Partial purchase updates cannot occur
[ ] Multi-tenant isolation works
[ ] Tests cover purchase + inventory
[ ] Rollback tests exist
```

## Verification Example

```text
Initial stock = 100

Purchase:
Rice = 50

Expected:
Stock = 150
Purchase record = created
Purchase item = created
Inventory transaction = created
```

Failure test:

```text
Purchase contains invalid product

Expected:
Purchase not created
Purchase items not created
Inventory not changed
```

### STOP

Do not begin Phase 6 automatically.

---

# Phase 6 — Customers & Sales

## Objective

Implement customers and sales transactions.

## Customers

Implement:

```text
POST   /customers
GET    /customers
GET    /customers/:id
PATCH  /customers/:id
DELETE /customers/:id
```

## Sales

Implement:

```text
POST  /sales
GET   /sales
GET   /sales/:id
PATCH /sales/:id
```

## Sale Information

Support:

* Customer
* Items
* Product
* Quantity
* Selling price
* Total
* Payment method
* Sale date
* Business ownership

## Critical Sale Flow

```text
Create Sale
       ↓
Validate customer
       ↓
Validate products
       ↓
Check stock
       ↓
Create sale
       ↓
Create sale items
       ↓
Create inventory transactions
       ↓
Decrease inventory
       ↓
Commit
```

## Business Rules

* Sale cannot exceed available stock unless explicitly supported.
* Product must belong to the same business.
* Customer must belong to the same business.
* Inventory update must be atomic with sale creation.
* Sale history must remain auditable.

## Acceptance Criteria

```text
[x] Customer CRUD works
[x] Customer belongs to business
[x] Sale can be created
[x] Sale items work
[x] Sale totals are correct
[x] Stock validation works
[x] Inventory decreases correctly
[x] Inventory transaction is created
[x] Payment method is validated
[x] Sale history works
[x] Sale details work
[x] Invalid sale is rejected
[x] Failed sale does not modify inventory
[x] Multi-tenant isolation works
[x] Tests exist
```

## Mandatory Verification

Test:

```text
Opening stock = 100

Purchase = +50
Stock = 150

Sale = -20
Stock = 130

Sale = -200
Expected: rejected
Stock = 130
```

Test rollback and concurrent operations where practical.

### STOP

Do not begin Phase 7 automatically.

---

# Phase 7 — Dashboard

## Objective

Create the operational dashboard APIs using real business data.

## Scope

Implement:

```text
GET /dashboard/summary
GET /dashboard/sales
GET /dashboard/purchases
GET /dashboard/low-stock
GET /dashboard/top-products
```

## Summary

The dashboard should provide relevant metrics such as:

* Today's sales
* Today's purchases
* Product count
* Low-stock count
* Recent transactions
* Other metrics documented in requirements

## Low Stock

A product should be considered low stock according to its configured minimum stock.

Example:

```text
Current stock = 8
Minimum stock = 10

→ Low stock
```

## Top Products

Use real sales data.

Do not introduce unnecessary analytics infrastructure.

## Acceptance Criteria

```text
[x] Summary API works
[x] Today's sales are correct
[x] Today's purchases are correct
[x] Product count is correct
[x] Low-stock products are correct
[x] Top products are calculated correctly
[x] Business isolation works
[x] Date/time handling is consistent
[x] Empty data is handled correctly
[x] Performance is acceptable for MVP
[x] Tests exist
```

## Verification

Create known test data and manually calculate expected dashboard values.

Compare:

```text
Database data
        vs
Dashboard response
```

Ensure another business's transactions cannot influence metrics.

### STOP

Do not begin Phase 8 automatically.

---

# Phase 8 — Testing, Hardening & Non-AI MVP Completion

## Objective

Stabilize the entire backend before AI integration.

This is the final non-AI phase.

## Scope

Review all previous modules:

```text
Authentication
Business
Users
Products
Inventory
Suppliers
Purchases
Customers
Sales
Dashboard
```

## Testing

Add or improve:

### Unit Tests

Test business logic independently.

### Integration Tests

Test API + database behavior.

### End-to-End Tests

Test important real workflows.

## Mandatory End-to-End Scenario

```text
Register user
      ↓
Create business
      ↓
Create product
      ↓
Opening stock
      ↓
Create supplier
      ↓
Create purchase
      ↓
Verify stock
      ↓
Create customer
      ↓
Create sale
      ↓
Verify stock
      ↓
Verify transaction history
      ↓
Verify dashboard
```

## Security Review

Verify:

```text
[x] Authentication
[x] Authorization
[x] Multi-tenant isolation
[x] Input validation
[x] Sensitive data handling
[x] Error responses
[x] No accidental data leakage
[x] No unrestricted businessId access
[x] No unrestricted resource access
```

## Database Review

Verify:

```text
[x] Foreign keys
[x] Unique constraints
[x] Required fields
[x] Indexes
[x] Decimal/numeric money handling
[x] Quantity precision
[x] Transactions
[x] Inventory consistency
```

## API Review

Verify:

```text
[x] HTTP status codes
[x] Validation errors
[x] Authentication errors
[x] Authorization errors
[x] Not-found handling
[x] Swagger documentation
[x] Consistent response format
```

## Acceptance Criteria

```text
[x] All critical tests pass
[x] Build passes
[x] TypeScript passes
[x] Lint passes where configured
[x] E2E flows pass
[x] Inventory calculations are verified
[x] Purchase/sale atomicity verified
[x] Tenant isolation verified
[x] API documentation is complete
[x] No known critical bugs remain
```

## NON-AI MVP CHECKPOINT

At this point Invento must support:

```text
User
 ↓
Business
 ↓
Products
 ↓
Inventory
 ↓
Purchases
 ↓
Sales
 ↓
Dashboard
```

The system must work without any AI dependency.

### Mandatory STOP

Do not start AI development until the developer explicitly approves the non-AI MVP.

---

# Phase 9 — AI Bill / Document Processing

## Objective

Introduce AI-powered bill/document understanding without allowing AI to directly mutate business data.

## Scope

Implement the AI document lifecycle:

```text
UPLOADED
    ↓
PROCESSING
    ↓
REVIEW_REQUIRED
    ↓
CONFIRMED
```

Failure:

```text
PROCESSING
    ↓
FAILED
```

Rejection:

```text
REVIEW_REQUIRED
    ↓
REJECTED
```

## APIs

Implement:

```text
POST /ai/documents
GET  /ai/documents/:id
POST /ai/documents/:id/process
POST /ai/documents/:id/confirm
POST /ai/documents/:id/reject
```

## AI Input

Initially support bill/document images.

Future input may include:

* Camera
* Uploaded image
* PDF
* Voice
* Text

Do not implement all input types at once.

## AI Output

AI should extract structured information such as:

```text
Supplier
Invoice number
Date
Items
Product name
Quantity
Unit
Purchase price
Selling price where available
Total
```

Raw AI output may be stored as JSON/JSONB for debugging and traceability.

Important business fields should be normalized into relational structures after validation.

## Critical AI Rule

AI cannot directly modify inventory.

The flow must be:

```text
Bill
 ↓
AI extraction
 ↓
Structured proposal
 ↓
Product matching
 ↓
User review
 ↓
Confirm
 ↓
Purchase transaction
 ↓
Inventory update
```

## Acceptance Criteria

```text
[ ] Document can be uploaded
[ ] Document status is tracked
[ ] Processing state is tracked
[ ] AI output is stored
[ ] Structured items are generated
[ ] Failed processing is handled
[ ] User can review extracted information
[ ] User can reject proposal
[ ] Confirmation is required
[ ] AI cannot directly modify inventory
[ ] Confirmed data goes through normal purchase/business flow
[ ] Authorization is enforced
[ ] Business isolation works
[ ] Tests cover AI failure
[ ] Tests prove unconfirmed AI data cannot change inventory
```

## Mandatory Safety Test

```text
Upload bill
 ↓
AI extracts purchase
 ↓
Do NOT confirm
 ↓
Check inventory
```

Expected:

```text
Inventory unchanged
```

Then:

```text
Confirm
 ↓
Normal purchase transaction
 ↓
Inventory changes
```

### STOP

Do not automatically implement product matching improvements or voice input.

---

# Phase 10 — AI Product Matching

## Objective

Match messy AI-extracted product names with products already registered in Invento.

## Matching Strategy

Use the following progression:

```text
Exact match
    ↓
Alias match
    ↓
Fuzzy match
    ↓
Semantic match
    ↓
AI suggestion
    ↓
User selection
```

Do not immediately build a complex vector/AI matching system if simpler matching solves the problem.

## Product Aliases

Introduce product aliases where appropriate.

Example:

```text
Product:
Rice

Aliases:
rice
rce
rc
chawal
basmati rice
```

User corrections may create or improve aliases where appropriate.

## Confidence

Initial confidence model may use:

```text
>95%  → highly confident
70-95% → review recommended
<70%  → user selection required
```

These are starting assumptions and must be validated using real data.

Do not treat these percentages as scientifically established thresholds.

## Acceptance Criteria

```text
[ ] Exact matches work
[ ] Alias matches work
[ ] Fuzzy matching works
[ ] Low-confidence matches require review
[ ] User can select another product
[ ] Product ownership is enforced
[ ] Matching never crosses businesses
[ ] User corrections can be recorded
[ ] AI suggestions remain proposals
[ ] Inventory is not changed during matching
[ ] Tests cover correct matches
[ ] Tests cover incorrect matches
[ ] Tests cover ambiguous matches
```

## Mandatory Verification

Test examples such as:

```text
"Rice"
"rce"
"rc"
"chawal"
```

against the same configured product.

Also test:

```text
Ambiguous product
        ↓
User selection required
```

### STOP

Do not automatically implement voice functionality.

---

# Phase 11 — Voice Input

## Objective

Allow users to enter inventory/business information using voice.

## Initial Scope

Start with simple voice-to-structured-data workflows.

Potential examples:

```text
"Add 20 kg rice"
```

or:

```text
"Sell 5 packets of biscuit"
```

Voice should not bypass normal business validation.

## Voice Flow

```text
User speech
    ↓
Speech-to-text
    ↓
Structured interpretation
    ↓
Product matching
    ↓
User review
    ↓
Confirmation
    ↓
Normal business transaction
```

## Critical Rule

Voice must follow the same safety model as bill scanning.

Voice input must never directly mutate inventory.

## Acceptance Criteria

```text
[ ] Voice input can be captured
[ ] Speech-to-text works
[ ] Structured information is extracted
[ ] Product matching works
[ ] User can review interpretation
[ ] User can edit extracted information
[ ] User confirmation is required
[ ] Normal transaction APIs are used
[ ] Inventory rules remain unchanged
[ ] Authorization remains enforced
[ ] Multi-tenant isolation remains enforced
[ ] Failed transcription is handled
[ ] Ambiguous speech requires clarification/review
[ ] Tests exist
```

## Example

Input:

```text
"Sell twenty kilo rice"
```

Expected proposal:

```text
Product: Rice
Quantity: 20
Unit: KG
Transaction: Sale
```

User confirms.

Only then:

```text
Sale API
    ↓
Inventory transaction
    ↓
Stock update
```

### Final Phase Gate

Verify that:

```text
Bill AI
Voice AI
Product Matching
```

all use the same underlying business transaction system.

AI must remain an input/proposal layer rather than becoming a second business logic system.

---

# Global Verification Checklist

Every phase must verify the following where applicable.

## Code Quality

```text
[ ] Existing code was inspected
[ ] No unnecessary rewrites
[ ] No unnecessary dependencies
[ ] TypeScript is valid
[ ] Build succeeds
[ ] Lint succeeds where configured
```

## Testing

```text
[ ] Unit tests
[ ] Integration tests
[ ] E2E tests where applicable
[ ] Failure scenarios
[ ] Boundary cases
```

## Security

```text
[ ] Authentication
[ ] Authorization
[ ] Business ownership
[ ] Resource ownership
[ ] Input validation
[ ] No sensitive information leakage
```

## Multi-Tenancy

For business-owned data:

```text
[ ] Correct business association
[ ] Cross-business reads blocked
[ ] Cross-business updates blocked
[ ] Cross-business deletes blocked
```

## Database

```text
[ ] Correct relationships
[ ] Correct constraints
[ ] Correct indexes
[ ] Correct numeric types
[ ] Transactions where required
[ ] Migration works
```

## API

```text
[ ] Correct HTTP methods
[ ] Correct status codes
[ ] Validation
[ ] Error handling
[ ] Swagger documentation
```

## Documentation

Update relevant documentation when necessary:

```text
Architecture change
→ docs/ARCHITECTURE.md

Database change
→ docs/DATABASE.md

Product requirement change
→ docs/REQUIREMENTS.md

Architectural decision
→ docs/DECISIONS.md

Development progress
→ docs/STATUS.md
```

---

# Phase Completion Report

At the end of every phase, Copilot MUST provide a report using this structure:

```text
PHASE: <phase number and name>

STATUS:
COMPLETE / BLOCKED / NEEDS REVIEW

IMPLEMENTATION SUMMARY:
- ...

FILES CREATED:
- ...

FILES MODIFIED:
- ...

DATABASE CHANGES:
- ...

API CHANGES:
- ...

TESTS ADDED:
- ...

VERIFICATION:

Build:
PASS / FAIL

TypeScript:
PASS / FAIL

Tests:
PASS / FAIL

Lint:
PASS / FAIL / NOT CONFIGURED

Authorization:
PASS / FAIL / NOT APPLICABLE

Multi-tenant isolation:
PASS / FAIL / NOT APPLICABLE

Database consistency:
PASS / FAIL / NOT APPLICABLE

Acceptance criteria:
X / Y completed

KNOWN ISSUES:
- ...

ARCHITECTURAL DECISIONS:
- ...

DOCUMENTATION UPDATED:
- ...

RECOMMENDATION:
READY FOR REVIEW / BLOCKED

STOP.
```

---

# Rules for Copilot

Copilot must follow these rules throughout development.

## Rule 1 — Do not skip phases

Do not implement future phases unless explicitly instructed.

## Rule 2 — Do not silently change architecture

If implementation requires an architectural change:

1. Explain why.
2. Identify affected documentation.
3. Ask for approval before making a major architectural change.

## Rule 3 — Do not bypass inventory rules

Never directly update inventory outside the documented inventory system.

## Rule 4 — AI cannot mutate inventory

AI output must always go through:

```text
Proposal
 ↓
Validation
 ↓
User confirmation
 ↓
Normal transaction
 ↓
Inventory
```

## Rule 5 — Preserve historical data

Do not physically delete business records when historical transactions depend on them.

Prefer deactivation where appropriate.

## Rule 6 — Business isolation is mandatory

Never return another business's data.

## Rule 7 — Tests are part of implementation

A feature is not complete merely because the code compiles.

## Rule 8 — Stop after verification

After completing the current phase:

```text
IMPLEMENT
→ VERIFY
→ REPORT
→ STOP
```

Do not continue automatically.

---

# Definition of Done

A phase is considered complete only when:

```text
Implementation
      +
Validation
      +
Authorization
      +
Business rules
      +
Tests
      +
Build
      +
Verification
      +
Documentation
```

are complete.

Compilation alone does not mean the phase is complete.

---

# Overall Development Milestones

## Milestone 1 — Foundation

```text
Phase 1
```

Status:

```text
COMPLETED
```

---

## Milestone 2 — Core Business Platform

```text
Phase 2
Phase 3
Phase 4
Phase 5
Phase 6
Phase 7
```

Result:

```text
Authentication
+
Business
+
Products
+
Inventory
+
Purchases
+
Sales
+
Dashboard
```

---

## Milestone 3 — Production-Ready Non-AI MVP

```text
Phase 8
```

Result:

```text
Stable business application
without AI dependency
```

---

## Milestone 4 — AI Layer

```text
Phase 9
Phase 10
Phase 11
```

Result:

```text
Bill scanning
+
Product matching
+
Voice input
```

All AI features must use the existing business APIs and inventory engine.

---

# Final Architecture Goal

The final system should conceptually look like:

```text
                 ┌───────────────────┐
                 │   Mobile App      │
                 │ React Native/Expo │
                 └─────────┬─────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │   NestJS REST API │
                 └─────────┬─────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      Business          Products        Inventory
      Management                         Engine
          │                │                │
          └────────────────┼────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
         Purchases                    Sales
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
                      PostgreSQL
                           │
                           │
                 ┌─────────▼─────────┐
                 │   AI Layer       │
                 │                   │
                 │ Bill Processing   │
                 │ Product Matching  │
                 │ Voice             │
                 └─────────┬─────────┘
                           │
                           ▼
                    Proposal / Review
                           │
                           ▼
                     User Confirm
                           │
                           ▼
                  Normal Business API
                           │
                           ▼
                     Inventory
```

The AI layer must remain separated from the core business transaction system.

---

# Recommended Copilot Starting Prompt

When beginning the next phase, use:

> Read `.github/DEVELOPMENT_PLAN.md` and the relevant Invento documentation.
>
> Phase 1 is already completed.
>
> Start **Phase 2 only**.
>
> First inspect the existing implementation and verify what Phase 1 actually contains. Then implement Phase 2 according to the acceptance criteria in `DEVELOPMENT_PLAN.md`.
>
> Do not implement Phase 3 or any later phase.
>
> After implementation, run the complete Phase 2 verification gate, fix issues found during verification, update relevant documentation, and provide the required Phase Completion Report.
>
> **STOP after Phase 2 verification. Do not proceed automatically.**
