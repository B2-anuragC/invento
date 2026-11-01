import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage, fieldName, readableDetail } from "../src/errors.ts";

test("validation failures show the field reasons instead of the generic summary", () => {
  const body = {
    error: {
      message: "Request validation failed.",
      details: [
        { field: "phone", message: "Enter a valid phone number: 7 to 15 digits, optionally starting with +." },
        { field: "email", message: "email must be an email" },
      ],
    },
  };
  assert.equal(
    apiErrorMessage(body, 422),
    "Enter a valid phone number: 7 to 15 digits, optionally starting with +. Enter a valid email address.",
  );
});

test("repeated reasons are shown once", () => {
  const detail = { field: "phone", message: "Invalid phone." };
  assert.equal(apiErrorMessage({ error: { details: [detail, detail] } }, 422), "Invalid phone.");
});

test("falls back to the error message, then the top-level message", () => {
  assert.equal(apiErrorMessage({ error: { message: "Business access is unavailable." } }, 403), "Business access is unavailable.");
  assert.equal(apiErrorMessage({ error: { message: "Fallback", details: [] } }, 400), "Fallback");
  assert.equal(apiErrorMessage({ message: "Top level" }, 400), "Top level");
});

test("ignores malformed details and empty bodies", () => {
  assert.equal(apiErrorMessage({ error: { message: "Summary", details: [null, 4, { message: "" }] } }, 422), "Summary");
  assert.equal(apiErrorMessage({}, 500), "Request failed (500).");
  assert.equal(apiErrorMessage(null, 502), "Request failed (502).");
});

test("rewrites the API's rule wording with the field's name", () => {
  assert.equal(readableDetail("name", "name should not be empty"), "Name is required.");
  assert.equal(readableDetail("purchasePrice", "purchasePrice is not a valid decimal number."), "Purchase price must be a number.");
  assert.equal(readableDetail("sku", "sku must be shorter than or equal to 64 characters"), "SKU must be at most 64 characters.");
  assert.equal(readableDetail("minimumStock", "minimumStock must match /^\\d+$/ regular expression"), "Minimum stock is not in the right format.");
  assert.equal(readableDetail("paymentMethod", "paymentMethod must be one of the following values: CASH, UPI"), "Choose a valid payment method.");
  assert.equal(readableDetail("saleDate", "saleDate must be a valid ISO 8601 date string"), "Sale date must be a valid date.");
  assert.equal(readableDetail("items", "items must contain at least 1 elements"), "Add at least 1 item.");
  assert.equal(readableDetail("revision", "revision must not be less than 1"), "Revision must be at least 1.");
  assert.equal(readableDetail("chargeGst", "chargeGst must be a boolean value"), "Charge GST must be yes or no.");
});

test("names the bill line for a nested field", () => {
  assert.equal(readableDetail("items.1.quantity", "quantity is not a valid decimal number."), "Item 2: Quantity must be a number.");
  assert.equal(readableDetail("items.0.productId", "productId must be a string"), "Item 1: Product must be text.");
});

test("fields the form may not send, and messages already written for people", () => {
  assert.equal(readableDetail("expectedTotal", "property expectedTotal should not exist"), "Expected total is not accepted here.");
  assert.equal(readableDetail("discountAmount", "Enter a discount amount in rupees."), "Enter a discount amount in rupees.");
  assert.equal(readableDetail("note", "note must be odd"), "Note must be odd.");
  assert.equal(readableDetail(undefined, "Something went wrong."), "Something went wrong.");
});

test("field names", () => {
  assert.equal(fieldName("hsnCode"), "HSN code");
  assert.equal(fieldName("invoiceNumber"), "Invoice number");
  assert.equal(fieldName("contactName"), "Contact name");
});

test("one reason per field, preferring a specific one", () => {
  const body = { error: { message: "Request validation failed.", details: [
    { field: "sellingPrice", message: "sellingPrice must match /^\\d+$/ regular expression" },
    { field: "sellingPrice", message: "sellingPrice is not a valid decimal number." },
    { field: "minimumStock", message: "minimumStock is not a valid decimal number." },
    { field: "minimumStock", message: "minimumStock must match /^\\d+$/ regular expression" },
    { field: "sku", message: "sku must match /^\\w+$/ regular expression" },
  ] } };
  assert.equal(apiErrorMessage(body, 422), "Selling price must be a number. Minimum stock must be a number. SKU is not in the right format.");
});
