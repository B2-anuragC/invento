# Test cases: Web user creation

Use with [task.md](task.md). Write each group's tests **before** the code they cover. IDs are referenced from task.md and result.md.

| Layer | Runner | File(s) | Command |
|---|---|---|---|
| Shared | vitest | `packages/shared/src/auth-validation.spec.ts`, `shop-id.spec.ts` | `npm run test:shared` |
| Mobile | vitest | `apps/mobile/services/auth-validation.spec.ts` (existing), `shop-details.spec.ts` | `npm run test:mobile` |
| API unit | vitest | `apps/api/src/auth/auth.service.spec.ts`, `businesses/businesses.service.spec.ts` | `npm run test:api` |
| API e2e | vitest + supertest + Postgres | `apps/api/test/registration.e2e-spec.ts` | see the env block in §4 |
| Web unit | node:test | `apps/admin/test/registration.test.mjs`, `errors.test.mjs`, `page-title.test.mjs`, `api.test.mjs` | `npm run test:admin` |
| Web UI | manual / Claude in Chrome | checklist in §6 | `npm run start:backend` + `npm run start:admin` |

---

## 1. Shared: `auth-validation.ts`

| ID | Given / When | Then |
|---|---|---|
| SH-01 | `registerError({ name: '', email: 'a@b.test', password: 'Valid#Pass1' })` | `'Enter your name (at least 2 characters).'` |
| SH-02 | name `' A '` (trims to 1 char) | same message as SH-01 |
| SH-03 | name `'QA Owner'`, email `''` | `'Enter your email address.'` |
| SH-04 | email `'   '` | `'Enter your email address.'` |
| SH-05 | name and email filled, password `''` | `'Create a password.'` (not "Enter your password.") |
| SH-06 | all filled, password `'weak'` | `''` (the server judges strength) |
| SH-07 | name `''` and email `''` | the name message comes first (fields are checked in order) |
| SH-08 | `signInError` cases | blank email → `'Enter your email address.'`; blank password → `'Enter your password.'`; both filled → `''` |

```ts
// packages/shared/src/auth-validation.spec.ts
import { describe, expect, it } from 'vitest';
import { registerError, signInError } from './auth-validation';

describe('registerError', () => {
  it('requires a trimmed name of at least two characters', () => {
    for (const name of ['', ' A ', '  ']) expect(registerError({ name, email: 'a@b.test', password: 'Valid#Pass1' })).toBe('Enter your name (at least 2 characters).');
  });
  it('checks the fields in order: name, email, then password', () => {
    expect(registerError({ name: '', email: '', password: '' })).toBe('Enter your name (at least 2 characters).');
    expect(registerError({ name: 'QA Owner', email: '   ', password: '' })).toBe('Enter your email address.');
    expect(registerError({ name: 'QA Owner', email: 'a@b.test', password: '' })).toBe('Create a password.');
  });
  it('leaves password strength to the server', () => {
    expect(registerError({ name: 'QA Owner', email: 'a@b.test', password: 'weak' })).toBe('');
  });
});
```

## 2. Shared: `shop-id.ts`

| ID | Input to `shopIdFrom` | Expected |
|---|---|---|
| SH-09 | `'Shree Aluminium & Hardware'` | `'shree-aluminium-hardware'` |
| SH-10 | `'  My Shop!  '` | `'my-shop'` |
| SH-11 | `'Café Ñandú'` | `'cafe-nandu'` (diacritics folded, D9) |
| SH-12 | `'---a--b---'` | `'a-b'` |
| SH-13 | `'!!!'`, `''`, `'   '` | `''` |
| SH-14 | `'shree-aluminium'` (already clean) | unchanged (running it twice gives the same result) |
| SH-15 | `'a'.repeat(79) + ' b'` (cut lands on a hyphen) | length ≤ 80, does **not** end with `-` |
| SH-16 | `'x'.repeat(200)` | length exactly 80 |
| SH-17 | `'दुकान 24'` (non-Latin script) | `'24'` (only Latin letters and digits are kept) |

| ID | `canCreateShop` | Expected |
|---|---|---|
| SH-18 | `{ name: 'AB', shopId: 'ab' }` | `true` |
| SH-19 | `{ name: ' A ', shopId: 'ab' }`, `{ name: 'AB', shopId: 'a' }`, `{ name: 'AB', shopId: '' }` | `false` each |

