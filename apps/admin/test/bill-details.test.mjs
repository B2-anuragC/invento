import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceDue, balanceText, billAmounts, billFacts, billItems, billPayments, billRow, indiaToday, partyBalances, partyBalanceText, partySummary } from "../src/bill-details.ts";

const sale = (extra = {}) => ({ id: "s1", status: "COMPLETED", customerId: "c1", customer: { id: "c1", name: "Patil Constructions" }, saleDate: "2026-10-30T06:00:00.000Z", subtotal: "1000.00", taxTotal: "180.00", total: "1180.00", returnedTotal: "0", amountPaid: "1180.00", ...extra });

test("balance after returns and payments; unknown when cancelled, hidden or never recorded", () => {
  assert.equal(balanceDue(sale()), 0);
  assert.equal(balanceDue(sale({ amountPaid: "500" })), 68000);
  assert.equal(balanceDue(sale({ amountPaid: "500", returnedTotal: "180" })), 50000);
  assert.equal(balanceDue(sale({ amountPaid: "500", netTotal: "1000" })), 50000);
  assert.equal(balanceDue(sale({ status: "CANCELLED", amountPaid: "0" })), null);
  assert.equal(balanceDue(sale({ total: undefined })), null);
  assert.equal(balanceDue(sale({ amountPaid: null })), null);
});

test("the Balance column says paid, due or overdue", () => {
  assert.equal(balanceText(sale()), "Paid");
  assert.equal(balanceText(sale({ amountPaid: "180" }), "2026-11-01"), "₹1,000.00 due");
  assert.equal(balanceText(sale({ amountPaid: "180", dueDate: "2026-11-01T00:00:00.000Z" }), "2026-11-01"), "₹1,000.00 due");
  assert.equal(balanceText(sale({ amountPaid: "180", dueDate: "2026-10-31" }), "2026-11-01"), "₹1,000.00 overdue");
  assert.equal(balanceText(sale({ status: "CANCELLED" })), "—");
});

test("bill rows carry the customer or supplier", () => {
  assert.deepEqual(
    (({ party, balance }) => ({ party, balance }))(billRow("sale", sale({ amountPaid: "0" }), "2026-11-01")),
    { party: "Patil Constructions", balance: "₹1,180.00 due" },
  );
  const purchase = { id: "p1", supplierId: "s1", supplier: { id: "s1", name: "Saint Glass Distributors" } };
  assert.equal(billRow("purchase", purchase).party, "Saint Glass Distributors");
  assert.equal(billRow("purchase", purchase).balance, "—");
  assert.equal(billRow("sale", { id: "x" }).party, "—");
});

test("India's date decides what is overdue", () => {
  assert.equal(indiaToday(new Date("2026-10-31T19:00:00.000Z")), "2026-11-01");
  assert.equal(indiaToday(new Date("2026-10-31T18:00:00.000Z")), "2026-10-31");
});

test("party totals add up bills, leave out cancelled ones and track overdue amounts", () => {
  const totals = partyBalances("sale", [
    sale(),
    sale({ id: "s2", amountPaid: "180", dueDate: "2026-10-01" }),
    sale({ id: "s3", amountPaid: "1000", returnedTotal: "100" }),
    sale({ id: "s4", status: "CANCELLED", amountPaid: "0" }),
    sale({ id: "s5", customerId: "c2", customer: { id: "c2", name: "Shree" }, amountPaid: null }),
  ], "2026-11-01");
  assert.deepEqual(totals.get("c1"), { bills: 3, billed: 344000, due: 108000, overdue: 100000, unknown: 0, hidden: 0 });
  assert.deepEqual(totals.get("c2"), { bills: 1, billed: 118000, due: 0, overdue: 0, unknown: 1, hidden: 0 });
  assert.equal(partyBalanceText(totals.get("c1")), "₹1,080.00 due (₹1,000.00 overdue)");
  assert.equal(partyBalanceText(totals.get("c2")), "Not recorded");
  assert.equal(partyBalanceText(undefined), "—");
  assert.equal(partyBalanceText({ bills: 1, billed: 100, due: 50, overdue: 0, unknown: 0, hidden: 0 }), "₹0.50 due");
  assert.equal(partyBalanceText({ bills: 1, billed: 100, due: 0, overdue: 0, unknown: 0, hidden: 0 }), "Nothing due");
  assert.equal(partySummary("sale", totals.get("c1")), "3 sales · ₹3,440.00 billed · ₹1,080.00 due (₹1,000.00 overdue)");
  assert.equal(partySummary("purchase", { bills: 1, billed: 0, due: 0, overdue: 0, unknown: 0, hidden: 0 }), "1 purchase · ₹0.00 billed · Nothing due");
  assert.equal(partySummary("purchase", undefined), "No purchases from this supplier yet.");
});

test("older bills with no recorded payments are not counted as nothing owed", () => {
  const totals = partyBalances("sale", [
    sale({ id: "o1", amountPaid: null, total: "500", netTotal: "500" }),
    sale({ id: "o2", amountPaid: null, total: "500", netTotal: "500" }),
    sale({ id: "n1", customerId: "c2", customer: { id: "c2", name: "Shree" }, amountPaid: "0", total: "300", netTotal: "300" }),
    sale({ id: "o3", customerId: "c2", customer: { id: "c2", name: "Shree" }, amountPaid: null }),
  ], "2026-11-01");
  assert.equal(partyBalanceText(totals.get("c1")), "Not recorded");
  assert.equal(partySummary("sale", totals.get("c1")), "2 sales · ₹1,000.00 billed · Not recorded");
  assert.equal(partyBalanceText(totals.get("c2")), "₹300.00 due + older bills not recorded");
});

