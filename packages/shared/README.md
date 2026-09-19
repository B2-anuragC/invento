# Shared package

`@invento/shared` contains code that is safe to use from both the NestJS
backend and the Expo frontend. Keep this package framework-agnostic: do not
add NestJS, React Native, or platform-specific dependencies here.

## Imports

```ts
import type { ApiResponse, PaginatedResponse } from '@invento/shared/types';
import { isDefined, slugify } from '@invento/shared/utils';
```

- `src/types` contains shared API contracts and domain primitives.
- `src/utils` contains runtime helpers that do not depend on either app.

Build it with `npm run build:shared` before running compiled backend output.