```ts
// packages/shared/src/shop-id.spec.ts
import { describe, expect, it } from 'vitest';
import { canCreateShop, SHOP_ID_MAX, shopIdFrom } from './shop-id';

describe('shopIdFrom', () => {
  it.each([
    ['Shree Aluminium & Hardware', 'shree-aluminium-hardware'],
    ['  My Shop!  ', 'my-shop'],
    ['Café Ñandú', 'cafe-nandu'],
    ['---a--b---', 'a-b'],
    ['!!!', ''],
    ['shree-aluminium', 'shree-aluminium'],
  ])('%s → %s', (input, expected) => expect(shopIdFrom(input)).toBe(expected));

  it('caps at the maximum without leaving a trailing hyphen', () => {
    const id = shopIdFrom('a'.repeat(79) + ' b');
    expect(id.length).toBeLessThanOrEqual(SHOP_ID_MAX);
    expect(id.endsWith('-')).toBe(false);
    expect(shopIdFrom('x'.repeat(200))).toHaveLength(SHOP_ID_MAX);
  });
});

describe('canCreateShop', () => {
  it('needs a 2+ character name and shop ID', () => {
    expect(canCreateShop({ name: 'AB', shopId: 'ab' })).toBe(true);
    expect(canCreateShop({ name: ' A ', shopId: 'ab' })).toBe(false);
    expect(canCreateShop({ name: 'AB', shopId: 'a' })).toBe(false);
  });
});
```

## 3. Mobile parity

| ID | Case | Expected |
|---|---|---|
| MOB-01 | The existing `apps/mobile/services/auth-validation.spec.ts`, unchanged | passes against the re-export |
| MOB-02 | `setup.tsx` has no local `toSlug`, and imports `shopIdFrom` and `canCreateShop` | `grep -n "function toSlug" apps/mobile` finds nothing |
| MOB-03 | Register hint text | equals `PASSWORD_RULE_HINT` |
| MOB-04 | `npm run typecheck:mobile && npm run lint:mobile` | clean |

## 4. API

### 4.1 Unit: `AuthService.register` (`auth.service.spec.ts`)

| ID | Case | Expected |
|---|---|---|
| API-01 | Valid input | returns `accessToken`, `refreshToken`, `user{id,name,email,phone,avatarUrl}`. A refresh-token row is created. *(exists; keep)* |
| API-02 | Email `'  OWNER@Example.com '` | `findUnique` and `create` are called with `'owner@example.com'` |
| API-03 | Name `'  Shop Owner  '` | stored as `'Shop Owner'` |
| API-04 | Existing user with that email | `ConflictException` with message `EMAIL_TAKEN_MESSAGE`. `user.create` is not called. |
| API-05 | Password | the stored `passwordHash` ≠ the plain password, and `verifyPassword(plain, hash)` is true |
| API-06 | Response | contains no `passwordHash`, `isPlatformAdmin` or `sessionVersion` |
| API-07 | `create` data | has no `isPlatformAdmin` key (stays at the DB default `false`) |

### 4.2 Unit: `BusinessesService.create` (`businesses.service.spec.ts`)

| ID | Case | Expected |
|---|---|---|
| API-08 | slug `'shree-aluminium'` | `business.create` gets the slug unchanged. OWNER membership, the default system roles, the walk-in customer and the `BUSINESS_OWNER_CREATED` audit entry are created in the same tx. |
| API-09 | slug `'My Shop!'` | stored as `'my-shop'` (D6: normalized, not rejected) |
| API-10 | slug `'--'` or `'!!'` | `BadRequestException(SHOP_ID_RULE_MESSAGE)`. `business.create` is not called. |
| API-11 | `business.create` throws P2002 with `meta.target: ['slug']` | `ConflictException(SHOP_ID_TAKEN_MESSAGE)` |
| API-12 | P2002 on another target | rethrown unchanged (the filter turns it into the generic 409) |
| API-13 | Account inactive | `ForbiddenException('Account is inactive.')`. Nothing is created. *(guard exists; add the test)* |
| API-14 | Membership insert fails | the error comes through. The transaction callback threw, so nothing is committed. |

```ts
// businesses.service.spec.ts (sketch)
it('reports a taken shop ID in plain words', async () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['slug'] } });
  const tx = txMock({ businessCreate: vi.fn().mockRejectedValue(p2002) });
  await expect(new BusinessesService(prismaWith(tx)).create('u1', { name: 'Shop', slug: 'shop' }))
    .rejects.toThrow(SHOP_ID_TAKEN_MESSAGE);
});
```

