# Invento — Architecture

## Current Stack

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma

### Frontend

- Expo
- React Native
- Expo Router

### Shared

- `@invento/shared`
- Framework-agnostic TypeScript types/utilities

## High-Level Architecture

```text
Mobile App
    ↓
NestJS REST API
    ↓
Application Services
    ↓
Prisma
    ↓
PostgreSQL
```

AI later becomes an input/interpretation layer:

```text
Image / Voice
      ↓
AI Processing
      ↓
Structured Proposal
      ↓
Product Matching
      ↓
User Confirmation
      ↓
Normal Business Service
      ↓
Inventory Transaction
```

## Backend Module Direction

```text
auth
users
businesses
products
suppliers
customers
inventory
purchases
sales
dashboard
ai
common
prisma
```

## Layering

Preferred flow:

```text
Controller
    ↓
Service
    ↓
Prisma / Repository
    ↓
Database
```

Controllers should handle HTTP concerns.

Services should contain business logic.

## Multi-Tenancy

Business-owned entities should be scoped to `business_id`.

Every request must verify:

1. User is authenticated.
2. User belongs to the business.
3. User has sufficient permissions.
4. Requested entity belongs to that business.

## Inventory Architecture

```text
Purchase / Sale / Adjustment
          ↓
Inventory Transaction
          ↓
Current Inventory Projection
```

Inventory transactions are the source of truth.

The current inventory table is a fast-access representation.

## AI Architecture Rule

AI interprets.

The backend validates and executes.

AI must not directly update inventory.

## Shared Package Rule

`@invento/shared` should remain framework-agnostic.

It may contain:

- Types
- Enums
- Pure utility functions

It should not contain:

- Prisma models
- NestJS providers
- NestJS decorators
- Backend infrastructure
