# Invento — Project Context & Development Guide

> **Purpose:** This is the primary product and development context for Invento.
> Any developer or AI coding assistant should read this before making significant
> product, architecture, database, API, or feature changes.

## 1. What is Invento?

Invento is an AI-powered inventory and business management application designed
primarily for small retailers and shopkeepers in India.

The goal is to make inventory management simple enough that a shopkeeper does
not need to manually enter every transaction into complicated software.

Invento will eventually support:

- Product management
- Stock management
- Purchases
- Sales
- Suppliers
- Customers
- Business reports
- Handwritten bill scanning
- Voice-based transaction input
- AI-powered product matching
- AI-assisted business insights

The long-term goal is to make Invento feel less like traditional inventory
software and more like an **AI business assistant for small retailers**.

## 2. Problem We Are Solving

Many small shops still manage inventory using paper registers, handwritten
bills, WhatsApp messages, spreadsheets, calculators, or memory.

Traditional inventory software can require too much manual entry.

Invento should reduce this friction.

The eventual experience should be:

> Take a picture → Invento understands it → user confirms → inventory updates.

or:

> Speak → Invento understands it → user confirms → inventory updates.

Manual entry must always remain available because AI will not always be correct.

## 3. Target Users

Primary users are small and medium-sized retail businesses in India.

Initial focus:

- Grocery stores
- General stores
- Small distributors
- Local retail businesses

The product should prioritize simple retail inventory workflows instead of
trying to become a full enterprise ERP.

## 4. Core Product Principle

> **Make inventory management easier by reducing manual data entry while
> keeping the user in control.**

Invento should support three input methods:

```text
Manual Input
     │
     ├──────────────┐
     │              │
Camera/Image      Voice
     │              │
     └──────┬───────┘
            ↓
       AI Interpretation
            ↓
     Structured Proposal
            ↓
      Product Matching
            ↓
      User Confirmation
            ↓
     Business Transaction
            ↓
       Inventory Update
```

## 5. AI Principle

AI is responsible for interpreting messy real-world input.

The backend remains responsible for business rules.

```text
AI
= Interpretation + Extraction + Matching + Suggestions

Backend
= Validation + Authorization + Business Rules + Transactions + Inventory
```

AI should not decide whether a transaction is valid or directly mutate inventory.

## 6. AI Must Never Directly Modify Inventory

AI processing produces a proposal.

```text
Bill/Image
    ↓
AI processing
    ↓
Proposed Purchase/Sale
    ↓
User Review
    ↓
User Confirmation
    ↓
Normal Business Transaction
    ↓
Inventory Update
```

AI must never directly execute inventory changes.

## 7. MVP Scope

The first version should focus on a reliable inventory system.

### Authentication

- Registration/login
- Authentication
- User identity
- Business membership
- Basic roles

### Business

- Create/manage shop
- Business profile
- Business users

### Products

- Create product
- Update product
- Deactivate product
- Search products
- SKU
- Barcode
- Unit
- Purchase price
- Selling price
- Minimum stock

### Inventory

- Opening stock
- Purchase stock
- Sales stock reduction
- Stock adjustments
- Damage
- Expiry
- Returns
- Current stock
- Stock history

### Suppliers

- CRUD
- Supplier purchase history

### Customers

- CRUD
- Customer sales history

### Purchases

- Create purchase
- Purchase items
- Supplier
- Invoice number
- Purchase date
- Purchase history

### Sales

- Create sale
- Sale items
- Customer
- Payment method
- Sales history

### Dashboard

- Today's sales
- Today's purchases
- Total products
- Low-stock products
- Recent transactions

## 8. Explicitly Out of Initial MVP

Do not build these unless requirements change:

- Full accounting system
- Complete GST accounting engine
- Payroll
- Employee management system
- Full ERP
- Complex warehouse management
- Multi-country taxation
- Custom ML model training
- Advanced forecasting
- Complex autonomous AI agents
- Automatic AI inventory modification

These can be considered future capabilities.

## 9. AI V1

After the manual inventory system is stable, implement AI bill scanning.

```text
Camera
  ↓
Image
  ↓
Document/Image Processing
  ↓
Text/Row Extraction
  ↓
Structured Data
  ↓
Product Matching
  ↓
Confidence
  ↓
User Review
  ↓
Confirmation
  ↓
Purchase/Sale
  ↓
Inventory Update
```

Example extracted data:

