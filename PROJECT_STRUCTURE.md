# Invento monorepo

Invento uses npm workspaces. Runnable applications live in `apps/`; framework-independent code lives in `packages/`.

```text
invento/
├── apps/
│   ├── api/                     # @invento/api — NestJS, Prisma, PostgreSQL
│   │   ├── src/                 # Auth, authorization, business modules, sync, files
│   │   ├── prisma/              # Schema and versioned migrations
│   │   ├── test/                # PostgreSQL/HTTP integration tests
│   │   ├── scripts/
│   │   └── Dockerfile
│   ├── admin/                   # @invento/admin — React + Vite web admin
│   │   └── src/
│   └── mobile/                  # @invento/mobile — Expo for Android, iOS and web
│       ├── app/                 # Expo Router routes
│       ├── components/
│       ├── services/            # API, offline storage/sync, service tests
│       ├── hooks/
│       ├── constants/
│       ├── assets/
│       ├── plugins/
│       ├── scripts/
│       └── app.json             # Authoritative Expo configuration
├── packages/
│   └── shared/                  # @invento/shared — types, permissions, utilities
├── docs/                        # Setup, architecture, decisions and product context
├── design/                      # UX context and Figma reference assets
├── .github/                     # GitHub-specific configuration
├── docker-compose.yml
├── docker-compose.dev.yml
├── package.json                 # Workspace commands
└── package-lock.json            # Authoritative dependency lockfile
```

Native `android/` and `ios/` directories, when generated or maintained, belong inside `apps/mobile/`. `node_modules/`, `.expo/`, `dist/`, native build outputs and root `builds/` APK artifacts are generated and ignored.

## Workspace commands

Run from the repository root:

```sh
npm ci
npm run dev                     # API, mobile, admin and shared compiler watch
npm run dev:api
npm run dev:mobile
npm run dev:admin
npm run build                   # Shared, API, Expo web export, admin
npm test                        # API tests, mobile service tests, admin types, mobile lint
npm run typecheck
npm run lint
npm run docker:dev              # PostgreSQL, Redis and API; run clients separately
```

Use `npm --workspace @invento/api run prisma:generate` and `npm --workspace @invento/api run prisma:migrate:deploy` for database tooling. The Docker service/container and persistent-volume names remain unchanged to preserve existing local infrastructure.

Each app owns its source, environment file, app-specific dependencies, build configuration and tests. Cross-app code is imported through `@invento/shared`; applications must not import another app's implementation. The API and mobile test commands discover only their own tests.

`start:backend`, `start:frontend`, `start:admin`, `build:backend`, `build:frontend`, `test:backend` and `test:frontend` remain compatibility aliases. Prefer the `api`, `mobile` and `admin` command names for new tooling.

For the move map, preserved Expo identifiers, local restart instructions and validation, see [the migration notes](docs/MONOREPO_MIGRATION.md).
