# Monorepo directory migration

## Move map

| Previous location/name | Current location/name |
| --- | --- |
| `backend`, package `backend` | `apps/api`, package `@invento/api` |
| `frontend`, package `frontend` | `apps/mobile`, package `@invento/mobile` |
| `admin` | `apps/admin`, package `@invento/admin` |
| `figma_design` | `design/figma` |
| `UX_DESIGN_CONTEXT.md` | `design/UX_DESIGN_CONTEXT.md` |
| `.github/docs/*` and project-context documents | `docs/*` |

`@invento/shared` stays at `packages/shared`. App dependency references are now `file:../../packages/shared`; imports using `@invento/shared` keep their public names. App-internal imports and the mobile `@/` alias remain local to their apps and need no extra parent traversal.

## Identity and data preservation

The actual Expo configuration moved with the mobile application. Its name, slug, scheme, Android application ID, plugins and assets were preserved. No new application or Expo project was created. The generated Android tree moved intact to `apps/mobile/android`; generated native paths/caches may need regeneration before a native binary build. The redundant root Android/iOS directories and the nested frontend directory contained no files and were removed.

The old root `app.json` and Expo-only root TypeScript stub are retained under `docs/migration/` as historical metadata, not active configuration. The root TypeScript config is now neutral; apps own their compiler settings. The unrelated root Expo cache and old app-local npm lockfile were preserved outside the repository at `/private/tmp/invento-layout-backup-a707b055`. The app's actual `.expo` cache and app-local environment files moved with the app.

Database schemas, migration identifiers, account data, business data, deep-link schemes and Docker database/upload/Redis volumes are unchanged by the directory move. Docker retains the `backend` service and `invento-backend` container names for compatibility. Source and dependency mount targets now use `/app/apps/api` and the root workspace dependency tree. No database reset or volume deletion is part of this migration.

## Tooling

- Install at the root with `npm ci`; the root `package-lock.json` is now tracked. App-local lockfiles are ignored.
- API tests live under `apps/api/src`; mobile service tests have `apps/mobile/vitest.config.mts` and their own `test` command. Root `npm test` runs both.
- Docker installs the API/shared workspaces using the root lockfile. Root manifest/lockfile bind mounts allow local dependency changes to be used on recreation.
- The Android APK helper still writes to root `builds/`, accounting for the deeper app path.
- VS Code's Expo launch configuration points to `apps/mobile`.
- Existing root backend/frontend script names remain aliases; new commands use api/mobile/admin.

## Local processes after moving

Restart any Vite, Metro or Nest processes launched from the old directories. Use `npm run dev:admin`, `npm run dev:mobile` or `npm run dev:api` from the root. For the Docker API, recreate its container with the new source mounts using `docker compose up -d --build backend`, or use `npm run docker:dev` for watch mode. This preserves database/upload/Redis volumes; do not use `down --volumes` for a directory migration.

A device-only build is intentionally separate from centralized accounts. Use `EXPO_PUBLIC_LOCAL_ONLY=false` and the correct public API URL for centralized access. Existing environment values were not changed by this restructuring.

## Verification completed

- A clean `npm ci --ignore-scripts --offline` installed the renamed workspaces from the root lockfile; Prisma was regenerated afterward.
- API unit tests: 180 passed. Mobile service/model tests: 53 passed. The split preserves all 233 existing tests.
- The 12 focused PostgreSQL authorization/migration tests pass from `@invento/api` against the isolated test database.
- Root type checks, API/mobile lint, and shared/API/admin/Expo-web production builds pass.
- Android and iOS JavaScript exports pass from the relocated Expo app. Native APK/IPA binaries were not rebuilt.
- Compose configuration validates and the API image builds with app-local environment files excluded. The local API container was recreated with the new mounts and the existing data volumes preserved.
- Vite and Expo were restarted on ports 5173/8081. The admin proxy reports a healthy API/database; an empty login request reaches NestJS and returns its expected 422 validation response.
