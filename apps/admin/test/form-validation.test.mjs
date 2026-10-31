import { test } from "node:test";
import assert from "node:assert/strict";
import { firstFieldError } from "../src/form-validation.ts";

const fields = [{ key: "name" }, { key: "phone", type: "tel" }, { key: "gstin", type: "gstin" }];

test("accepts valid and blank phone numbers and GSTINs", () => {
  assert.equal(firstFieldError(fields, { name: "Shop", phone: "+91 98765 43210", gstin: "27aapfu0939f1zv" }), "");
  assert.equal(firstFieldError(fields, { name: "Shop", phone: "", gstin: "" }), "");
});

test("reports an invalid phone number or GSTIN before sending", () => {
  assert.match(firstFieldError(fields, { phone: "abc12" }), /phone number/);
  assert.match(firstFieldError(fields, { gstin: "27AAPFU0939F1ZW" }), /GSTIN/);
});

test("checks HSN codes and GST rates before sending", () => {
  const product = [{ key: "hsnCode", type: "hsn" }, { key: "gstRate", type: "gst-rate" }];
  assert.equal(firstFieldError(product, { hsnCode: "7005 29", gstRate: "18" }), "");
  assert.equal(firstFieldError(product, { hsnCode: "", gstRate: "0.25" }), "");
  assert.match(firstFieldError(product, { hsnCode: "70052" }), /4, 6 or 8-digit HSN/);
  for (const gstRate of ["101", "18.555", "-5", "abc"]) assert.match(firstFieldError(product, { gstRate }), /GST rate from 0 to 100/);
});
