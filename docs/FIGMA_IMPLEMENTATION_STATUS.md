# Figma implementation status

Updated 10 October 2026. References are the SVGs in `figma_design/`.

The initial quick audit mapped code to 27 exports; it did not establish pixel-perfect parity. Reviewing the actual SVG images identified accounting and draft-management requirements. These are now implemented across the API and screens.

## Six frontend gaps addressed

| Reference | Implementation |
| --- | --- |
| Activity | Dedicated combined sale/purchase feed, search, type and date filters, totals for shown records, grouped saved transactions, loading/error/empty states. Reachable through the Activity tab. |
| Supplier detail | Contact header and card, call/WhatsApp actions, purchase summary, saved purchase history, receipt links, edit and new-purchase actions. Restricted prices stay restricted. |
| Sale saving in progress | In-progress notice, submission latch, disabled editing/save/navigation until completion. |
| Confirmed save failure recovery | Rejection notice, retained form, return-to-edit and retry controls. Uncertain outcomes support an idempotent retry of the same draft, plus a Check Activity action. |
| Saved sale receipt | Full-screen receipt, identifier, customer, item cards, saved total and payment method, refreshed stock when available, share/view/new-sale actions. |
| Saved purchase receipt | Full-screen receipt, internal identifier and supplier invoice, supplier, item cards, saved total, refreshed stock when available, share/view/new-purchase actions. |

Historical receipt pages use saved records. Post-save stock snapshots are shown only when an inventory refresh succeeds. No stock estimate is presented as a confirmed balance.

## Accounting and draft features implemented

| Feature | Where to find it |
| --- | --- |
| GST | Product add/edit → Pricing & reorder → GST percentage. Prices exclude GST; existing products default to 0%. Sale and purchase lines snapshot the rate and rounded tax at save time. Review and receipts show subtotal, GST and total. |
| Payment states | Sale/purchase review → full payment, partial payment or credit, payment method and optional due date. Receipts show paid amount, outstanding balance, due/overdue state and payment history. |
| Record payment | Saved receipt pages and customer/supplier transaction cards. Owner/admin actions record payments against a selected transaction. Concurrent payments cannot exceed the balance, and retrying the same request cannot create another payment. |
| Historical payments | Existing transactions retain unknown paid amounts. Recording the first payment requires confirming the previously paid amount; it is recorded separately as an opening balance. No past payment is inferred from a payment-method label. |
| Persistent drafts | Sale/purchase forms save one draft per user, business and transaction type on the device. Restore/discard appears when returning to the form; Activity lists unsaved drafts with Continue/Discard actions and a Drafts filter. Decimal quantities, selling options, accounting inputs and retry identity are retained. |
| Activity and contact balances | Paid/unpaid/overdue status filters, invoice balances and contact outstanding summaries. Historical unknown payments are identified; restricted purchase prices and associated financial fields remain hidden. |

The local development accounting migration has been applied and the backend rebuilt and restarted. Existing transaction totals were preserved.

## Validation

- 130 unit tests pass, including tax rounding, payment bounds, calendar dates and draft persistence/clear ordering.
- 20 PostgreSQL integration tests pass, including concurrent sale retries, concurrent payments, overpayment rejection, immutable GST snapshots, historical payment confirmation, purchase payments and stock rollback.
- Prisma migration/schema comparison reports no difference.
- Backend and frontend type checks and lint pass; the Expo web export succeeds.

## Remaining verification

Native-device visual comparison at the Figma reference dimensions remains unverified. Browser UI automation attempts were unavailable or timed out; code/build checks do not establish pixel-perfect parity. The implemented features are ready for testing in the running Expo app.