```json
{
  "items": [
    {
      "name": "Rice",
      "quantity": 20,
      "unit": "KG",
      "unitPrice": 45
    }
  ]
}
```

The result must remain editable before confirmation.

## 10. Handwriting Recognition Strategy

Do not start by training a custom handwriting model.

Initially use existing:

- Vision models
- Document understanding
- OCR
- LLM structured extraction

The problem is not only character recognition.

It is also business-context understanding.

For example:

```text
OCR result:
"rce"

Product database:
"Rice"

Result:
"rce" → Rice
```

## 11. Product Matching

Use progressively stronger matching:

```text
1. Exact match
       ↓
2. Alias match
       ↓
3. Fuzzy matching
       ↓
4. Semantic matching
       ↓
5. AI suggestion
       ↓
6. User selection
```

Shop-specific aliases may eventually include:

```text
rice
rce
rc
chawal
```

all mapping to the same product.

User corrections should become useful matching data.

## 12. AI Confidence

Initial confidence behavior:

```text
>95%
→ Highly confident; still editable

70–95%
→ Ask user to verify

<70%
→ Require user selection
```

These thresholds are initial assumptions and should be adjusted using
real-world testing.

Prefer messages such as:

> We couldn't confidently identify this item.

instead of:

> AI failed.

## 13. Languages

Initial AI support should consider:

- English
- Hindi
- Hinglish

Additional Indian languages should be added based on actual user demand.

Do not build every regional language in the first version.

## 14. Voice Input

After bill scanning is reasonably stable, support voice input.

Example:

> "Add 20 kilo rice at 45 rupees."

Expected interpretation:

```json
{
  "product": "Rice",
  "quantity": 20,
  "unit": "KG",
  "unitPrice": 45
}
```

Flow:

```text
Voice
 ↓
Speech-to-text
 ↓
AI extraction
 ↓
Product matching
 ↓
Confirmation
 ↓
Transaction
```

## 15. Multi-Tenant Architecture

Invento should be multi-business from the beginning.

```text
User
 ├── Business A
 └── Business B
```

Most business-owned records should contain `business_id`.

Examples:

- products
- suppliers
- customers
- sales
- purchases
- inventory_transactions

Every business API must verify that the authenticated user has access to
the requested business.

Never trust a client-provided `business_id` without authorization validation.

## 16. Database Philosophy

Primary database:

- PostgreSQL
- Prisma ORM

Business-critical data should be relational.

JSON/JSONB can be used for:

- AI raw responses
- AI metadata
- Flexible extraction data
- Debug information

Important business data must not exist only inside JSON.

## 17. Inventory Philosophy

Inventory transactions are the source of truth.

Example:

```text
Opening stock      +100
Purchase            +50
Sale                -20
Damage               -5
Return               +10
-------------------------
Current stock       135
```

Maintain an immutable inventory transaction history.

A current inventory table may be maintained as a fast-access projection.

```text
inventory_transactions
        ↓
source of truth

inventories
        ↓
current state / fast lookup
```

## 18. Money and Quantity

Never use floating-point numbers for financial calculations.

Suggested database types:

```text
Money:
NUMERIC(12,2)

Quantity:
NUMERIC(12,3)
```

Quantity may need decimals for:

- KG
- Litres
- Metres

Examples:

- 1.250 KG
- 2.500 L
- 3.750 M

## 19. Core Database Entities

Initial concepts:

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

The exact schema can evolve as implementation progresses.

## 20. Backend Architecture

Backend stack:

- NestJS
- TypeScript
- PostgreSQL
- Prisma

Suggested module structure:

```text
backend/src/

├── auth/
├── users/
├── businesses/
├── products/
├── suppliers/
├── customers/
├── inventory/
├── purchases/
├── sales/
├── dashboard/
├── ai/
├── common/
└── prisma/
```

Prefer:

```text
Controller
    ↓
Service
    ↓
Prisma / Repository
    ↓
Database
```

Controllers should remain thin. Business rules belong in services/domain logic.

## 21. API-First Development

Current strategy: **backend/API first**.

Build the backend in this order:

```text
Backend Foundation
        ↓
Authentication
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
Suppliers
        ↓
Customers
        ↓
Dashboard
        ↓
AI
        ↓
API Hardening
        ↓
Mobile UI
```

Once the core API contract is stable, mobile development can start while
remaining backend work continues.

## 22. API Roadmap

### Foundation

Set up:

