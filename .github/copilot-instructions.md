# Invento — GitHub Copilot Instructions

## Before making changes

Before making significant changes to the codebase:

1. Read `.github/PROJECT_CONTEXT.md`.
2. Read `.github/PROJECT_STRUCTURE.md`.
3. Read the relevant documentation under `.github/docs/`.
4. Inspect the existing implementation before creating or modifying files.
5. Follow the architecture and decisions documented in `.github/docs/ARCHITECTURE.md` and `.github/docs/DECISIONS.md`.
6. Do not assume that something is missing just because it is not documented. Inspect the existing code first.

## Architecture

Invento is a multi-tenant inventory and business management application.

Backend:

* NestJS
* TypeScript
* PostgreSQL
* Prisma
* REST APIs

Frontend:

* React Native
* Expo
* Expo Router

Shared:

* `@invento/shared`

Follow the existing project structure unless there is a documented reason to change it.

## Backend rules

Keep the following separation:

Controller
→ Service
→ Prisma / Repository
→ Database

Controllers should remain thin.

Business logic should live in services/domain logic.

Validate all incoming data.

Every business-owned resource must be checked against the authenticated user's business membership.

Never trust a `businessId` supplied by the client without authorization validation.

## Multi-tenancy

Invento supports multiple businesses.

Always consider:

1. Is the user authenticated?
2. Does the user belong to this business?
3. Does the user's role allow this operation?
4. Does the requested resource belong to this business?

Never expose data belonging to another business.

## Inventory rules

Inventory is business-critical.

Do not directly modify stock quantities from arbitrary services or controllers.

Inventory changes must follow the inventory transaction model documented in:

`.github/docs/DATABASE.md`

Examples of inventory-affecting operations:

* Purchase
* Sale
* Return
* Damage
* Expiry
* Adjustment
* Opening stock

Purchases and sales must maintain database consistency using transactions.

Never allow AI processing to directly modify inventory.

## AI rules

AI is an interpretation layer, not the source of truth.

The AI flow should be:

Input
→ AI processing
→ Structured proposal
→ Product matching
→ User review
→ User confirmation
→ Normal business transaction
→ Inventory update

AI must never directly mutate inventory.

AI-generated values must be validated by the backend before being used.

## Database rules

Use PostgreSQL and Prisma according to the existing schema and documented database architecture.

Use appropriate numeric database types for:

* Money
* Quantity

Do not use floating-point numbers for monetary values.

Prefer deactivation/soft deletion for important historical business entities rather than physically deleting records when historical transactions depend on them.

Use JSON/JSONB only where appropriate, such as raw AI output or metadata. Important business data should remain relational.

## API rules

Follow REST conventions.

Use consistent:

* HTTP status codes
* request validation
* response structures
* error handling
* authentication
* authorization

Update Swagger/OpenAPI documentation when appropriate.

## Testing

When changing business logic, update or add tests.

Pay particular attention to:

* Inventory calculations
* Insufficient stock
* Purchase transactions
* Sales transactions
* Transaction rollback
* Multi-tenant isolation
* Authorization
* AI confirmation flow

Do not consider a business-critical feature complete without appropriate tests.

## Shared package

Use `@invento/shared` for framework-independent shared types, enums, and pure utilities.

Do not put:

* Prisma models
* NestJS providers
* NestJS decorators
* Backend infrastructure
* Database-specific code

into the shared package.

## Change discipline

Before implementing a feature:

1. Understand the requirement.
2. Inspect relevant existing code.
3. Check the relevant documentation.
4. Identify affected modules.
5. Implement the smallest appropriate change.
6. Add/update tests.
7. Run relevant checks.
8. Update documentation when architecture or important decisions change.

Do not unnecessarily rewrite existing code.

Do not introduce new libraries or architectural patterns without a clear reason.

## Documentation

When an architectural decision changes, update:

`.github/docs/DECISIONS.md`

When database architecture changes, update:

`.github/docs/DATABASE.md`

When product requirements change, update:

`.github/docs/REQUIREMENTS.md`

When project status changes significantly, update:

`.github/docs/STATUS.md`

## Important

The documentation describes the intended architecture, but the existing code is the source of truth for what is currently implemented.

Always inspect the repository before making assumptions.

If requirements conflict with existing architecture or documentation, explain the conflict before making a large architectural change.
