import { test } from "node:test";
import assert from "node:assert/strict";
import { codeName, formatCell, indiaDate, indiaDateTime, money, quantity, unitName, utcDateTime } from "../src/format.ts";

test("money in rupees with Indian grouping; nothing when hidden", () => {
  assert.equal(money("1234567.5"), "₹12,34,567.50");
  assert.equal(money(0), "₹0.00");
  assert.equal(money(null), "—");
  assert.equal(money(undefined), "—");
  assert.equal(money("abc"), "—");
});

test("quantities keep up to three decimals and drop trailing zeros", () => {
  assert.equal(quantity("12.500"), "12.5");
  assert.equal(quantity("1200"), "1,200");
  assert.equal(quantity("1.9166666"), "1.917");
  assert.equal(quantity(null), "—");
});

test("dates are India calendar days; moments show India time", () => {
  // 20:00 UTC on 30 September is already 1 October in India.
  assert.equal(indiaDate("2026-09-30T20:00:00.000Z"), "1 Oct 2026");
  assert.equal(indiaDate("2026-11-01"), "1 Nov 2026");
  assert.equal(indiaDateTime("2026-11-01T09:35:00.000Z"), "1 Nov 2026, 3:05 pm");
  assert.equal(indiaDate("not a date"), "—");
  assert.equal(utcDateTime("2026-11-01T09:35:00.000Z"), "1 Nov 2026, 09:35 UTC");
  assert.equal(utcDateTime(null), "Not recorded");
});

test("codes read as words", () => {
  assert.equal(unitName("SQUARE_FOOT"), "square foot");
  assert.equal(codeName("BANK_TRANSFER"), "Bank transfer");
  assert.equal(codeName("UPI"), "UPI");
  assert.equal(codeName("INACTIVE"), "Inactive");
});

test("cells are formatted by column", () => {
  assert.equal(formatCell("sellingPrice", "40.00"), "₹40.00");
  assert.equal(formatCell("total", "₹212.40"), "₹212.40");
  assert.equal(formatCell("saleDate", "2026-10-31T19:00:00.000Z"), "1 Nov 2026");
  assert.equal(formatCell("updatedAt", "2026-11-01T09:35:00.000Z"), "1 Nov 2026, 3:05 pm");
  assert.equal(formatCell("quantity", "3.000"), "3");
  assert.equal(formatCell("gstRate", "18.00"), "18%");
  assert.equal(formatCell("unit", "PACK"), "pack");
  assert.equal(formatCell("paymentMethod", "CASH"), "Cash");
  assert.equal(formatCell("status", "Paid"), "Paid");
  assert.equal(formatCell("name", "Clear Float Glass 5mm"), "Clear Float Glass 5mm");
  assert.equal(formatCell("note", null), "—");
  assert.equal(formatCell("sku", 12), "12");
});
