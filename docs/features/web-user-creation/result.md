# Result: Web user creation (definition of done)

The task is complete when **every box below is ticked**. Each row lists the evidence that proves it. Test IDs refer to [test-cases.md](test-cases.md). Design references refer to [task.md](task.md).

## 1. What users can do after this change

| # | Outcome | Proven by |
|---|---|---|
| R1 | A new user can create an account from the web sign-in page in one form (name, email, password). | WEB-UI-01…12, E2E-01 |
| R2 | Straight after registering, the user is asked to create their shop and lands in that shop's workspace as OWNER. | WEB-UI-17…24, E2E-09 |
| R3 | The messages, fields, limits and order of steps match the mobile app. Both apps use the same rules from `packages/shared`. | SH-01…19, MOB-01…04 |
| R4 | A user who stopped half-way (has an account but no shop) can sign in on the web and finish. They are no longer rejected. | WEB-U-02, WEB-U-22, WEB-UI-22 |
| R5 | Members can add another shop from the web (**Businesses → Add a business**). | WEB-U-09, WEB-UI-25 |
| R6 | Accounts and shops work across platforms: created on the web, used on the phone, and the other way round. | E2E-12, WEB-UI-30 |
| R7 | A shop ID that is already taken shows a clear message on web and mobile: *This shop ID is already taken. Choose a different one.* | API-11, E2E-11, WEB-UI-21, REG-07 |
| R8 | A weak password says what is required instead of *"Password is not strong enough."* | WEB-U-16, WEB-UI-08 |

## 2. Scenario sign-off

### Create account (web)
- [x] Link from sign-in → `#/register`, and *Sign in* link back (WEB-UI-01, 02)
- [x] Empty or short name → *Enter your name (at least 2 characters).* (WEB-UI-03, 04; SH-01, 02)
- [x] Blank email → *Enter your email address.* (WEB-UI-05; SH-03, 04)
- [x] Blank password → *Create a password.* (WEB-UI-06; SH-05)
- [x] Invalid email → *Enter a valid email address.* (WEB-UI-07; E2E-05)
- [x] Weak password → password rule message (WEB-UI-08; E2E-04; WEB-U-16)
- [x] Duplicate email, any case → *An account with this email already exists.* (WEB-UI-09; E2E-03; API-04)
- [x] Error clears on edit; Enter submits; busy label shown (WEB-UI-10, 11)
- [x] Autofill works; no browser validation pop-ups (WEB-UI-13)
- [x] Double submit → one request (WEB-UI-14; WEB-U-20)
- [x] API offline → connection message, form usable again (WEB-UI-15; WEB-U-24)
- [x] Success → `#/setup` with the no-shop message, no sidebar, Sign out available (WEB-UI-12)

### Create shop (web)
- [x] Shop ID filled in from the name until the user edits it (WEB-UI-17, 18; WEB-U-12…15)
- [x] Create disabled until name and ID are both ≥ 2 characters; a symbols-only name leaves the ID empty (WEB-UI-19, 20; SH-13, 18, 19)
- [x] Taken ID → clear message, inputs kept, retry works (WEB-UI-21)
- [x] Success → `#/shops/<id>` overview, OWNER, Team and Roles visible (WEB-UI-23, 24)
- [x] One shop per click, even on double-click (WEB-UI-23)
- [x] Add a second shop from Businesses (WEB-UI-25)
- [x] Sign out from setup revokes the refresh token (WEB-UI-26)
- [x] Reload → sign in → back on setup (WEB-UI-22)
- [x] Session expiry handled (WEB-UI-27)

### Routing and access
- [x] Signed-out visitors can only open sign-in and `#/register`; `#/setup` → sign-in (WEB-U-04, 05)
- [x] Signed-in user on `#/register` is redirected (WEB-U-06, 07)
- [x] A member with 0 shops cannot reach any page except setup (WEB-U-08)
- [x] Platform admin never sees setup (WEB-U-10; REG-02)
- [x] Registration cannot set `isPlatformAdmin` or any role; extra fields → 400 (E2E-07; API-06, 07)
- [x] A new account cannot read other businesses (E2E-08)

