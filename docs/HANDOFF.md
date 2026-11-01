# Handoff: 1 November 2026

## 1. Where things stand

| | |
|---|---|
| Branch | `feature/qa-fixes` (local only, not pushed; PRs go to `master`) |
| Last commit | `ea69a14` fix(mobile): keep summary-strip amounts whole and show Catalog sheet filters as chips (F8) |
| Work stopped | Sunday 1 Nov 2026, 14:07 IST (the first commit today was at 06:48; it built on `f39bbf7`, the design commit from 31 Oct 22:11) |
| Uncommitted | Only `apps/api/tsconfig.build.tsbuildinfo`, a TypeScript build cache that changes on every build. **Never commit it.** |

Every row in `docs/QA_FIX_PLAN.md` from Phase 1 to Phase 6 is marked **Done** (row 20 says "Covered by F4").

Latest test counts (at `ea69a14`): shared 88, API 284, mobile 295, admin 68, all passing. Typecheck and lint are clean. Last full e2e run (at `ab2075b`, the last API change): 53 passed, plus the 2 known failures.

## 2. What was done today

### Phase 3b (feedback from 31 Oct)

| Row | What | Commits |
|---|---|---|
| F1 | New sale and new purchase have a labelled Discard button and a confirmation that names what will be lost. The purchase screen's "•••" did nothing, and the purchase screen never asked before leaving; both are fixed | `90aec93` |
| F2 | Creating a product returns to the catalog with a notice, and the new product is shown first and marked New. Opening stock can be entered in the create form. Admin says "<Kind> added: <name>." | `555b139`, `e9793fa`, `b1a33e5`; review fix `bc16717` (check dozen opening stock) |
| F3 | Catalog photo tiles, two per row. The tile or list choice is remembered per person and shop | `3512b2f`, `7117181` |
| F4 | Stock adjustment (count, add, remove; reasons: count correction, damage, expired, other) on the phone (Inventory and the product page) and in admin. Stock movements now have readable names | `7623c70`, `e881966`, `bbcccbc`; review fix `735e97e`, `30a3ba9`, `65e79de` (grouped products adjusted in whole pieces) |
| F5 | GST is optional on each sale and purchase and off by default. A bill without GST is titled "Bill of supply" | API `d335f7e`, mobile `b66b65b`, admin `31f0f8a` |
| F6 | Sales returns (credit notes CN/…) and purchase returns (debit notes DN/…) | `958af0b`, `77811a9`, `c07266b`, `16c79dd`, `c6b02e9`; review fixes `589551c`, `0874c58`, `02ff47d`, `ea43c4d` |
| F7 | Edit the items of a saved sale or purchase (ADR-015 replaces ADR-010 and ADR-011) | `d0e1971`, `0ee99b0`, `b26ad9b`, `3bd6e52`, `6562308`; review fix `68592a2`, `b98e203`, `acec204` (`expectedRefund`) |
| F8 | Compact list headers, so lists start near the top of the screen | `2848b9f`, `3510db1`; review fix `ea69a14` |

### Phases 4 to 6

| Row | What | Commits |
|---|---|---|
| 21 | The product page shows GST rate, HSN code, selling options and a low/out-of-stock warning | `ed56f7e` |
| 22 | Overview shows purchases, low stock and top products (30 days). Inventory shows stock value at cost and at selling price | `dd7fc26` |
| 23 | Barcode scan in the product form, and "Open settings" when camera access was refused | `6a9cca2`; review fix `3d980b2` |
| 24 | Activity date ranges (today, this week, this month, custom), using India dates | `59edc37` |
| 25-26 | Admin: formatted money, dates and movement names; readable errors; one "Team and roles" tab; customer/supplier and balance columns; View details | `ab2075b` (API: validation errors name the failing line field), `2a6de9f`; review fix `22bde28` |
| 27-28 | Admin: record payments from a bill's details; table search and pages | `f41def9`, `586bc00` |
| 29 | Confirmations before making someone an owner, deactivating a member or deleting a role; clearer role picker (admin and phone) | `c25e22c`, `c739e7d` |
| 30 | Accessible names without icon-font characters, labelled buttons and fields, page titles on web | `cddab03`, `0fc0017` |
| 31-32 | One back button, "New sale" naming, ₹ tab icon, share labels, payments card, purchase GST note; simpler selling-option form | `841b4cd`, `130f085`; review fix `c05f024` |

### Bugs found and fixed

