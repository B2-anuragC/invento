# Task: Web user creation (registration on the web panel)

Branch: `feature/web-user-creation` · Companion docs: [test-cases.md](test-cases.md) (TDD spec), [result.md](result.md) (definition of done)

## 1. Goal

A new user can create an Invento account from the web panel (`apps/admin`) and go straight on to create their first shop, the same way they do in the mobile app. The account works in both places: a user who registers on the web can sign in on the phone, and the other way round.

## 2. The mobile flow we copy

| Step | Mobile today | Source |
|---|---|---|
| 1. Entry | Welcome screen → **Create account** | [apps/mobile/app/index.tsx](../../../apps/mobile/app/index.tsx) |
| 2. Account | Fields: **Your name**, **Email address**, **Password** + hint *"At least 8 characters, with uppercase and lowercase letters, a number, and a symbol."* Checked on submit, not by disabling the button (so browser autofill still works). | [apps/mobile/app/auth/register.tsx](../../../apps/mobile/app/auth/register.tsx), [services/auth-validation.ts](../../../apps/mobile/services/auth-validation.ts) |
| 3. Client checks | Name trimmed ≥ 2 → *"Enter your name (at least 2 characters)."*; email blank → *"Enter your email address."*; password blank → *"Create a password."* The server enforces password strength. | `registerError()` |
| 4. Submit | `POST /auth/register` → session (access and refresh tokens) → **Choose your shop** screen | `registerWithEmail()` |
| 5. Shop | No memberships → *"No business is linked to this account yet."* + **Create a business**: **Business name** (max 120), **Unique shop ID** (max 80, filled in from the name until the user edits it). **Create shop** stays disabled until both are ≥ 2 characters. | [apps/mobile/app/business/setup.tsx](../../../apps/mobile/app/business/setup.tsx) |
| 6. Create | `POST /businesses` → user becomes OWNER (the server also creates the default roles, a walk-in customer and an audit entry) → dashboard of the new shop | `BusinessesService.create` |
| 7. Re-entry | Sign-in with 0 shops → shop setup screen (not an error) | `handleSignIn` in `index.tsx` |

Not copied: **guest mode** (it stores the shop on the phone only, so it has no meaning on the web).

## 3. Current web gaps

1. [apps/admin/src/main.tsx](../../../apps/admin/src/main.tsx) only has a sign-in form. There is no `#/register` route and no link to one.
2. [apps/admin/src/api.ts](../../../apps/admin/src/api.ts) `login()` **rejects** accounts with no shops (*"This panel requires an active business member…"*). A user who has just registered has no shop yet, so they would be locked out. This must change.
3. The web has no screen for creating a shop.
4. A duplicate shop ID returns the generic 409 *"A resource with these unique fields already exists."* ([http-exception.filter.ts](../../../apps/api/src/common/filters/http-exception.filter.ts)). This is unclear on both mobile and web.
5. The web error mapper ([errors.ts](../../../apps/admin/src/errors.ts)) has no rule for `password is not strong enough`, so users see *"Password is not strong enough."* with no hint about what is required.
6. The shop-ID logic (`toSlug`) exists only inside the mobile screen, so web and mobile could drift apart.

## 4. Scope

### In scope
- Web pages for account creation (`#/register`) and shop setup (`#/setup`), plus links to and from the sign-in page.
- Web sign-in with 0 shops goes to `#/setup` instead of failing.
- Members who already have shops can create another one from the web (on the same `#/setup` page, as on mobile).
- Rules shared between web and mobile in `packages/shared` (form validation, shop ID, messages).
- An API change for a clear "shop ID taken" message, and server-side clean-up of shop IDs that keeps old requests working.
- Mobile switches to the shared helpers (same behaviour, one source).
- Tests at every layer (see test-cases.md) and doc updates.

### Out of scope (explicit non-goals)
- Email verification, password reset, MFA, CAPTCHA and rate limiting. Mobile doesn't have them either; the [admin README](../../../apps/admin/README.md) "Known limits" section already notes the missing rate limiting.
- Asking for a phone number at registration. The API accepts it, but mobile doesn't ask for it.
- Keeping the web session across a page reload. Tokens stay in memory only, as they do now.
- Guest mode on the web.
- Self-service platform-admin rights. Registration can never grant `isPlatformAdmin`.

## 5. Design decisions

