# Invento

An npm-workspaces monorepo for the Invento inventory platform.

| Workspace | Location | Stack |
| --- | --- | --- |
| `@invento/api` | `apps/api` | NestJS, Prisma, PostgreSQL, existing Redis file queue |
| `@invento/admin` | `apps/admin` | React, TypeScript, Vite |
| `@invento/mobile` | `apps/mobile` | Expo, React Native, Expo Router; Android/iOS/web |
| `@invento/shared` | `packages/shared` | Shared TypeScript types, permissions and utilities |

## Start development

Run `npm ci` at the repository root. Configure the app-local environment files using their examples. Start PostgreSQL and Redis, generate Prisma, and apply the existing migrations to your chosen development database before starting the API.

```sh
npm run build:shared
npm --workspace @invento/api run prisma:generate
npm --workspace @invento/api run prisma:migrate:deploy
npm run dev
```

The admin runs on port 5173 and proxies `/api` to the API on port 3000. Expo serves the mobile app and its web target. Configure a device-reachable API URL when testing on a phone.

Alternatively, `npm run docker:dev` runs PostgreSQL, Redis and the API. In other terminals use `npm run dev:admin` and `npm run dev:mobile`. Do not start a second host API on port 3000 while the Docker API is running.

## Verify

```sh
npm test
npm run typecheck
npm run lint
EXPO_PUBLIC_LOCAL_ONLY=false npm run build
```

Database integration tests require an isolated migrated test database; see [authorization testing](docs/AUTHORIZATION.md).

- [Directory structure and commands](PROJECT_STRUCTURE.md)
- [Monorepo migration notes](docs/MONOREPO_MIGRATION.md)
- [Docker development](docs/DOCKER_DEVELOPMENT.md)
- [Authorization](docs/AUTHORIZATION.md)
- [Design references](design/UX_DESIGN_CONTEXT.md)

This restructuring does not introduce NativeWind, Tailwind or a new shared UI library. Those can be added separately after the layout is stable.