- NestJS
- Prisma
- PostgreSQL
- Environment configuration
- Validation
- Error handling
- Logging
- Swagger/OpenAPI
- Testing
- Docker development environment

### Authentication

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

### Business

```text
POST   /businesses
GET    /businesses/:id
PATCH  /businesses/:id

GET    /businesses/:id/users
POST   /businesses/:id/users
PATCH  /businesses/:id/users/:userId
DELETE /businesses/:id/users/:userId
```

### Products

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

### Inventory

```text
POST /inventory/opening-stock
POST /inventory/adjustments

GET /inventory
GET /inventory/:productId
GET /inventory/:productId/history
```

All stock modifications must create inventory transactions.

### Purchases

```text
POST  /purchases
GET   /purchases
GET   /purchases/:id
PATCH /purchases/:id
```

Purchase creation should atomically:

```text
Create purchase
 ↓
Create purchase items
 ↓
Create inventory transactions
 ↓
Update inventory projection
```

### Sales

```text
POST  /sales
GET   /sales
GET   /sales/:id
PATCH /sales/:id
```

Sale creation should atomically:

```text
Create sale
 ↓
Create sale items
 ↓
Validate stock
 ↓
Create inventory transactions
 ↓
Update inventory
```

### Suppliers / Customers

Supplier:

```text
POST   /suppliers
GET    /suppliers
GET    /suppliers/:id
PATCH  /suppliers/:id
DELETE /suppliers/:id
```

Customer:

```text
POST   /customers
GET    /customers
GET    /customers/:id
PATCH  /customers/:id
DELETE /customers/:id
```

### Dashboard

```text
GET /dashboard/summary
GET /dashboard/sales
GET /dashboard/purchases
GET /dashboard/low-stock
GET /dashboard/top-products
```

## 23. AI APIs

After the manual transaction system is stable:

```text
POST /ai/documents
GET  /ai/documents/:id
POST /ai/documents/:id/process
POST /ai/documents/:id/confirm
POST /ai/documents/:id/reject
```

Possible lifecycle:

```text
UPLOADED
    ↓
PROCESSING
    ↓
REVIEW_REQUIRED
    ↓
CONFIRMED
```

Failure/rejection paths:

```text
PROCESSING → FAILED
REVIEW_REQUIRED → REJECTED
```

## 24. Transaction Safety

Purchases and sales must be atomic.

For example, these operations should succeed or fail together:

```text
Purchase created
Purchase items created
Inventory transaction created
Inventory updated
```

Never allow a state where a purchase exists but its corresponding inventory
change did not happen.

Use database transactions.

## 25. Testing Strategy

Prioritize tests around business rules.

### Inventory

```text
Opening stock = 100
Purchase = +50
Sale = -20
Damage = -5

Expected = 125
```

### Insufficient stock

```text
Available = 10
Requested sale = 20

Expected:
Reject transaction
```

### Atomicity

If an inventory update fails:

```text
Purchase/Sale must also rollback
```

### Multi-tenancy

A user belonging to Business A must not access Business B data.

### AI confirmation

AI extraction alone must never modify inventory.

Only confirmed business transactions may modify inventory.

## 26. API Design Principles

### Validate input

Never trust client data.

### Authorize business resources

Authentication alone is not enough.

### Keep controllers thin

Prefer:

```text
Controller → Service
```

### Keep business logic deterministic

AI should not enforce business rules.

### Use transactions

Purchases, sales and inventory changes should be atomic.

### Preserve history

Do not destroy business history unnecessarily.

### Prefer deactivation over deletion

Products, suppliers and customers may have historical references.

## 27. Mobile Application

Frontend stack:

- Expo
- React Native
- Expo Router

Initial screens:

```text
Login
Dashboard
Products
Product Details
Add Product
Add Stock
Sell
Purchases
Purchase Details
Sales
Sale Details
Suppliers
Customers
Transactions
```

Later:

```text
Scan Bill
AI Review
Voice Input
Reports
Insights
```

## 28. Shared Package

The repository contains:

```text
packages/shared
```

This package is framework-agnostic and can contain:

- API types
- Domain types
- Enums
- Shared pure utilities
- Types genuinely shared by backend and frontend

Avoid putting backend-specific code here.

The frontend must not depend directly on Prisma models or NestJS-specific classes.

## 29. Development Order

Follow this order unless there is a strong reason to change it:

