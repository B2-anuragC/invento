import { test } from "node:test";
import assert from "node:assert/strict";
import { BILL_EDIT_RETURNS_MESSAGE, WALK_IN_EDIT_MESSAGE } from "@invento/shared";
import {
  addEditLine,
  billEditInput,
  billEditPreview,
  canEditBill,
  editFormFromBill,
  editLineError,
  editLineKey,
  editedSummary,
  productFromLines,
  productMatches,
  supplierOffersProduct,
} from "../src/bill-edit.ts";

// INV/2026-27/0033 on the QA shop: 3 handles at ₹180 + 18% GST, paid 637.20 by UPI.
const handle = { id: "handle", name: "Aluminium Door Handle", sku: "HDL-1", unit: "PIECE", gstRate: "18", sellingPrice: "180", purchasePrice: "120", category: "Hardware", sellingOptions: [{ id: "pack", name: "Pack of 10", unit: "PACK", sellingPrice: "1700" }] };
const glass = { id: "glass", name: "Clear Float Glass 5mm", sku: "GLS-5", unit: "SQUARE_FOOT", gstRate: "18", sellingPrice: "110", purchasePrice: "80", category: "Glass" };
const products = { handle, glass };
const sale = { id: "sale-1", status: "COMPLETED", total: "637.20", amountPaid: "637.20", revision: 1, chargeGst: true, discountTotal: "0", discountPercent: null, items: [{ productId: "handle", unit: "PIECE", quantity: "3.000", sellingPrice: "180.00" }] };
const extra = { requestId: "web_edit_1", reason: " Customer took one handle less ", refundMethod: "CASH" };

test("offers Edit items only on completed bills without returns, with prices shown", () => {
  assert.equal(canEditBill(sale, true), true);
  assert.equal(canEditBill(sale, false), false);
  assert.equal(canEditBill({ ...sale, status: "CANCELLED" }, true), false);
  assert.equal(canEditBill({ ...sale, returnedTotal: "212.40" }, true), false);
  assert.equal(canEditBill({ ...sale, returns: [{}] }, true), false);
  assert.equal(canEditBill({ ...sale, total: null }, true), false);
  assert.match(BILL_EDIT_RETURNS_MESSAGE, /returns/);
});

test("starts from the bill as it is and asks for a change before saving", () => {
  const form = editFormFromBill("sale", sale);
  assert.deepEqual(form, { lines: [{ productId: "handle", unit: "PIECE", quantity: "3", price: "180" }], chargeGst: true, discountMode: "amount", discountValue: "" });
  const preview = billEditPreview("sale", sale, form, products);
  assert.equal(preview.totalText, "637.20");
  assert.equal(preview.refund, "0.00");
  assert.equal(preview.error, "Change an item, quantity, price, discount or GST to save.");
  assert.equal(editFormFromBill("sale", { ...sale, discountTotal: "54", discountPercent: "10" }).discountValue, "10");
  assert.equal(editFormFromBill("sale", { ...sale, discountTotal: "20" }).discountValue, "20.00");
});

test("previews the new total and the refund, and sends the edit as priced", () => {
  // 2 handles + 1 sq ft of glass with ₹20 off: 470 − 20 = 450 + 81 GST = 531.00; 106.20 back.
  const lines = addEditLine("sale", [{ productId: "handle", unit: "PIECE", quantity: "2", price: "180" }], glass);
  const form = { lines, chargeGst: true, discountMode: "amount", discountValue: "20" };
  const preview = billEditPreview("sale", sale, form, products);
  assert.deepEqual([preview.subtotal, preview.discount, preview.tax, preview.total, preview.refund, preview.balanceDue, preview.error], [470, 20, 81, 531, "106.20", "0.00", ""]);
  assert.deepEqual(billEditInput("sale", sale, form, products, extra), {
    requestId: "web_edit_1", revision: 1, reason: "Customer took one handle less", chargeGst: true, expectedTotal: "531.00", refundMethod: "CASH", discountAmount: "20",
    items: [{ productId: "handle", unit: "PIECE", quantity: "2", sellingPrice: "180.00" }, { productId: "glass", unit: "SQUARE_FOOT", quantity: "1", sellingPrice: "110.00" }],
  });
});