### 4.3 E2E with a database (`test/registration.e2e-spec.ts`)

```sh
RUN_DATABASE_TESTS=1 NODE_ENV=test DATABASE_URL='<test-postgres-url>' \
  JWT_ACCESS_SECRET='<32+ chars>' JWT_REFRESH_SECRET='<different 32+ chars>' \
  npm --prefix apps/api run test:e2e -- registration
```
Fixtures use `${randomUUID()}@registration.test` emails and are deleted in `afterAll` (same pattern as `platform-admin.e2e-spec.ts`).

| ID | Request(s) | Expected |
|---|---|---|
| E2E-01 | `POST /api/auth/register` with valid body | 201. `data.accessToken` and `data.refreshToken` present. A DB user exists with a lowercased email and `isPlatformAdmin=false`. |
| E2E-02 | `GET /api/auth/panel-access` with the new token | 200 `{ isPlatformAdmin: false, shops: [] }` |
| E2E-03 | `POST /api/auth/register` with the same email in different case | 409, `error.message === 'An account with this email already exists.'` |
| E2E-04 | `password: 'weakpass'` | 400. `error.details` contains field `password`, message `password is not strong enough`. |
| E2E-05 | `email: 'not-an-email'` | 400, details on `email` |
| E2E-06 | `name: ' '` or `'A'` or 101 chars | 400, details on `name` |
| E2E-07 | Body with an extra `isPlatformAdmin: true` (or `role`) | 400 `property isPlatformAdmin should not exist`. No user created. |
| E2E-08 | New token on `GET /api/businesses/<someone else's id>` | 403 or 404 (no access through registration alone) |
| E2E-09 | `POST /api/businesses {name:'Reg Shop', slug:'reg-<uuid>'}` | 201. Then panel-access lists that one shop. `GET /businesses` shows role `OWNER`. Owner permissions resolve (e.g. `GET /businesses/:id/users` 200). |
| E2E-10 | `POST /api/businesses` with slug `'Reg Shop <uuid>!'` | 201, stored slug `reg-shop-<uuid>` |
| E2E-11 | A second user creates a shop with the slug from E2E-09 | 409 `This shop ID is already taken. Choose a different one.` No orphan business, role or walk-in rows (count before = after). |
| E2E-12 | Sign in with the registered credentials (`POST /auth/login`) | 200. This is the same account the mobile app would use. |

## 5. Web unit (`apps/admin/test/*.test.mjs`, node:test)

### 5.1 Routing: `registration.ts`

`entryRoute(access)`, the default route after sign-in or registration:

| ID | access | Expected |
|---|---|---|
| WEB-U-01 | `{ isPlatformAdmin: true, shops: [] }` | `'/overview'` |
| WEB-U-02 | `{ isPlatformAdmin: false, shops: [] }` | `'/setup'` |
| WEB-U-03 | `{ isPlatformAdmin: false, shops: [s1] }` | `'/shops'` (as today) |

`guardRoute(route, access)`, which returns the route to show (redirects included):

| ID | route | access | Expected |
|---|---|---|---|
| WEB-U-04 | `'/register'` | `null` | `'/register'` |
| WEB-U-05 | `'/setup'` | `null` | `'/login'` (sign-in page) |
| WEB-U-06 | `'/register'` | member with shops | `'/shops'` |
| WEB-U-07 | `'/register'` | member, 0 shops | `'/setup'` |
| WEB-U-08 | `'/shops'` or `'/shops/x'` | member, 0 shops | `'/setup'` (cannot get past setup) |
| WEB-U-09 | `'/setup'` | member with shops | `'/setup'` (allowed: add another shop) |
| WEB-U-10 | `'/setup'` | platform admin | `'/overview'` |
| WEB-U-11 | `'/overview'` | platform admin | `'/overview'` (unchanged) |

`nextShopId(state, change)`, which handles auto-fill:

| ID | Case | Expected |
|---|---|---|
| WEB-U-12 | `edited:false`, name changes to `'Shree Aluminium'` | `shopId 'shree-aluminium'`, `edited:false` |
| WEB-U-13 | user types in the ID field `'My ID'` | `shopId 'my-id'`, `edited:true` |
| WEB-U-14 | `edited:true`, name changes | shopId unchanged |
| WEB-U-15 | user clears the ID field (`''`) | `shopId ''`, `edited:true` (mobile does the same) |