### Server
- [x] Email stored lowercased and trimmed; name trimmed; password hashed (API-02, 03, 05; E2E-01)
- [x] Shop ID normalized on the server, never rejected only because of its format (API-09; E2E-10; REG-06)
- [x] Shop ID that normalizes to < 2 characters → 400 (API-10)
- [x] Taken shop ID → 409 with the plain message; no orphan rows (API-11; E2E-11)
- [x] Shop creation is all-or-nothing (API-14)

### Mobile (no visible change apart from R7)
- [x] Uses the shared validation, shop-ID helper and hint text (MOB-01…03)
- [ ] Register → setup → shop works as before (REG-05)
- [ ] Moving a guest shop to an account still works (REG-06)

### Quality
- [x] Keyboard and screen reader: labels, focus order, `role="alert"` (WEB-UI-28)
- [x] 375 px wide: no horizontal scroll (WEB-UI-29)
- [x] Tab titles for the new pages (WEB-U-26)

## 3. Commands that must pass

```sh
npm run build:shared
npm test                  # shared + api + mobile + admin unit tests, admin typecheck, mobile lint
npm run typecheck
npm run lint
npm run build
RUN_DATABASE_TESTS=1 NODE_ENV=test DATABASE_URL=… JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=… \
  npm --prefix apps/api run test:e2e      # includes registration.e2e-spec.ts
```

Expected: all green, with **no skipped tests in the new files** (DB e2e is the one exception: it is skipped without `RUN_DATABASE_TESTS=1`, so it must be run once with it set before sign-off).

## 4. Files expected in the final diff

| Area | Files |
|---|---|
| Shared | `packages/shared/src/auth-validation.ts` (+spec), `shop-id.ts` (+spec), `index.ts` |
| API | `src/businesses/businesses.service.ts` (+spec), `src/auth/auth.service.spec.ts`, `test/registration.e2e-spec.ts` |
| Web | `src/registration.ts`, `src/onboarding.tsx`, `src/api.ts`, `src/main.tsx`, `src/shop.tsx`, `src/errors.ts`, `src/page-title.ts`, `src/style.css`, `test/registration.test.mjs`, `test/api.test.mjs`, `test/errors.test.mjs`, `test/page-title.test.mjs` |
| Mobile | `services/auth-validation.ts`, `app/business/setup.tsx`, `app/auth/register.tsx` |
| Docs | `apps/admin/README.md`, `docs/AUTHORIZATION.md`, `docs/STATUS.md` |

**Not changed:** Prisma schema and migrations (no DB change is needed), the `AuthService.register` logic, and the refresh/logout/session handling.

## 5. Known behaviour after release (accepted, document it)

- A web session is kept in memory only, so a page reload part-way through the flow asks the user to sign in again (they then go back to setup).
- A member whose only shop was suspended or removed now sees **Create your shop** on sign-in instead of an error. This matches mobile.
- There is no email verification, password reset, CAPTCHA or rate limiting (unchanged from mobile and the API; tracked separately).
- Shop IDs fold accents (`Café` → `cafe`). Older shops created on mobile keep their existing IDs.

## 4. Verification record (2026-11-03)

- Unit: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass.
- E2E: `registration.e2e-spec.ts` passes (7 tests, E2E-01…12) on an isolated database. The full e2e run also has failures in `sales.e2e-spec.ts` (sync snapshot price visibility, supplier purchase files). They fail the same way without this change, so they are not caused by it.
- Browser (Chrome, local API and panel): WEB-UI-01…29 and REG-01…04 pass. WEB-UI-13 was seen on the sign-in page (saved credentials autofilled; button never disabled). WEB-UI-29 was checked in a 375 px frame.
- Not yet checked: WEB-UI-30, REG-05…07 (need the phone app). The API side of these is covered by E2E-10 to E2E-12 and API-09/11.
- Found while testing, not caused by this change: on the `#/shops` list the tab title keeps the last shop page's title (for example "Products · <shop>").