| # | Decision | Why |
|---|---|---|
| D1 | Hash routes `#/register` (signed out) and `#/setup` (signed in, not a platform admin). | Same as the existing hash routing. No SPA rewrite needed when deployed. |
| D2 | `login()` returns `PanelAccess` even when `shops` is empty. The app routes with `entryRoute(access)`. | Same as mobile re-entry. Users who registered but closed the tab before creating a shop can still finish. |
| D3 | Platform admins never see `#/setup` (they are redirected to `#/overview`). | Admins manage shops through the directory. Their access does not come from shop membership. |
| D4 | The client checks the form when it is **submitted**, reading the `FormData`. The form uses `noValidate`. | Same reason as mobile: autofill. It also means the app's own messages show instead of the browser's pop-ups. |
| D5 | Form validation, the shop-ID helper and the messages move to `packages/shared`. Mobile re-exports them from its existing modules. | One source of truth, so both apps give the same answers. |
| D6 | The API **normalizes** the slug with `shopIdFrom()` and rejects only if the result is shorter than 2 characters. It does not reject non-normalized input. | Moving a guest shop on the phone replays the original `POST /businesses` with the slug the phone made earlier, and existing clients may send old formats. Strict rejection could break that move. |
| D7 | A unique-constraint violation on `Business.slug` → 409 `SHOP_ID_TAKEN_MESSAGE`. | Clear message on both apps. |
| D8 | After a shop is created, the web calls `/auth/panel-access` again and goes to `#/shops/<id>`. | Mobile opens the new shop's dashboard; this is the web equivalent. The sidebar and shop switcher then include the new shop. |
| D9 | Diacritics are folded in shop IDs (`Café` → `cafe`). Mobile's current `toSlug` drops them (`caf`). | Uses the existing shared `slugify`. A small improvement that mobile also gets. |

## 6. Changes by area

### 6.1 `packages/shared`

**New `src/auth-validation.ts`** (moved from mobile, without changing what it does)
```ts
export const PASSWORD_RULE_HINT = 'At least 8 characters, with uppercase and lowercase letters, a number, and a symbol.';
export const PASSWORD_RULE_MESSAGE = 'Use a stronger password: at least 8 characters, with uppercase and lowercase letters, a number, and a symbol.';
export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists.';
export function signInError(input: { email: string; password: string }): string;
export function registerError(input: { name: string; email: string; password: string }): string;
```

**New `src/shop-id.ts`**
```ts
export const SHOP_NAME_MAX = 120;
export const SHOP_ID_MIN = 2;
export const SHOP_ID_MAX = 80;
export const SHOP_ID_TAKEN_MESSAGE = 'This shop ID is already taken. Choose a different one.';
export const SHOP_ID_RULE_MESSAGE = 'Use at least 2 letters or numbers for the shop ID.';
/** slugify() capped at SHOP_ID_MAX, with no hyphen left at either end after the cut. */
export function shopIdFrom(value: string): string;
/** True when the name (trimmed) and the ID are both at least 2 characters. */
export function canCreateShop(input: { name: string; shopId: string }): boolean;
```
- Export both modules from `src/index.ts`.
- Specs: `src/auth-validation.spec.ts`, `src/shop-id.spec.ts` (vitest).

### 6.2 `apps/api`

- **[businesses.service.ts](../../../apps/api/src/businesses/businesses.service.ts) `create()`**
  - `const slug = shopIdFrom(input.slug)`. If `slug.length < SHOP_ID_MIN`, throw `BadRequestException(SHOP_ID_RULE_MESSAGE)`.
  - Catch Prisma `P2002` whose `meta.target` includes `slug` and throw `ConflictException(SHOP_ID_TAKEN_MESSAGE)`. Other errors pass through unchanged, and the transaction still rolls back as a whole (no orphan roles, walk-in customer or membership).
- **Auth**: no change to `register()`. Add spec coverage for the paths that aren't tested yet (duplicate email, trimming, password is hashed, platform-admin flag not settable).
- **e2e**: new `test/registration.e2e-spec.ts` (runs only when `RUN_DATABASE_TESTS=1`, like the other DB suites). It covers register → panel-access (empty) → create shop → panel-access (1 shop, OWNER), duplicates, and protection against injected fields.

### 6.3 `apps/admin` (web)

| File | Change |
|---|---|
| `src/registration.ts` **(new)** | Pure, testable logic: `entryRoute(access)`, `guardRoute(route, access)`, `nextShopId(state, input)` (auto-fill until the user edits the ID), `networkErrorMessage(err)`. |
| `src/onboarding.tsx` **(new)** | `RegisterPage` and `ShopSetupPage` components, using the existing `.login` layout. |
| [src/api.ts](../../../apps/admin/src/api.ts) | Add `register({name,email,password})` (stores tokens, then calls `/auth/panel-access`) and `createShop({name, slug})` (POST `/businesses`, then calls `/auth/panel-access` again, returns `{ shop, access }`). `login()` stops throwing when there are 0 shops. Add a single-flight guard so a double submit sends one request. |
| [src/main.tsx](../../../apps/admin/src/main.tsx) | Signed out: `#/register` shows `RegisterPage`, any other route shows sign-in. Signed in: send through `guardRoute`. `#/setup` shows `ShopSetupPage` in a minimal shell (brand + **Sign out**, no sidebar). The sign-in page gets the link *"New to Invento? Create an account"*. |
| [src/shop.tsx](../../../apps/admin/src/shop.tsx) | The "Your businesses" heading gets an **Add a business** link to `#/setup`. |
| [src/errors.ts](../../../apps/admin/src/errors.ts) | Rule `/^is not strong enough$/` → `PASSWORD_RULE_MESSAGE`. |
| [src/page-title.ts](../../../apps/admin/src/page-title.ts) | `#/register` → `Create account · Invento admin`; `#/setup` → `Create your shop · Invento admin`. |
| [src/style.css](../../../apps/admin/src/style.css) | Small additions: `.form-hint`, `.form-switch` (the link between sign-in and create account), and the setup list of existing shops. Reuse the `.login*` tokens. |
| `test/registration.test.mjs`, `test/errors.test.mjs`, `test/page-title.test.mjs` | node:test unit tests (see test-cases.md). |

