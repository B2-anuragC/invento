import { test } from "node:test";
import assert from "node:assert/strict";
import { changedFields, istDateInput } from "../src/transaction-edit.ts";

test("shows the bill date as the calendar day in India", () => {
  // 00:30 IST on 1 April 2026 is still 31 March in UTC.
  assert.equal(istDateInput("2026-03-31T19:00:00.000Z"), "2026-04-01");
  assert.equal(istDateInput("2026-03-31T18:29:00.000Z"), "2026-03-31");
  assert.equal(istDateInput("2026-10-31T10:00:00.000Z"), "2026-10-31");
  assert.equal(istDateInput("not a date"), "");
});

test("sends only fields the user changed", () => {
  const initial = { saleDate: "2026-04-01", invoiceNumber: "REF-1", note: null };
  assert.deepEqual(changedFields({ saleDate: "2026-04-01", invoiceNumber: "REF-1", note: "" }, initial), {});
  assert.deepEqual(changedFields({ saleDate: "2026-04-01", invoiceNumber: "REF-2", note: "" }, initial), { invoiceNumber: "REF-2" });
  assert.deepEqual(changedFields({ saleDate: "2026-04-02", invoiceNumber: "REF-1", note: "Delivered" }, initial), { saleDate: "2026-04-02", note: "Delivered" });
});
