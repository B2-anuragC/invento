# Invento Project Structure

Invento is an npm-workspaces monorepo with a NestJS backend, an Expo Router frontend, and a framework-agnostic shared package.

```text
invento/
├── package.json                  # Root workspace scripts and orchestration
├── package-lock.json             # Root dependency lockfile
├── PROJECT_STRUCTURE.md          # This project context document
├── backend/                      # NestJS API
│   ├── package.json              # Backend scripts and dependencies
│   ├── src/
│   │   ├── main.ts               # API bootstrap
│   │   ├── app.module.ts         # Root Nest module
│   │   ├── app.controller.ts     # Example API controller
│   │   ├── app.service.ts        # Example service
│   │   └── app.controller.spec.ts# Controller unit test
│   ├── test/
│   │   └── app.e2e-spec.ts       # End-to-end test
│   ├── nest-cli.json              # Nest CLI configuration
│   ├── tsconfig.json              # Development TypeScript config
│   ├── tsconfig.build.json        # Production build TypeScript config
│   ├── vitest.config.ts           # Unit test configuration
│   └── vitest.config.e2e.ts       # E2E test configuration
├── frontend/                     # Expo React Native application
│   ├── package.json              # Frontend scripts and dependencies
│   ├── app.json                  # Expo application configuration
│   ├── app/
│   │   ├── _layout.tsx           # Root navigation/theme layout
│   │   ├── modal.tsx              # Modal route
│   │   └── (tabs)/
│   │       ├── _layout.tsx       # Tab navigator layout
│   │       ├── index.tsx         # Home tab
│   │       └── explore.tsx       # Explore tab
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Platform-aware UI primitives
│   │   └── haptic-tab.tsx        # Haptic tab button
│   ├── constants/                # Theme and application constants
│   ├── hooks/                    # Shared React hooks
│   ├── assets/images/            # App icons, splash images, and logos
│   ├── scripts/                  # Frontend maintenance scripts
│   ├── eslint.config.js          # ESLint configuration
│   └── tsconfig.json             # Frontend TypeScript configuration
└── packages/
    └── shared/                   # Shared backend/frontend code
        ├── package.json          # @invento/shared package definition
        ├── src/
        │   ├── index.ts          # Shared package entry point
        │   ├── types/            # Shared API and domain types
        │   └── utils/            # Framework-agnostic runtime helpers
        └── tsconfig.json         # Shared package build configuration
```

## Workspaces

- `backend`: NestJS API, built with `npm run build:backend`.
- `frontend`: Expo SDK 57 app, started with `npm run start:frontend`.
- `packages/shared`: TypeScript package imported as `@invento/shared` by both apps.

## Root Commands

```bash
npm install       # Install all workspace dependencies
npm start         # Build shared code and run backend/frontend together
npm run build     # Build shared, backend, and frontend
npm test          # Run backend tests and frontend lint
```

Generated folders such as `node_modules`, Expo `.expo` data, and build output are intentionally excluded from this document.