### 5.2 Errors: `errors.ts`

| ID | Body | `apiErrorMessage` |
|---|---|---|
| WEB-U-16 | `{error:{details:[{field:'password',message:'password is not strong enough'}]}}` | `PASSWORD_RULE_MESSAGE` |
| WEB-U-17 | `{error:{details:[{field:'email',message:'email must be an email'}]}}` | `'Enter a valid email address.'` *(exists)* |
| WEB-U-18 | `{error:{message:'An account with this email already exists.'}}`, 409 | that text, unchanged |
| WEB-U-19 | name too short + weak password together | both reasons, one per field, joined with a space |

### 5.3 API client: `api.ts` (stub `globalThis.fetch`)

| ID | Case | Expected |
|---|---|---|
| WEB-U-20 | `register()` is called twice before the first resolves | a single `POST /auth/register` |
| WEB-U-21 | `register()` succeeds | then `GET /auth/panel-access` with `Authorization: Bearer <access>`. Returns `{shops:[]}`. |
| WEB-U-22 | `login()` for a 0-shop member | **resolves** with `{isPlatformAdmin:false, shops:[]}`. No logout call. (Before this change it threw.) |
| WEB-U-23 | `createShop()` | sends `POST /businesses` body `{name, slug}` (trimmed name, normalized slug), then calls panel-access again. Returns `{ shop, access }` with the new shop in `access.shops`. |
| WEB-U-24 | `register()` when fetch rejects with `TypeError` | throws `'Could not reach Invento. Check your connection and try again.'` |
| WEB-U-25 | `register()` 409 | throws `EMAIL_TAKEN_MESSAGE`. Tokens stay empty. |

### 5.4 Titles: `page-title.ts`

| ID | Case | Expected |
|---|---|---|
| WEB-U-26 | signed out on `/register`; signed in on `/setup`; signed out elsewhere | `'Create account · Invento admin'`; `'Create your shop · Invento admin'`; `'Sign in · Invento admin'` |

```js
// apps/admin/test/registration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { entryRoute, guardRoute, nextShopId } from "../src/registration.ts";

const member = (n) => ({ isPlatformAdmin: false, shops: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}`, slug: `s${i}` })) });
const admin = { isPlatformAdmin: true, shops: [] };

test("sends each account to its first page", () => {
  assert.equal(entryRoute(admin), "/overview");
  assert.equal(entryRoute(member(0)), "/setup");
  assert.equal(entryRoute(member(1)), "/shops");
});

test("keeps a member without a shop on setup", () => {
  for (const route of ["/shops", "/shops/x", "/register", "/overview"]) assert.equal(guardRoute(route, member(0)), "/setup");
});

test("lets signed-out visitors reach only sign-in and create account", () => {
  assert.equal(guardRoute("/register", null), "/register");
  assert.equal(guardRoute("/setup", null), "/login");
});

test("offers setup to members, never to platform admins", () => {
  assert.equal(guardRoute("/setup", member(2)), "/setup");
  assert.equal(guardRoute("/setup", admin), "/overview");
});

test("fills the shop ID from the name until the owner edits it", () => {
  let state = { shopId: "", edited: false };
  state = nextShopId(state, { name: "Shree Aluminium" });
  assert.deepEqual(state, { shopId: "shree-aluminium", edited: false });
  state = nextShopId(state, { shopId: "My ID" });
  assert.deepEqual(state, { shopId: "my-id", edited: true });
  assert.equal(nextShopId(state, { name: "Other" }).shopId, "my-id");
});
```

## 6. Web UI scenarios (manual or browser automation)

Setup: `npm run start:backend` and `npm run start:admin`, open http://127.0.0.1:5173. Use a fresh email for each run.

### 6.1 Create account

| ID | Steps | Expected |
|---|---|---|
| WEB-UI-01 | Open the sign-in page | Shows a *"New to Invento? Create an account"* link. Clicking it goes to `#/register`. Tab title is `Create account · Invento admin`. |
| WEB-UI-02 | Look at the form | Labels **Your name**, **Email address**, **Password**. Password hint visible. Button **Create account**. *"Already have an account? Sign in"* link. |
| WEB-UI-03 | Submit with everything empty | Alert: *Enter your name (at least 2 characters).* No network request. No browser validation pop-up. |
| WEB-UI-04 | Name `A`, submit | Same name message |
| WEB-UI-05 | Valid name, blank email | *Enter your email address.* |
| WEB-UI-06 | Name and email filled, blank password | *Create a password.* |
| WEB-UI-07 | Email `abc` | Server message *Enter a valid email address.* |
| WEB-UI-08 | Password `password1` | *Use a stronger password: at least 8 characters, …* |
| WEB-UI-09 | Email already registered (try a different case, too) | *An account with this email already exists.* Form values kept, password included. |
| WEB-UI-10 | After an error, type in any field | Error disappears |
| WEB-UI-11 | Valid form, press **Enter** in the password field | Submits. Button reads **Creating account…** and is disabled. |
| WEB-UI-12 | Success | Lands on `#/setup` with the heading **Create your shop**. *No business is linked to this account yet.* Sign out is visible. No sidebar. |
| WEB-UI-13 | Browser autofill (saved credentials) fills the fields, then submit | Values are accepted. The button was never stuck disabled. |
| WEB-UI-14 | Double-click **Create account** | Network tab shows exactly one `POST /auth/register` |
| WEB-UI-15 | Stop the API, submit | *Could not reach Invento. Check your connection and try again.* Button enabled again. |
| WEB-UI-16 | Name field: paste 150 characters | Only 100 are accepted |

