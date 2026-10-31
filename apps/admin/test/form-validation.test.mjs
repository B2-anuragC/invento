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
