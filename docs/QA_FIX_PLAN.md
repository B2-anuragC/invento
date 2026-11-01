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
| 13 | Shop GSTIN, state, address and phone in settings (admin and a mobile Shop details screen); customer and supplier GSTIN | Done |
| 14 | Receipt shows shop name and details, customer GSTIN, HSN codes and the CGST/SGST or IGST split | Done |
| 15 | Print / save as PDF (A4) from the receipt; share through the system share sheet, not only WhatsApp | Done |

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
| 16 | Bill-level discount on sales | Done |
| 17 | Walk-in customer so a quick bill can be saved without choosing a customer | Done |
| 18 | Cancel a sale or purchase, reversing stock through the inventory engine | Done |
| 19 | Payment date when recording a payment; purchase date on review | Done |

### Phase 3 design

Decisions agreed on 31 October 2026:

- **Discount (16)**: a sale can take one bill-level discount, entered as an amount or as a percentage of the subtotal. A discount given at the time of sale lowers the taxable value, so it is split across the lines in proportion to their amounts (largest remainder, to the paisa) and each line's GST is charged on its discounted amount. Sales store the discount total and the percentage when one was entered; lines store their share. One shared function does the split for the API, phones (offline bills) and admin, so totals always match. Receipts and invoices show the discount; product revenue on the dashboard is net of it. Purchases are unchanged.
- **Walk-in customer (17)**: every shop has one built-in "Walk-in customer", created for existing shops by the migration and for new shops on creation. Quick bills use it when no customer is chosen. It cannot be edited, deactivated or given a GSTIN, and a sale to it must be paid in full (credit needs a named customer). Its sales are counter sales, with the shop's state as the place of supply.
- **Cancel (18)**: owners and admins can cancel a completed sale or purchase with a reason (new permissions `sales.cancel` and `purchases.cancel`). The bill keeps its number and stays in history as Cancelled; totals, dashboards and pending payments leave it out. Stock is reversed through the inventory engine: a sale's stock comes back; a purchase's stock goes out, and cancelling is refused when that stock has already been sold. Money already received or paid is refunded in the same step: a refund entry in the chosen method (default: how it was paid) brings the amount paid back to zero. Cancelling needs a connection. Credit notes for invoices already reported in a GST return are out of scope.
- **Dates (19)**: Record payment takes the payment date (default today; not before the bill date and not in the future). The purchase review step shows and edits the purchase date, the supplier's bill date, which also sets the purchase number's financial year.

## Phase 3b — Feedback, 31 October 2026

| # | Change | Status |
|---|---|---|
| F1 | No "•••" button that only discards: new sale and new purchase get a labelled Discard action with a confirmation | Done |
| F2 | Creating a product returns to the catalog list (opening stock can be entered in the create form) | Done |
| F3 | Catalog tile view: photo tiles, two per row, replacing the grid (list view stays) | Done |
| F4 | Stock adjustment: counted quantity, add or remove stock with a reason (count correction, damage, expiry, other); phone Inventory and admin; covers step 20 || Done |
| F5 | GST is optional per bill on sales and purchases, off by default | Done |
| F6 | Sales returns and purchase returns (credit notes and debit notes) | Done |
| F7 | Edit items on a saved sale or purchase | Done |

### Phase 3b design

Decisions agreed on 31 October 2026:

- **Discard (F1)**: the header button that looked like a menu only opened the discard dialog. It becomes a labelled "Discard" action, and the dialog says what is lost. Leaving with unsaved items still asks first. The same applies to every screen with this pattern.
- **Create product (F2)**: after saving a new product the app returns to the catalog list with "Product added", and the new product is easy to find. The create form gets an optional opening stock field, so stock is not forgotten; editing a product still stays on its page.
- **Tiles (F3)**: the grid becomes two-per-row tiles with a large photo (or the product's initials), the name, the price per unit and a stock badge (available, low, out of stock). The list view and the remembered view choice stay.
- **Stock adjustment (F4)**: from Inventory (phone) and the admin Inventory section, for users with `inventory.adjust`. Modes: set the counted quantity (the app records the difference), add, or remove, with a reason (count correction, damage, expired, other) and a note. It uses the existing `POST /inventory/adjustments` movement types and shows in stock history. Stock cannot go below zero. Phones need a connection. A count sends the stock it was worked out from (`expectedQuantity`); the API refuses it (409) if stock moved in between, and phones sync pending changes first. Damage and expiry only remove stock; "Other" needs a note. For a product kept in groups of pieces (dozen, or a box or pack with a set size), the adjustment is worked out and sent in whole pieces (`unit: "PIECE"`, with `expectedQuantity` in pieces), because after a single piece is sold the stock is no longer a whole thousandth of the unit (23 pieces = 1.91666… dozen).
- **GST optional (F5)**: each new sale and purchase has a "Charge GST" switch (for purchases "Supplier charged GST"), off by default on every screen. Off: no GST on any line (tax 0), and a sale prints as a Bill of supply with the same invoice numbers. On: GST at each product's rate as before; a sale from a shop with a GSTIN is a Tax invoice. A shop without a GSTIN cannot turn GST on for sales (the switch explains why). The API takes `chargeGst`; when it is missing, GST is charged as before, so bills queued by older app versions keep their totals. The choice is stored on the bill, and receipts, invoices, totals, offline bills and admin all follow it. Stored as `chargeGst` (existing bills: true); only an explicit `chargeGst: true` from a shop without a GSTIN is refused, so older queued bills still sync. A no-GST sale keeps its place of supply and tax type; clients title it with the shared `saleDocumentTitle` (Bill of supply when GST is off or the shop has no GSTIN). Phone: drafts keep the switch, "Repeat sale" keeps the repeated bill's choice, and a pending bill without GST is not held back when a product's GST rate changes. Admin: the sale creator's review step and the new-purchase form have the same checkbox and totals preview; the Sales table shows a "Bill type" column (Tax invoice / Bill of supply) and the Purchases table a "GST" column.
- **Returns (F6)**: from a completed sale, return some or all of the quantity on chosen lines (never more than sold minus already returned). Stock comes back (RETURN_IN), and each line's discount share and GST are reversed in proportion. The money goes back as a refund entry in the chosen method, or reduces what the customer still owes. Each sales return is a credit note numbered `CN/2026-27/0001`; a purchase return (RETURN_OUT, refused if the stock is no longer there) is a debit note `DN/2026-27/0001`. Both series restart each financial year like invoices. The original bill never changes; it shows returned quantities and its net amount. Dashboards and reports are net of returns. Returns can be printed and shared like invoices. Owners and admins only (`sales.return`, `purchases.return`), online only. API: `POST /sales/:id/returns` and `POST /purchases/:id/returns` with `requestId`, `items` (`itemId`, `quantity` in the line's unit), optional `reason` and `refundMethod`; they return the bill with its `returns`. A return is dated when it is recorded and numbered in that financial year (CN and DN prefixes are fixed). Its value first reduces what is still owed on the bill and the rest is refunded (default: how the bill was paid). Bills carry `returnedTotal`, `netTotal` and each line's `returnedQuantity`; payments are limited to the net amount. Dashboards count each bill at its net amount on its own date. A bill with returns cannot be cancelled. Sale lines store the stock they took (`stockQuantity`, filled for older lines from the ledger) so a return puts back exactly its share; a part that is not whole pieces is refused. Phone: "Return items" on a saved receipt previews the note's value and how it is settled before it is issued, then opens the new note; lists, Activity and payment balances use the net amount, and a bill's credit or debit note numbers find it in search. Admin: "Return items…" in a completed bill's edit panel (same preview and settlement, refund method when money goes back), the panel lists the bill's notes, and Cancel is not offered once a bill has returns; the Sales and Purchases tables get a Returns column (value and note numbers) and a Credit notes / Debit notes table below them. Sale and purchase list responses include each bill's `returns` for this.
- **Edit items (F7)**: owners and admins can change the items, quantities, prices, discount and GST choice of a completed sale or purchase, giving a reason. This replaces the earlier rule that saved items never change (ADR-011). In one transaction the old stock movements are reversed and the new ones applied (refused if stock is short); totals are recomputed exactly as for a new bill, and the number and date stay. If the new total is below the amount already paid, the edit form records a refund for the difference, in the method chosen. Bills that are cancelled or have returns cannot be edited. Each edit raises the bill's revision and stores who, when and why, shown on the receipt as "Edited". Online only. API: `PUT /sales/:id/items` and `PUT /purchases/:id/items` (permissions `sales.edit` and `purchases.edit`, owners and admins; purchases also need `pricing.view`) take `requestId`, `reason`, `chargeGst` (required), `items` as for a new bill, a sale's `discountAmount` or `discountPercent`, and optional `revision` (the bill revision the form was opened at; 409 if it changed), `expectedTotal` (409 if prices changed it) and `refundMethod` (default: how it was paid); they return the bill with `revision`, `editedAt`, `editedByUserId` and `editReason`. Customer, supplier and payment method stay; a sale's GST details are copied again from the shop and customer, as for a new bill. Stock moves by the difference per product (ledger notes `Edited sale <id>` / `Edited purchase <id>` for stock that comes back or goes out), so a purchase whose stock was partly sold can still be lowered while that much is in stock. Products already on the bill may stay even if they were deactivated or are not on the supplier's list since. A walk-in sale must stay paid in full: an edit cannot raise its total above what was paid (shared `WALK_IN_EDIT_MESSAGE`). Clients use the shared `billEditBlockReason` and `billEditSettlement` to decide whether Edit is offered and to preview the refund. Phone: "Edit items" on a saved receipt opens a full-screen form started from the server's copy (lines, payments, revision): quantities and prices per line (a selling option keeps its current price), remove lines, add products by search (for purchases only those the supplier offers), the discount and GST switch, then the total before and after, what is refunded (method chosen) or left to collect, and a required reason; the receipt shows "Edited" with the date, time and reason. Admin: "Edit items…" in a sale's or purchase's edit panel (same permissions; not offered on cancelled bills or bills with returns) loads the server's copy and offers the same lines, search, discount, GST switch, before/after totals, refund method and required reason; the panel shows "Edited" with the date, time and reason, and the bills table has an Edited column.

## Phase 4 — Mobile gaps

| # | Change | Status |
|---|---|---|
| 20 | Stock adjustment screen (damage, expiry, returns, corrections) | Covered by F4 |
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
