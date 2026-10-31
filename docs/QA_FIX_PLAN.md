# QA fix plan

Source: QA of the Docker stack on 31 October 2026 — the mobile web build and admin web app in Chrome, and the mobile app on an Android 17 emulator (Expo Go).
Branch: `feature/qa-fixes`. Related changes land together; unrelated ones get separate commits. A step is committed only after:

1. Automated tests for the changed logic pass (`npm test`, plus API e2e where the database is involved).
2. Type check and lint pass.
3. The change is checked manually in Chrome and, for mobile behaviour, on the Android emulator against the running Docker stack.

Logic that lives in screens is moved into `services/` or `packages/shared` where it can be unit tested. The mobile app has no component-rendering test setup, so screen behaviour is verified in the browser and emulator.

## Phase 1 — Bugs

| # | Change | Status |
|---|---|---|
| 1 | Refreshing or opening a deep link no longer redirects to Overview | Done |
| 2 | Phone numbers validated (shared rule, API DTOs, mobile and admin forms) | Done |
| 3 | Offline: a network failure keeps the last known permissions instead of locking every screen; only a server refusal removes access | Done |
| 4 | Enter submits login/register on web; browser autofill enables Sign in; form errors shown next to the button and scrolled into view; validation errors no longer say "Retry" | Done |
| 5 | Correct singular/plural and unit labels; one money and date formatter across mobile | |
| 6 | Receipt lists every payment method used | |
| 7 | Access screen stops re-rendering mid-task during the 15-second permission refresh | |
| 8 | Glass calculator returns its quantity to the purchase or sale that opened it | |
| 9 | Due-date picker disables dates before the transaction date | |
| 10 | Product form asks before discarding unsaved changes | |
| 11 | Quick bill keeps a pack and loose pieces of one product on separate lines; selling options shown on product cards | |

## Phase 2 — Invoicing (India GST)

| # | Change | Status |
|---|---|---|
| 12 | Sequential per-business invoice numbers that restart each financial year: `INV/2026-27/0001` for sales, `PUR/2026-27/0001` for purchases, with a configurable prefix | |
| 13 | Shop GSTIN, address and phone in settings; customer GSTIN | |
| 14 | Receipt shows shop name and details, customer GSTIN and CGST/SGST split | |
| 15 | Print / save as PDF from the receipt; share through the system share sheet, not only WhatsApp | |

## Phase 3 — Billing

| # | Change | Status |
|---|---|---|
| 16 | Bill-level discount on sales | |
| 17 | Walk-in customer so a quick bill can be saved without choosing a customer | |
| 18 | Cancel a sale or purchase, reversing stock through the inventory engine | |
| 19 | Payment date when recording a payment; purchase date on review | |

## Phase 4 — Mobile gaps

| # | Change | Status |
|---|---|---|
| 20 | Stock adjustment screen (damage, expiry, returns, corrections) | |
| 21 | Product page shows GST rate, selling options and a low-stock warning | |
| 22 | Overview shows purchases, low stock and top products; Inventory shows stock value | |
| 23 | Barcode scan in the product form; "Open settings" when camera access was refused | |
| 24 | Activity date ranges (today, this week, this month, custom) | |

## Phase 5 — Admin web

| # | Change | Status |
|---|---|---|
| 25 | Formatted money, dates and movement types; readable validation messages; Team and Roles merged | |
| 26 | Customer/supplier and balance columns; view details | |
| 27 | Record payments | |
| 28 | Table search and pagination | |

## Phase 6 — Safety, accessibility and consistency

| # | Change | Status |
|---|---|---|
| 29 | Confirmation for assigning owner, deactivating members and deleting roles; clearer role picker | |
| 30 | Accessible names without icon-font characters; labelled icon buttons and form fields; page titles on web | |
| 31 | Consistent back buttons and labels, sale naming, ₹ tab icon, share labels, pending-payment card, GST note on purchase quantities | |
| 32 | Simpler selling-option form ("1 pack = 10 pieces" plus price) | |

## Deferred

- Forgot password needs an email delivery service, which the project does not have yet.
- Change password and switch shop are follow-ups after phase 6.
- On-screen keyboard overlap could not be checked: the emulator uses the host keyboard.
