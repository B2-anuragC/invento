# Invento — Project Structure

Invento is an npm-workspaces monorepo containing a NestJS backend, an Expo
Router frontend, and a framework-agnostic shared package.

## Repository

```text
invento/

├── package.json
├── package-lock.json
├── PROJECT_CONTEXT.md
├── PROJECT_STRUCTURE.md
│
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   └── app.controller.spec.ts
│   ├── test/
│   │   └── app.e2e-spec.ts
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── vitest.config.ts
│   └── vitest.config.e2e.ts
│
├── frontend/
│   ├── package.json
│   ├── app.json
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── modal.tsx
│   │   └── (tabs)/
│   │       ├── _layout.tsx
│   │       ├── index.tsx
│   │       └── explore.tsx
│   ├── components/
│   │   ├── ui/
│   │   └── haptic-tab.tsx
│   ├── constants/
│   ├── hooks/
│   ├── assets/images/
│   ├── scripts/
│   ├── eslint.config.js
│   └── tsconfig.json
│
└── packages/
    └── shared/
        ├── package.json
        ├── src/
        │   ├── index.ts
        │   ├── types/
        │   └── utils/
        └── tsconfig.json
```

## Workspaces

### `backend`

NestJS API.

Build:

```bash
npm run build:backend
```

### `frontend`

Expo SDK 57 / React Native application using Expo Router.

Start:

```bash
npm run start:frontend
```

### `packages/shared`

Package name:

```text
@invento/shared
```

This package contains framework-agnostic shared types and utilities used by
backend and frontend.

Do not put NestJS-specific or Prisma-specific implementation here.

## Root Commands

```bash
npm install
npm start
npm run build
npm test
```

Meaning:

- `npm install` — install workspace dependencies
- `npm start` — build shared code and run backend/frontend together
- `npm run build` — build shared, backend, and frontend
- `npm test` — run backend tests and frontend lint

## Architectural Relationship

```text
                    Invento
                       │
          ┌────────────┴────────────┐
          │                         │
       Backend                   Frontend
       NestJS                  Expo Router
          │                         │
          └──────────┬──────────────┘
                     │
              @invento/shared
```

The backend is currently the primary development focus.

## Backend Module Direction

As the backend grows, organize business functionality into modules such as:

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

Do not create all modules speculatively. Add modules as the corresponding
product capability is implemented.

## Generated Files

Generated/runtime folders are intentionally excluded from this document,
including:

- `node_modules`
- Expo `.expo` data
- Build output
- Other generated artifacts

## Structure Change Rule

When the repository structure changes materially, update this document.

Do not use this document as a substitute for product requirements. For product
and development decisions, use `PROJECT_CONTEXT.md` and the documents under
`.github/docs/`.