**Copy (matches mobile word for word unless noted):**
- Register: eyebrow `CREATE ACCOUNT`, heading **Create your account**, sub *"Set up your account first. You can add your shop next."*, labels **Your name / Email address / Password**, placeholder *"Create a strong password"*, hint `PASSWORD_RULE_HINT`, button **Create account** / **Creating account…**, footer *"Already have an account? Sign in"*.
- Setup: heading **Choose your shop** (with 0 shops: **Create your shop**, web only, because the user has nothing to choose yet), sub *"Business data stays separate for each shop you belong to."*, empty *"No business is linked to this account yet."*, section **Create a business**, hint *"Use your shop name. You can update the details later."*, labels **Business name** (placeholder *"e.g. Shree Aluminium & Hardware"*) and **Unique shop ID** (placeholder *"shree-aluminium"*), button **Create shop** / **Creating…**.

**Form attributes:** `name` uses `autoComplete="name" maxLength=100`; `email` uses `type="email" autoComplete="email"`; `password` uses `type="password" autoComplete="new-password"`. The form has `noValidate`. Errors appear in `<p role="alert" className="error">`. Editing any field clears the error. Shop name `maxLength=120`, shop ID `maxLength=80` with `autoCapitalize="none" spellCheck={false}`.

### 6.4 `apps/mobile`
- `services/auth-validation.ts` re-exports `signInError` and `registerError` from `@invento/shared`. Its existing spec must still pass unchanged.
- `app/business/setup.tsx`: replace the local `toSlug` with `shopIdFrom`, and the inline `>= 2` checks with `canCreateShop`.
- `app/auth/register.tsx`: hint text from `PASSWORD_RULE_HINT`.
- No change to navigation or UX.

### 6.5 Docs
- [apps/admin/README.md](../../../apps/admin/README.md): replace "Use an existing Invento account" with the self-registration flow, and note that 0-shop accounts now go to setup.
- [docs/AUTHORIZATION.md](../../AUTHORIZATION.md): state that registering on the web grants no platform rights, and that creating a shop grants OWNER of that shop only.
- [docs/STATUS.md](../../STATUS.md): add the feature entry.

## 7. Implementation order (TDD)

Each step: write the tests from test-cases.md (they fail), implement, make them pass, run `npm test`.

1. **Shared**: SH-01…SH-19, then `auth-validation.ts` and `shop-id.ts`. Build shared.
2. **Mobile adopts shared**: MOB-01…MOB-04 (the existing mobile specs must still pass).
3. **API**: API-01…API-14 unit tests, then E2E-01…E2E-12 (DB).
4. **Web logic**: WEB-U-01…WEB-U-26 (`registration.ts`, `errors.ts`, `page-title.ts`, `api.ts` with mocked `fetch`).
5. **Web UI**: `onboarding.tsx` and the `main.tsx` routing, then the manual/browser checks WEB-UI-01…WEB-UI-30.
6. **Regression**: REG-01…REG-10.
7. Docs, then go through every row of result.md.

## 8. Risks and how they're handled

| Risk | Handling |
|---|---|
| Moving a guest shop replays old slugs | D6: normalize, don't reject. Test API-09 and E2E-10. |
| Removing the 0-shop sign-in rejection opens the panel to users with no shop | They can only reach `#/setup`. All shop APIs still check membership per request (`requireBusinessMembership`). Tests WEB-U-05 and E2E-08. |
| A user whose only shop was suspended now sees setup instead of an error | Same as mobile today. The setup page lists only active memberships. Noted in result.md. |
| Bots can create accounts (no CAPTCHA or rate limit) | This risk already exists through the mobile API, so it is not new. Track it separately. |
| Double submit creates two shops | Single-flight in `api.ts` and the button disabled while busy. Tests WEB-U-20 and WEB-UI-14. |
| Reload loses the in-memory session part-way through the flow | Sign in again, then `entryRoute` returns the user to `#/setup`. Test WEB-UI-22. |

## 9. Coverage areas (summary)

| Area | Layer | Test IDs |
|---|---|---|
| Form validation rules | shared unit | SH-01–SH-08 |
| Shop ID generation | shared unit | SH-09–SH-19 |
| Mobile parity | mobile unit | MOB-01–MOB-04 |
| Register service | api unit | API-01–API-07 |
| Business create service | api unit | API-08–API-14 |
| Full HTTP flow + security | api e2e (DB) | E2E-01–E2E-12 |
| Routing, auto-fill, error text, titles, API client | web unit | WEB-U-01–WEB-U-26 |
| Screens, keyboard, accessibility, sessions | web manual/browser | WEB-UI-01–WEB-UI-30 |
| Existing behaviour kept | regression | REG-01–REG-10 |