- Grid cards wrapped one per row because of fractional widths (`7117181`).
- After creating a product, the leave guard could block the screen. Back did nothing, and pressing Create again failed with a duplicate SKU (`e9793fa`).
- Dozen opening stock was not checked for whole pieces before the product was created (`bc16717`).
- Counting a grouped product (dozen, box, pack) always failed with a 409 once a single piece had been sold (`735e97e`, `30a3ba9`, `65e79de`).
- Return rounding could give a line 1 paisa more discount than its value, which caused an API 500 (`589551c`).
- Android Overview "today" totals ignored returns (`0874c58`).
- On Android, Return items started from a possibly stale copy of the bill on the device (`02ff47d`).
- No e2e test checked who may record returns (`ea43c4d`).
- A payment recorded while the Edit items form was open let the server record a refund nobody saw (`68592a2`, `b98e203`, `acec204`).
- A slow duplicate-barcode check could warn about the wrong barcode (`3d980b2`).
- The API returned "Request validation failed." with no details when the error was inside a bill line (`ab2075b`).
- Admin party balances read "Nothing due" when amounts were hidden or payments were never recorded. The Email column had also gone missing (`22bde28`).
- On a product stocked in packs or boxes with no pieces-per-pack set, the phone could not save pack or box options (`c05f024`).
- Summary-strip amounts were cut off at lakh or crore values, and Catalog sheet filters did not show as chips (`ea69a14`).
- Fixed inside feature commits:
  - Admin form cards had no padding.
  - Activity totals counted cancelled bills.
  - Record payment allowed the balance from before a return.
  - Receipt lines of an edited bill borrowed another product's label.
  - Activity days used the phone's time zone instead of India time.
  - Admin offered Cancel on bills that have returns.
  - The web switch had no aria-checked.

### Decisions made without you (please review)

Each one is also written in the design sections of `docs/QA_FIX_PLAN.md`.

- **F2:** the opening stock field appears only for people allowed to adjust inventory. If saving the opening stock fails, the product is still created and the notice says so.
- **F3:** tiles are capped at two per row on all screen sizes. The view choice is now remembered (it was not remembered before).
- **F4:** the API takes an optional `expectedQuantity` and returns 409 if the stock changed during a count. Grouped products are sent in pieces (`unit: 'PIECE'`). Phones must sync pending changes before adjusting. Damage and Expired are offered only when stock goes down. Other needs a note. A count is still typed in the product's unit, so a dozen count that is not a multiple of 3 pieces cannot be entered.
- **F5:** the data is stored as `chargeGst` with a default of true, so existing bills and older clients still charge GST. Only an explicit `true` from a shop without a GSTIN is refused. A bill without GST stores line rate 0. Drafts saved before this change restore with GST off. In admin, the switch sits in the review step.
- **F6:**
  - A return is dated the day it is recorded.
  - Its value first reduces what is still owed, and the rest is refunded, by default in the bill's payment method.
  - Bills with returns cannot be cancelled.
  - Dashboards count each bill at its net amount on the original bill date.
  - Sale lines now store `stockQuantity`; older lines were backfilled.
  - Starting a return needs a connection.
  - Admin cannot print or share a credit or debit note (only the phone can).
- **F7:**
  - The number, date, party, payment method and due date stay as they were.
  - Stock moves only by the difference.
  - A walk-in sale cannot be raised above what was paid.
  - Deactivated products may stay on the bill.
  - `expectedRefund` was chosen instead of raising `revision` on every payment.
  - "Edited" shows the time and reason but not who edited it.
- **21-24:** the phone works out low stock, top products and stock value itself (no new endpoints). The barcode duplicate warning does not block saving. Quick bill matches by barcode, then by SKU in any case. Weeks run Monday to Sunday. The Activity range is not remembered.
- **25-28:**
  - The balance is the net amount minus what was paid; it shows "—" for older bills with no recorded payments.
  - Party balances are worked out in the browser.
  - Platform timestamps stay in UTC.
  - Record payment sits in the View panel.
  - Search and pages work in the browser, 25 rows per page.
- **29-32:**
  - Removing owner access also asks first. Reactivating does not ask.
  - A role in use cannot be deleted.
  - Admin's role select needs a confirm button.
  - "New sale" replaces "Quick bill" everywhere.
  - Customers without a usable phone number get the share sheet.
  - Older "2 packs of 10" options are rewritten as "1 pack = 20 pieces" when the product is next saved.
- **F8:**
  - Back buttons appear only on screens outside the tab bar.
  - The Sales unpaid switch is now a chip.
  - Activity filters moved into a bottom sheet.
  - The Overview low-stock alert card was removed.
  - Contact history titles are "Customer" / "Supplier".
  - Strips with four or more figures use a 2x2 grid.

## 3. What remains

