# QA fix plan

Source: browser QA of the Docker stack on 31 October 2026 (mobile web build and admin web app).
Branch: `feature/qa-fixes`. One commit per step. A step is committed only after:

1. Automated tests for the changed logic pass (`npm test`, plus API e2e where the database is involved).
2. Type check and lint pass.
3. The change is checked manually in Chrome against the running Docker stack.

Logic that lives in screens is moved into `services/` or `packages/shared` where it can be unit tested. The mobile app has no component-rendering test setup, so screen behaviour is verified in the browser.

## Phase 1 — Bugs

| # | Change | Status |
|---|---|---|
| 1 | Refreshing or opening a deep link no longer redirects to Overview | |
| 2 | Phone numbers validated (shared rule, API DTOs, mobile and admin forms) | |
| 3 | Enter submits login/register; form errors shown next to the button and scrolled into view | |
| 4 | Correct singular/plural labels; one money and date formatter across mobile | |
| 5 | Receipt lists every payment method used | |
| 6 | Access screen stops re-rendering mid-task during the 15-second permission refresh | |

## Phase 2 — Invoicing (India GST)

| # | Change | Status |
|---|---|---|
| 7 | Sequential per-business invoice numbers for sales (`INV-0001`) and purchases (`PUR-0001`), with a configurable prefix | |
| 8 | Shop GSTIN, address and phone in settings; customer GSTIN | |
| 9 | Receipt shows shop name and details, customer GSTIN and CGST/SGST split | |
| 10 | Print / save as PDF from the receipt | |

## Phase 3 — Billing

| # | Change | Status |
|---|---|---|
| 11 | Bill-level discount on sales | |
| 12 | Walk-in customer so a quick bill can be saved without choosing a customer | |
| 13 | Cancel a sale or purchase, reversing stock through the inventory engine | |
| 14 | Payment date when recording a payment; purchase date on review | |

## Phase 4 — Mobile gaps

| # | Change | Status |
|---|---|---|
| 15 | Stock adjustment screen (damage, expiry, returns, corrections) | |
| 16 | Product page shows GST rate and low-stock warning | |
| 17 | Overview shows purchases, low stock and top products | |

## Phase 5 — Admin web

| # | Change | Status |
|---|---|---|
| 18 | Formatted money, dates and movement types; Team and Roles merged | |
| 19 | Customer/supplier and balance columns; view details | |
| 20 | Record payments | |
| 21 | Table search and pagination | |

## Phase 6 — Safety, accessibility and consistency

| # | Change | Status |
|---|---|---|
| 22 | Confirmation for assigning owner, deactivating members and deleting roles; clearer role picker | |
| 23 | Accessible names for icon buttons and form fields; page titles on web | |
| 24 | Consistent back buttons, sale naming, ₹ tab icon, share labels, pending-payment card, GST note on purchase quantities | |

## Deferred

- Forgot password needs an email delivery service, which the project does not have yet.
- Change password and switch shop are follow-ups after phase 6.