```text
1. Project foundation
2. Database setup
3. Authentication
4. Business/User
5. Products
6. Inventory engine
7. Purchases
8. Sales
9. Suppliers
10. Customers
11. Dashboard
12. Tests/API hardening
13. Mobile application
14. AI bill scanning
15. Product matching
16. Voice input
17. Business intelligence
```

## 30. First Backend Milestone

The first major milestone is:

> A user can create a shop, create products, add stock, purchase stock,
> sell products, and accurately see remaining inventory and transaction
> history through APIs.

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

## 31. Future Intelligence

Once sufficient transaction data exists, Invento can provide:

- Low-stock detection
- Purchase recommendations
- Margin analysis
- Fast-moving products
- Slow-moving products
- Purchase trends
- Sales trends
- Price-change intelligence
- Business insights

These should be built after reliable transaction data exists.

## 32. Product Development Rule

Before implementing a new feature, ask:

> **Which real user problem does this solve?**

Then determine whether it belongs to:

- MVP
- AI V1
- Future
- Not required

Do not add features merely because they are technically interesting.

## 33. AI Coding Assistant Rules

Before making significant changes, read:

```text
PROJECT_CONTEXT.md
PROJECT_STRUCTURE.md
```

Then inspect the existing code.

Do not assume the architecture from memory.

Before creating a feature, determine:

1. What user problem does it solve?
2. Which requirement does it belong to?
3. Which module owns it?
4. Does the database need to change?
5. Does the API contract need to change?
6. Does the shared package need to change?
7. Does it affect existing business rules?

Do not blindly implement speculative features.

Avoid:

- Unnecessary libraries
- Duplicate models
- Duplicate business logic
- Premature abstractions
- Speculative features
- AI where deterministic logic is sufficient

Prefer the simplest architecture that satisfies the current requirement.

## 34. Database Change Rule

Before changing the database:

1. Understand the current schema.
2. Check relationships.
3. Check historical data implications.
4. Determine whether inventory calculations are affected.
5. Update documentation.
6. Add/update tests.

Never casually change inventory-related structures.

## 35. API Change Rule

Before changing an existing API:

1. Check the current implementation.
2. Check Swagger/API contract.
3. Check shared types.
4. Check tests.
5. Consider frontend compatibility.
6. Prefer backward-compatible changes when practical.

## 36. Inventory Safety Rule

Any code that modifies stock must be able to answer:

- Why is stock changing?
- What transaction caused it?
- Who caused it?
- What quantity changed?
- Which product is affected?
- Which business owns it?
- Can the operation be rolled back?

Every inventory change must have an understandable business reason.

## 37. Documentation Rule

Important architecture and product changes must be documented.

Recommended documentation:

```text
.github/
├── PROJECT_CONTEXT.md
├── PROJECT_STRUCTURE.md
└── docs/
    ├── PRODUCT.md
    ├── REQUIREMENTS.md
    ├── ROADMAP.md
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── AI.md
    ├── DECISIONS.md
    └── STATUS.md
```

## 38. Definition of Done

A feature is not complete merely because it compiles.

For normal features, aim for:

```text
Implementation
    +
Validation
    +
Authorization
    +
Error handling
    +
Tests
    +
API documentation
    +
Relevant documentation update
```

For business-critical functionality, include transaction/consistency tests.

## 39. Current Development Focus

**Current phase: Backend/API development**

Immediate priorities:

1. Database
2. Authentication
3. Business/User
4. Products
5. Inventory
6. Purchases
7. Sales
8. Suppliers
9. Customers
10. Dashboard
11. Tests
12. API documentation

AI features come after the core business system is stable.

## 40. What Success Looks Like

The first meaningful version of Invento should allow a shopkeeper to manage
daily inventory without complicated software.

Core workflow:

```text
Create Shop
    ↓
Add Products
    ↓
Add Opening Stock
    ↓
Record Purchases
    ↓
Record Sales
    ↓
View Current Stock
    ↓
View Transaction History
    ↓
Understand Daily Business Activity
```

Then reduce manual effort progressively:

```text
Manual Entry
     ↓
Bill Scanning
     ↓
AI Understanding
     ↓
Product Matching
     ↓
Voice Input
     ↓
Automated Suggestions
     ↓
Business Intelligence
```

## 41. Golden Rules

Always preserve these priorities:

```text
1. User simplicity
2. Data correctness
3. Inventory consistency
4. User control over AI
5. Maintainable architecture
6. Incremental development
7. AI only where it provides real value
```

Do not sacrifice inventory correctness or user trust merely to make AI appear
more autonomous.