test("leaves the rest due when the total goes up, and keeps walk-in sales paid in full", () => {
  const form = { ...editFormFromBill("sale", sale), lines: [{ productId: "handle", unit: "PIECE", quantity: "4", price: "180" }] };
  const preview = billEditPreview("sale", sale, form, products);
  assert.deepEqual([preview.totalText, preview.refund, preview.balanceDue, preview.error], ["849.60", "0.00", "212.40", ""]);
  assert.equal("refundMethod" in billEditInput("sale", sale, form, products, extra), false);
  assert.equal(billEditPreview("sale", { ...sale, customer: { isWalkIn: true } }, form, products).error, WALK_IN_EDIT_MESSAGE);
  // GST off is a change on its own: 540.00, 97.20 back.
  const off = billEditPreview("sale", sale, { ...editFormFromBill("sale", sale), chargeGst: false }, products);
  assert.deepEqual([off.totalText, off.refund, off.error], ["540.00", "97.20", ""]);
});

test("adds a selling option as its own line at the option's current price", () => {
  let lines = addEditLine("sale", editFormFromBill("sale", sale).lines, handle, "pack");
  lines = addEditLine("sale", lines, handle, "pack");
  assert.deepEqual(lines, [{ productId: "handle", unit: "PIECE", quantity: "3", price: "180" }, { productId: "handle", optionId: "pack", unit: "PACK", quantity: "2", price: "1700" }]);
  assert.equal(addEditLine("sale", lines, handle)[0].quantity, "4");
  // A typed price on an option line is ignored.
  const input = billEditInput("sale", sale, { ...editFormFromBill("sale", sale), lines: [lines[0], { ...lines[1], price: "1" }] }, products, extra);
  assert.deepEqual(input.items[1], { productId: "handle", sellingOptionId: "pack", quantity: "2", sellingPrice: "1700.00" });
  assert.equal(editLineKey(lines[1]), "handle::pack::PACK");
});

test("explains what is wrong with a line and leaves it out of the totals", () => {
  assert.equal(editLineError({ productId: "handle", unit: "PIECE", quantity: "0", price: "180" }, handle), "Enter a quantity greater than zero.");
  assert.equal(editLineError({ productId: "handle", unit: "PIECE", quantity: "1.5", price: "180" }, handle), "Enter whole pieces.");
  assert.equal(editLineError({ productId: "handle", optionId: "pack", unit: "PACK", quantity: "1.5", price: "1700" }, handle), "Enter a whole number of options.");
  assert.match(editLineError({ productId: "handle", optionId: "gone", unit: "PACK", quantity: "1", price: "1700" }, handle), /no longer available/);
  assert.equal(editLineError({ productId: "glass", unit: "SQUARE_FOOT", quantity: "2.5", price: "" }, glass), "Enter a price greater than zero.");
  assert.equal(editLineError({ productId: "glass", unit: "SQUARE_FOOT", quantity: "2.5", price: "110." }, glass), "");
  assert.match(editLineError({ productId: "x", quantity: "1", price: "1" }, undefined), /could not be loaded/);
  const form = { ...editFormFromBill("sale", sale), lines: [{ productId: "handle", unit: "PIECE", quantity: "", price: "180" }, { productId: "glass", unit: "SQUARE_FOOT", quantity: "1", price: "100" }] };
  const preview = billEditPreview("sale", sale, form, products);
  assert.equal(preview.error, "Aluminium Door Handle: Enter a quantity greater than zero.");
  assert.equal(preview.totalText, "118.00");
  assert.equal(billEditPreview("sale", sale, { ...form, lines: [] }, products).error, "Add at least one item.");
  const tooMuch = billEditPreview("sale", sale, { ...editFormFromBill("sale", sale), discountValue: "900" }, products);
  assert.notEqual(tooMuch.discountError, "");
  assert.equal(tooMuch.error, tooMuch.discountError);
  assert.equal(tooMuch.totalText, "637.20");
});