### 6.2 Create shop

| ID | Steps | Expected |
|---|---|---|
| WEB-UI-17 | Type the business name `Shree Aluminium & Hardware` | Unique shop ID updates live to `shree-aluminium-hardware` |
| WEB-UI-18 | Edit the shop ID to `Shree HQ`, then change the name | ID shows `shree-hq` and no longer follows the name |
| WEB-UI-19 | Name `A` or ID shorter than 2 | **Create shop** disabled |
| WEB-UI-20 | Name `!!!` | ID stays empty and the button is disabled until the user types an ID |
| WEB-UI-21 | Shop ID already used by another account | *This shop ID is already taken. Choose a different one.* Inputs kept. Changing the ID and retrying works. |
| WEB-UI-22 | Reload the page on `#/setup` | Sign-in page. Signing in with the new credentials returns to `#/setup` (not an error). |
| WEB-UI-23 | Valid shop, **Create shop** (double-click) | One `POST /businesses`. Lands on `#/shops/<id>` (overview). Sidebar shows **Businesses**. Tag reads *Business member*. Tab title includes the shop name. |
| WEB-UI-24 | In the new shop | Team and Roles sections are visible. The owner is listed as OWNER. Products can be opened. |
| WEB-UI-25 | Go to **Businesses** → **Add a business** | `#/setup` lists the existing shop above the create form. Creating a second shop opens it. The shop switcher lists both. |
| WEB-UI-26 | **Sign out** from `#/setup` | Back to sign-in. `POST /auth/logout` sent. Back button does not show setup. |
| WEB-UI-27 | Leave setup idle until the access token expires (or revoke the session as an admin), then **Create shop** | Silent refresh works, or *Session expired. Please sign in again.* shows on sign-in |

### 6.3 Cross-cutting

| ID | Steps | Expected |
|---|---|---|
| WEB-UI-28 | Keyboard only: Tab through register and setup | Logical order, visible focus, Enter submits. Errors are announced (`role="alert"`). Every input has a label. |
| WEB-UI-29 | Narrow the window to 375 px | Both pages usable. No horizontal scroll. |
| WEB-UI-30 | Install the mobile app or open Expo web, sign in with the web-created account | The shop created on the web opens on the phone. Registering on the phone and signing in on the web also works. |

## 7. Regression

| ID | Check | Expected |
|---|---|---|
| REG-01 | Existing member signs in on the web | Lands on `#/shops`, as before |
| REG-02 | Platform admin signs in | Lands on `#/overview`. Nav unchanged. Cannot open `#/setup`. |
| REG-03 | Wrong password | *Invalid email or password.* |
| REG-04 | Disabled account signs in | Rejected (401). Never reaches setup. |
| REG-05 | Mobile register → setup → create shop | Unchanged UX. Messages identical. |
| REG-06 | Mobile guest shop moved to a new account | Succeeds (slug normalized, not rejected) |
| REG-07 | Mobile duplicate shop ID | Now shows *This shop ID is already taken…* |
| REG-08 | Existing node:test and vitest suites | All pass: `npm test` |
| REG-09 | `npm run typecheck` and `npm run lint` | Clean |
| REG-10 | `npm run build` (shared, api, mobile, admin) | Succeeds |
