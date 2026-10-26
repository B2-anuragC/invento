import { test } from "node:test";
import assert from "node:assert/strict";
import { saleTotals, paymentAmount } from "../src/sale-model.ts";
const product = {
  id: "p",
  name: "Sheet",
  sellingPrice: "34.00",
  gstRate: "18",
};
test("bill rounds each line and GST independently like the API", () => {
  assert.deepEqual(
    saleTotals([{ product, quantity: "1.125", price: "34.00" }]),
    { subtotal: 38.25, tax: 6.89, total: 45.14 },
  );
  assert.deepEqual(
    saleTotals([
      { product: { ...product, gstRate: "0" }, quantity: "0.5", price: "0.01" },
    ]),
    { subtotal: 0.01, tax: 0, total: 0.01 },
  );
});
test("GST is rounded per line rather than after aggregating the bill", () => {
  assert.deepEqual(
    saleTotals(
      Array.from({ length: 3 }, () => ({
        product,
        quantity: "1",
        price: "0.03",
      })),
    ),
    { subtotal: 0.09, tax: 0.03, total: 0.12 },
  );
});
test("blank, negative, nonfinite and excess-precision inputs cannot be submitted", () => {
  for (const quantity of ["", "-1", "Infinity", "0", "1.0001"])
    assert.throws(
      () => saleTotals([{ product, quantity, price: "34" }]),
      /quantity/,
    );
  for (const price of ["", "-1", "NaN", "0", "1.001"])
    assert.throws(
      () => saleTotals([{ product, quantity: "1", price }]),
      /price/,
    );
});
test("full, credit and partial payment amounts are explicit", () => {
  assert.equal(paymentAmount("full", 45.14, ""), "45.14");
  assert.equal(paymentAmount("credit", 45.14, ""), "0.00");
  assert.equal(paymentAmount("partial", 45.14, "20.5"), "20.50");
  for (const value of ["", "0", "-1", "45.14", "46", "2.555"])
    assert.throws(
      () => paymentAmount("partial", 45.14, value),
      /Partial payment/,
    );
});