test("edits a purchase: one line per product at the typed price, no discount", () => {
  const purchase = { id: "purchase-1", status: "COMPLETED", total: "1416.00", amountPaid: null, revision: 3, chargeGst: true, items: [{ productId: "glass", quantity: "15", purchasePrice: "80" }] };
  const form = editFormFromBill("purchase", purchase);
  assert.deepEqual(form.lines, [{ productId: "glass", quantity: "15", price: "80" }]);
  const lines = addEditLine("purchase", [{ ...form.lines[0], quantity: "10" }], handle);
  assert.deepEqual(lines[1], { productId: "handle", quantity: "1", price: "120" });
  // 800 + 120 = 920 + 165.60 GST; nothing was paid, so all of it is due.
  const preview = billEditPreview("purchase", purchase, { ...form, lines }, products);
  assert.deepEqual([preview.totalText, preview.refund, preview.balanceDue, preview.error], ["1085.60", "0.00", "1085.60", ""]);
  assert.deepEqual(billEditInput("purchase", purchase, { ...form, lines }, products, extra), {
    requestId: "web_edit_1", revision: 3, reason: "Customer took one handle less", chargeGst: true, expectedTotal: "1085.60",
    items: [{ productId: "glass", quantity: "10", purchasePrice: "80.00" }, { productId: "handle", quantity: "1", purchasePrice: "120.00" }],
  });
});

test("searches only active products, and for purchases only what the supplier offers", () => {
  const catalog = [handle, glass, { ...glass, id: "old", name: "Old glass", status: "INACTIVE" }];
  assert.deepEqual(productMatches("sale", catalog, "gl").map((p) => p.id), ["glass"]);
  assert.deepEqual(productMatches("sale", catalog, "hdl").map((p) => p.id), ["handle"]);
  assert.deepEqual(productMatches("sale", catalog, " "), []);
  assert.deepEqual(productMatches("purchase", catalog, "a", { categories: ["Glass"], productIds: [] }).map((p) => p.id), ["glass"]);
  assert.equal(supplierOffersProduct({ categories: [], productIds: [] }, handle), true);
  assert.equal(supplierOffersProduct({ productIds: ["handle"] }, handle), true);
  assert.equal(supplierOffersProduct(null, handle), false);
});

test("keeps a product that could not be loaded with the details it was sold with", () => {
  const items = [
    { productId: "handle", unit: "PIECE", gstRate: "18.00", sellingPrice: "180.00", product: { name: "Aluminium Door Handle", unit: "PIECE" } },
    { productId: "handle", sellingOptionId: "pack", optionName: "Pack of 10", unit: "PACK", gstRate: "18.00", sellingPrice: "1700.00" },
  ];
  const product = productFromLines("sale", items, "handle");
  assert.equal(product.name, "Aluminium Door Handle");
  assert.equal(product.status, "INACTIVE");
  assert.deepEqual(product.sellingOptions, [{ id: "pack", name: "Pack of 10", unit: "PACK", sellingPrice: "1700.00" }]);
  assert.equal(editLineError({ productId: "handle", optionId: "pack", unit: "PACK", quantity: "1", price: "1700" }, product), "");
});

test("describes when and why a bill was edited, in India time", () => {
  assert.equal(editedSummary({ editedAt: null }), null);
  const summary = editedSummary({ editedAt: "2026-11-01T04:16:00Z", editReason: " Wrong quantity " });
  assert.match(summary.title, /^Edited · 1 Nov 2026, 9:46\sam$/);
  assert.equal(summary.reason, "Wrong quantity");
});