- **Plan rows:** none are open. Every row in Phases 1 to 6 is Done.
- **Uncommitted:** only `apps/api/tsconfig.build.tsbuildinfo` (leave it).
- **Deferred in the plan:** forgot password (needs an email service), change password and switch shop, and an on-screen keyboard overlap check.
- **Suggested follow-ups found today (not planned):**
  - Let people type stock counts in pieces for grouped products. Previews show "0.083 dozen" for 1 piece.
  - Printing and sharing credit and debit notes in admin.
  - The platform "inventory-movements" tab shows raw ledger quantities and product ids. Fixing it needs an API change.
  - Inventory's "Need reorder" counts every product with zero stock, while Overview follows the minimum-level rule, so the two numbers differ.
  - The product page shows "Buy ₹0.00" when the purchase price is 0.00.
  - Admin's Edit items keeps the reason typed earlier after the form is closed and reopened.
  - `apps/mobile/AGENTS.md` still points to the Expo v54 docs; the app is on SDK 57.
  - Possible leftover capture record in `camera-recovery.ts` when camera access is refused (not checked).
  - Admin sign-in is lost on page reload or backend restart (the session is kept only in memory).
  - The native app shows product changes made on the server only after it is relaunched.

## 4. Known issues still open

- **Two pre-existing e2e failures:** "uploads offline catalog/contact/stock changes exactly once…" and "saves supplier catalogs and purchase files…". Any other failure is new.
- **Occasional e2e flake:** "Parse Error: Expected HTTP/" appeared twice, while the backend was restarting. The tests passed on rerun.
- **LOCAL_ONLY permission problem:** with `EXPO_PUBLIC_LOCAL_ONLY=true` (as the local APK build sets), the app cannot use server accounts, roles or access management. Keep `EXPO_PUBLIC_LOCAL_ONLY=false` in `apps/mobile/.env` for development (see `docs/AUTHORIZATION.md`).
- **Docker restart race:** `docker restart invento-backend` sometimes logs EADDRINUSE. Restart it again until the logs show "Nest application successfully started". Restart it after migrations or DTO changes too; once, the watcher did not pick up a DTO change.
- **iOS print cancel:** not verified. Only Android print preview and web printing (with `print()` stubbed) were checked.
- **Not checked by hand today (covered by unit or e2e tests):**
  - A 409 for a stale stock count shown in the UI.
  - Staff not seeing Adjust stock, Return items or Edit items.
  - The walk-in edit limit on the phone.
  - The GST switch disabled for a shop without a GSTIN on the phone.
  - The "Returning items needs a connection" message.
  - A real optical barcode scan; the browser camera prompt.
  - Admin at phone width.
  - A catalog tile showing a real photo (no QA product has a photo).
  - The Catalog unit filter chip on the emulator.
  - Platform-admin pages (there is no platform admin test account).

## 5. How to resume

### Services
1. Docker: `docker start invento-postgres invento-backend`. The API runs at http://localhost:3000/api; check it with `curl localhost:3000/api/health`.
2. Admin web (Vite) on http://127.0.0.1:5173, started from `apps/admin`.
3. Expo on port 8081, started from `apps/mobile`. `apps/mobile/.env` must contain `EXPO_PUBLIC_API_URL=http://localhost:3000/api` and `EXPO_PUBLIC_LOCAL_ONLY=false`. Mobile web runs at http://localhost:8081.
4. Android emulator (Medium_Phone): `adb reverse tcp:8081 tcp:8081; adb reverse tcp:3000 tcp:3000`, then open `exp://localhost:8081`. To load fresh code, run `adb shell am force-stop host.exp.exponent` and open it again.

### Checks (before every commit)
```sh
npm test            # shared, API, mobile, admin
npm run typecheck
npm run lint
# E2E, when the API or schema changed (about 10 min):
TEST_DATABASE_URL='postgresql://invento:invento@localhost:5432/invento_phase8_verify?schema=public' npm --workspace @invento/api run test:mvp
```
- After editing `packages/shared`, run `npm --workspace @invento/shared run build`.
- After a migration: run `prisma migrate deploy` and the drift check on the verify database, then `npm --workspace @invento/api run prisma:generate`, then `docker restart invento-backend`.
- The full commands are in the session runbook and in `docs/DOCKER_DEVELOPMENT.md`.

### Test data and accounts
- QA shop: "QA Glass & Hardware" (id `cmvvwucrf0002c2iav53ddk2d`, GSTIN set, Maharashtra).
- Owner and staff logins are in the session scratchpad file `test-credentials.txt` (under `/private/tmp/claude-502/-Users-anurag-projects-invento/…/scratchpad/`). Passwords are not repeated here. There is no Viewer account and no platform admin account.
- Test records added today and left in `invento_dev`:
  - Products: TG-08, TG-10, TG-12, FG-06, ADM-MIR-1, QA-DOZ-1, QA-KNOB-DZ, and "QA Pack NoSize Tape" (SKU stored as `APACKNS1`, because of a typing glitch during the test).
  - Sales: INV/2026-27/0020 to 0035.
  - Purchases: PUR/2026-27/0003 to 0005.
  - Credit notes CN/2026-27/0001 to 0008 and debit notes DN/2026-27/0001 to 0003.
  - Delete or deactivate any of these you do not want.