test("purchases with hidden cost prices do not read as nothing due", () => {
  // What GET /purchases returns to a member without pricing.view: no amounts.
  const redacted = { id: "p1", status: "COMPLETED", supplierId: "s1", supplier: { id: "s1", name: "Saint Glass Distributors" }, dueDate: "2026-10-01" };
  const totals = partyBalances("purchase", [redacted, { ...redacted, id: "p2" }], "2026-11-01");
  assert.deepEqual(totals.get("s1"), { bills: 2, billed: 0, due: 0, overdue: 0, unknown: 2, hidden: 2 });
  assert.equal(partyBalanceText(totals.get("s1")), "—");
  assert.equal(partySummary("purchase", totals.get("s1")), "2 purchases · amounts hidden for your role");
});

test("bill amounts list only what applies", () => {
  assert.deepEqual(billAmounts(sale({ discountTotal: "50", returnedTotal: "118", amountPaid: "500", dueDate: "2026-10-31" }), "2026-11-01"), [
    { label: "Subtotal", value: "₹1,000.00" },
    { label: "Discount", value: "− ₹50.00" },
    { label: "GST", value: "₹180.00" },
    { label: "Total", value: "₹1,180.00" },
    { label: "Returns", value: "− ₹118.00" },
    { label: "Net amount", value: "₹1,062.00" },
    { label: "Paid", value: "₹500.00" },
    { label: "Balance", value: "₹562.00 overdue" },
    { label: "Due date", value: "31 Oct 2026" },
  ]);
  assert.deepEqual(billAmounts(sale({ chargeGst: false, taxTotal: "0", total: "1000", status: "CANCELLED" })).map((l) => l.value), ["₹1,000.00", "Not charged", "₹1,000.00"]);
  assert.deepEqual(billAmounts({ id: "p" }), [{ label: "Amounts", value: "Hidden for your role" }]);
  assert.equal(billAmounts(sale({ amountPaid: null })).find((l) => l.label === "Paid").value, "Not recorded");
});

test("bill facts name the party and what was recorded", () => {
  assert.deepEqual(billFacts("sale", sale({ documentNumber: "INV/2026-27/0004", buyerGstin: "29AAPFU0939F1ZR", invoiceNumber: "PO-7", paymentMethod: "BANK_TRANSFER", customer: { name: "Karnataka Builders", phone: "9876543210" } })), [
    { label: "Invoice no.", value: "INV/2026-27/0004" },
    { label: "Date", value: "30 Oct 2026" },
    { label: "Customer", value: "Karnataka Builders" },
    { label: "Phone", value: "9876543210" },
    { label: "GSTIN", value: "29AAPFU0939F1ZR" },
    { label: "Reference", value: "PO-7" },
    { label: "Payment method", value: "Bank transfer" },
    { label: "Status", value: "Completed" },
  ]);
  const cancelled = billFacts("purchase", { id: "p", status: "CANCELLED", cancelReason: "Wrong supplier", purchaseDate: "2026-10-01T00:00:00.000Z", supplier: { name: "Saint Glass", gstin: "27AAPFU0939F1ZV" }, note: "Late" });
  assert.deepEqual(cancelled.map((l) => `${l.label}: ${l.value}`), ["Purchase no.: —", "Date: 1 Oct 2026", "Supplier: Saint Glass", "GSTIN: 27AAPFU0939F1ZV", "Status: Cancelled", "Cancel reason: Wrong supplier", "Note: Late"]);
});

test("bill items show quantity with its unit or option, price, GST and returns", () => {
  assert.deepEqual(billItems("sale", { id: "s", items: [
    { id: "i1", quantity: "2.500", unit: "SQUARE_FOOT", sellingPrice: "40", gstRate: "18.00", taxAmount: "18.00", lineTotal: "100.00", product: { name: "Clear Float Glass 5mm", unit: "SQUARE_FOOT" } },
    { id: "i2", quantity: "1", optionName: "Pack of 10", sellingPrice: "450", gstRate: "0", taxAmount: "0", lineTotal: "450", returnedQuantity: "1", product: { name: "Aluminium Door Handle" } },
  ] }), [
    { id: "i1", name: "Clear Float Glass 5mm", quantity: "2.5 square foot", price: "₹40.00", gst: "18% · ₹18.00", amount: "₹100.00", returned: "—" },
    { id: "i2", name: "Aluminium Door Handle", quantity: "1 Pack of 10", price: "₹450.00", gst: "0%", amount: "₹450.00", returned: "1" },
  ]);
  assert.deepEqual(billItems("purchase", { id: "p", items: [{ quantity: "3", product: null }] })[0], { id: "0", name: "Product unavailable", quantity: "3 piece", price: "—", gst: "—", amount: "—", returned: "—" });
});

test("payments oldest first, with refunds and earlier payments named", () => {
  assert.deepEqual(billPayments({ id: "s", payments: [
    { id: "b", amount: "100", method: "UPI", kind: "REFUND", paidAt: "2026-10-31T10:00:00.000Z" },
    { id: "a", amount: "500", method: "CASH", kind: "OPENING_BALANCE", paidAt: "2026-10-30T10:00:00.000Z" },
    { id: "c", amount: "80", method: "CARD", kind: "PAYMENT", paidAt: "2026-11-01T10:00:00.000Z" },
  ] }), [
    { id: "a", date: "30 Oct 2026", method: "Cash", amount: "₹500.00", kind: "Paid earlier" },
    { id: "b", date: "31 Oct 2026", method: "UPI", amount: "₹100.00", kind: "Refund" },
    { id: "c", date: "1 Nov 2026", method: "Card", amount: "₹80.00", kind: "Payment" },
  ]);
  assert.deepEqual(billPayments({ id: "s" }), []);
});
