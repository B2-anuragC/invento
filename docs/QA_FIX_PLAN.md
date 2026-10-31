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
| 5 | Correct singular/plural and unit labels; one money and date formatter across mobile | Done |
| 6 | Receipt lists every payment method used; readable payment method names | Done |
| 7 | Access screen stops re-rendering mid-task during the 15-second permission refresh | Done |
| 8 | Glass calculator returns its quantity to the purchase or sale that opened it | Done |
| 9 | Due-date picker disables dates before the transaction date | Done |
| 10 | Product form asks before discarding unsaved changes; Cancel editing restores saved values | Done |
| 11 | Quick bill keeps a pack and loose pieces of one product on separate lines; selling options shown on product cards | Done |

## Phase 2 — Invoicing (India GST)

| # | Change | Status |
|---|---|---|
| 12 | Sequential per-business invoice numbers that restart each financial year: `INV/2026-27/0001` for sales, `PUR/2026-27/0001` for purchases, with a configurable prefix | Done |
| 13 | Shop GSTIN, state, address and phone in settings (admin and a mobile Shop details screen); customer and supplier GSTIN | |
| 14 | Receipt shows shop name and details, customer GSTIN, HSN codes and the CGST/SGST or IGST split | |
| 15 | Print / save as PDF (A4) from the receipt; share through the system share sheet, not only WhatsApp | |

### Phase 2 design

Rules followed: CGST Rule 46 — a serial number of at most 16 characters (letters, digits, `-`, `/`), unique for a financial year; supplier name, address and GSTIN; recipient GSTIN if registered; HSN code; rate and amount of each tax head; place of supply for inter-state supplies.

Decisions agreed on 31 October 2026:

- **Numbers** live in new columns `documentNumber`, `financialYear`, `documentSeq` on sales and purchases. The existing `invoiceNumber` stays a free-text reference: for sales a manual reference, for purchases the supplier's invoice number. Numbers cannot be edited.
- **Allocation** happens inside the existing create transaction, after stock movements, by incrementing a `document_counters` row (business, series, financial year) with `INSERT … ON CONFLICT DO UPDATE … RETURNING`. A rolled-back or duplicate request uses no number, so numbering has no gaps.
- **Financial year** comes from the bill date in Asia/Kolkata (1 April–31 March). Bill dates more than a day in the future are rejected, and a numbered bill's date cannot move to another financial year.
- **Prefix**: 1–3 letters or digits, separate for sales (default `INV`) and purchases (default `PUR`). Changing it continues the same sequence. From 10,000 bills in a year the year is shortened (`INV/26-27/10000`) to stay within 16 characters.
- **Existing bills** stay unnumbered and keep their current labels.
- **On phones** a bill gets its number when it syncs. Until then the receipt says so, and print, PDF and share stay disabled. Local-only mode numbers bills on the device with its own per-year counter.
- **GST profile**: shop GSTIN (validated, including the check digit) and state; GSTIN for customers and suppliers. Clearing a field stores no value.
- **Invoice details are copied onto each sale** when it is created: seller GSTIN and state, buyer GSTIN, place of supply and tax type, and each line's HSN code, so issued invoices never change.
- **Tax split**: CGST = half of each line's stored tax (half-up to the paisa), SGST = the rest; IGST when the place of supply differs from the shop's state. Totals are unchanged, so queued offline bills still match.
- **Title**: "Tax invoice" when the shop has a GSTIN, otherwise "Bill of supply".
- **HSN**: an optional code on products (4–8 digits), copied to sale lines.
- **Print**: an A4 HTML invoice with all user text escaped; `expo-print` makes a PDF on phones and the system share sheet sends it; web prints from a sandboxed frame (Save as PDF).

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
