import { test } from "node:test";
import assert from "node:assert/strict";
import { canRecordPayment, indiaDay, paidAtFor, paymentRecordedMessage, paymentRequest, paymentStart } from "../src/record-payment.ts";

const now = new Date("2026-11-01T09:30:00.000Z"); // 3:00 pm in India
const sale = (extra = {}) => ({ id: "s1", status: "COMPLETED", documentNumber: "INV/2026-27/0003", saleDate: "2026-10-20T20:00:00.000Z", paymentMethod: "UPI", total: "1180.00", returnedTotal: "0", amountPaid: "180.00", payments: [], ...extra });
const entry = (extra = {}) => ({ amount: "500", opening: "", method: "CASH", paidOn: "2026-11-01", ...extra });

test("payments are offered while money is owed, or when earlier payments were never recorded", () => {
  assert.equal(canRecordPayment(sale()), true);
  assert.equal(canRecordPayment(sale({ amountPaid: "1180.00" })), false);
  assert.equal(canRecordPayment(sale({ amountPaid: null })), true);
  assert.equal(canRecordPayment(sale({ amountPaid: null, returnedTotal: "1180.00" })), false);
  assert.equal(canRecordPayment(sale({ status: "CANCELLED" })), false);
  assert.equal(canRecordPayment(sale({ total: undefined })), false);
  // A return lowers what can be paid; refunds already lowered amountPaid.
  assert.equal(canRecordPayment(sale({ returnedTotal: "1000.00" })), false);
  assert.equal(canRecordPayment(sale({ netTotal: "500.00", amountPaid: "400.00" })), true);
});

test("the form starts at the balance after returns, today, and the method last used", () => {
  const start = paymentStart("sale", sale({ returnedTotal: "200.00", payments: [{ kind: "PAYMENT", method: "CARD" }, { kind: "REFUND", method: "CASH" }] }), now);
  assert.deepEqual(start, { net: 98000, balance: 80000, amount: "800.00", method: "CARD", paidOn: "2026-11-01", minDay: "2026-10-21", maxDay: "2026-11-01" });
  assert.equal(paymentStart("sale", sale(), now).method, "UPI");
  assert.equal(paymentStart("purchase", { purchaseDate: "2026-10-01", total: "100", amountPaid: "0", paymentMethod: "UPI" }, now).method, "CASH");
  assert.deepEqual((({ balance, amount }) => ({ balance, amount }))(paymentStart("sale", sale({ amountPaid: null }), now)), { balance: null, amount: "" });
});

test("a past day is recorded at noon in India, today at the current time", () => {
  assert.equal(indiaDay("2026-10-31T19:00:00.000Z"), "2026-11-01");
  assert.equal(paidAtFor("2026-11-01", now), now.toISOString());
  assert.equal(paidAtFor("2026-10-25", now), "2026-10-25T12:00:00+05:30");
});

test("the request carries the amount, method, date and request id", () => {
  assert.deepEqual(paymentRequest("sale", sale(), entry({ amount: "500.5" }), "web_1", now), {
    amount: 50050,
    body: { amount: "500.50", method: "CASH", requestId: "web_1", paidAt: now.toISOString() },
  });
  assert.equal(paymentRequest("sale", sale(), entry({ amount: "1000" }), "web_1", now).body.amount, "1000.00");
});

test("amounts beyond what is still owed, after returns and refunds, are refused", () => {
  assert.deepEqual(paymentRequest("sale", sale(), entry({ amount: "1000.01" }), "web_1", now), { error: "The payment cannot be more than the ₹1,000.00 still owed." });
  assert.deepEqual(paymentRequest("sale", sale({ returnedTotal: "200" }), entry({ amount: "801" }), "web_1", now), { error: "The payment cannot be more than the ₹800.00 still owed." });
  // A refund after a return left ₹100 paid on a ₹980 net bill.
  assert.equal("body" in paymentRequest("sale", sale({ returnedTotal: "200", amountPaid: "100" }), entry({ amount: "880" }), "web_1", now), true);
  assert.deepEqual(paymentRequest("sale", sale(), entry({ amount: "0" }), "web_1", now), { error: "Enter a payment amount greater than zero, with up to two decimals." });
  assert.deepEqual(paymentRequest("sale", sale(), entry({ amount: "1.234" }), "web_1", now), { error: "Enter a payment amount greater than zero, with up to two decimals." });
});

test("the payment date stays between the bill date and today", () => {
  assert.deepEqual(paymentRequest("sale", sale(), entry({ paidOn: "2026-10-20" }), "web_1", now), { error: "The payment date cannot be before the bill date." });
  assert.equal(paymentRequest("sale", sale(), entry({ paidOn: "2026-10-21" }), "web_1", now).body.paidAt, "2026-10-21T12:00:00+05:30");
  assert.deepEqual(paymentRequest("sale", sale(), entry({ paidOn: "2026-11-02" }), "web_1", now), { error: "The payment date cannot be in the future." });
  assert.deepEqual(paymentRequest("purchase", { purchaseDate: "2026-10-01", total: "100", amountPaid: "0" }, entry({ amount: "10", paidOn: "" }), "web_1", now), { error: "Enter the date it was paid." });
});

test("an older bill first needs what was paid before this payment", () => {
  const older = sale({ amountPaid: null });
  assert.deepEqual(paymentRequest("sale", older, entry(), "web_1", now), { error: "Enter how much was paid before this payment (0 if nothing)." });
  assert.deepEqual(paymentRequest("sale", older, entry({ opening: "1200" }), "web_1", now), { error: "Paid before this payment cannot be more than the bill's ₹1,180.00." });
  assert.deepEqual(paymentRequest("sale", older, entry({ opening: "1000", amount: "200" }), "web_1", now), { error: "The payment cannot be more than the ₹180.00 still owed." });
  assert.deepEqual(paymentRequest("sale", older, entry({ opening: "0", amount: "200" }), "web_1", now).body, { amount: "200.00", method: "CASH", requestId: "web_1", paidAt: now.toISOString(), openingAmountPaid: "0.00" });
});

test("the confirmation names the amount and the bill", () => {
  assert.equal(paymentRecordedMessage("sale", sale(), 50000), "Payment of ₹500.00 recorded for INV/2026-27/0003.");
  assert.equal(paymentRecordedMessage("purchase", {}, 1000), "Payment to supplier of ₹10.00 recorded.");
});
