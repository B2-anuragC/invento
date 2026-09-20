# Invento — Current Status

## Current Phase

**Phase 3 — Products (completed)**

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
5. Inventory
6. Purchases
7. Sales
8. Suppliers
9. Customers
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
