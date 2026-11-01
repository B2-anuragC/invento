import { test } from "node:test";
import assert from "node:assert/strict";
import { billPaymentMethod, canReturnBill, hasReturns, noteRows, noteSettlement, returnableLines, returnPreview, returnSummary } from "../src/bill-returns.ts";

// INV/2026-27/0040: 3 glass panes at ₹100 with a ₹30 bill discount (₹10 each) and 18% GST, plus 2 handles; ₹100 paid by UPI.
const sale = {
  id: "sale-a",
  documentNumber: "INV/2026-27/0040",
  status: "COMPLETED",
  total: "554.60",
  returnedTotal: "0",
  netTotal: "554.60",
  amountPaid: "100",
  paymentMethod: "CASH",
  payments: [{ method: "UPI", kind: "PAYMENT" }],
  customer: { name: "Patil Constructions" },
  items: [
    { id: "glass", quantity: "3", unit: "PIECE", product: { name: "Clear Float Glass 5mm" }, lineTotal: "300", discountAmount: "30", taxAmount: "48.6" },
    { id: "handle", quantity: "2", unit: "PACK", optionName: "Pack of 10", product: { name: "Aluminium Door Handle" }, lineTotal: "200", discountAmount: "0", taxAmount: "36" },
  ],
  returns: [],
};

test("lists what is left to return on each line, after earlier notes", () => {
  const returned = { ...sale, returnedTotal: "106.20", returns: [{ id: "n1", documentNumber: "CN/2026-27/0001", returnDate: "2026-11-01T04:00:00.000Z", total: "106.2", refundAmount: "0", items: [{ saleItemId: "glass", quantity: "1", lineTotal: "100", discountAmount: "10", taxAmount: "16.2" }] }] };
  assert.deepEqual(returnableLines("sale", returned).map(({ name, sold, unit, returned: back, left }) => [name, sold, unit, back, left]), [
    ["Clear Float Glass 5mm", "3", "pieces", "1", "2"],
    ["Aluminium Door Handle · Pack of 10", "2", "", "0", "2"],
  ]);
  assert.equal(canReturnBill("sale", returned, true), true);
  assert.equal(canReturnBill("sale", returned, false), false);
  assert.equal(canReturnBill("sale", { ...returned, status: "CANCELLED" }, true), false);
  // List rows carry only each line's returned quantity.
  const listed = { ...sale, returns: undefined, items: sale.items.map((line) => ({ ...line, returnedQuantity: line.quantity })) };
  assert.equal(canReturnBill("sale", listed, true), false);
  assert.equal(hasReturns(returned), true);
  assert.equal(hasReturns(sale), false);
});

test("previews the note's value, first off the amount due and then refunded", () => {
  // One pane: 100 - 10 + 16.20 GST = 106.20, all off the 454.60 still owed.
  const one = returnPreview("sale", sale, { glass: "1" });
  assert.deepEqual([one.total, one.balanceReduction, one.refund, one.error], ["106.20", "106.20", "0.00", ""]);
  assert.deepEqual(one.items, [{ itemId: "glass", quantity: "1" }]);
  // Everything: 554.60, of which 454.60 is off the balance and 100 refunded.
  const all = returnPreview("sale", sale, { glass: "3", handle: "2" });
  assert.deepEqual([all.total, all.balanceReduction, all.refund], ["554.60", "454.60", "100.00"]);
  assert.equal(billPaymentMethod(sale), "UPI");
});

test("refuses a quantity beyond what is left, or none at all", () => {
  assert.match(returnPreview("sale", sale, { glass: "4" }).error, /^Clear Float Glass 5mm: Only 3 can be returned/);
  assert.match(returnPreview("sale", sale, { glass: "" }).error, /at least one item/);
  assert.deepEqual(returnPreview("sale", sale, { glass: "0" }).items, []);
});

test("hides values when prices are not shown (purchases without pricing.view)", () => {
  const purchase = { id: "p", status: "COMPLETED", items: [{ id: "l", quantity: "5", product: { name: "Glass", unit: "SQUARE_FOOT" } }] };
  assert.equal(returnableLines("purchase", purchase)[0].unit, "square foot");
  const preview = returnPreview("purchase", purchase, { l: "2" });
  assert.deepEqual([preview.total, preview.refund, preview.error], [null, null, ""]);
});

test("describes notes in the bills table and the notes table", () => {
  const notes = [
    { id: "n1", documentNumber: "CN/2026-27/0002", returnDate: "2026-11-01T03:31:08.161Z", total: "180", refundAmount: "0", refundMethod: null, reason: "Wrong size", items: [] },
    { id: "n2", documentNumber: "CN/2026-27/0003", returnDate: "2026-11-01T03:35:28.604Z", total: "360", refundAmount: "100", refundMethod: "UPI", reason: null, items: [] },
  ];
  const bill = { ...sale, documentNumber: "INV/2026-27/0030", returnedTotal: "540", returns: notes };
  assert.equal(returnSummary(bill), "₹540.00 · CN/2026-27/0002, CN/2026-27/0003");
  assert.equal(returnSummary(sale), "");
  assert.equal(noteSettlement("sale", notes[1]), "Refunded ₹100.00 by UPI and ₹260.00 off the amount due");
  assert.equal(noteSettlement("purchase", { total: "118", refundAmount: "0" }), "₹118.00 off the amount owed");
  assert.deepEqual(noteRows("sale", [sale, bill]).map((row) => [row.documentNumber, row.returnDate, row.billNumber, row.party, row.total, row.reason]), [
    ["CN/2026-27/0003", "2026-11-01", "INV/2026-27/0030", "Patil Constructions", "₹360.00", "—"],
    ["CN/2026-27/0002", "2026-11-01", "INV/2026-27/0030", "Patil Constructions", "₹180.00", "Wrong size"],
  ]);
});
