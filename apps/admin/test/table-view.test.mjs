import { test } from "node:test";
import assert from "node:assert/strict";
import { pageOf, pageSummary, searchRows } from "../src/table-view.ts";
import { formatCell } from "../src/format.ts";

const bills = [
  { id: "1", documentNumber: "INV/2026-27/0001", party: "Patil Constructions", total: "1180.00", saleDate: "2026-11-01T06:00:00.000Z", status: "COMPLETED" },
  { id: "2", documentNumber: "INV/2026-27/0002", party: "Shree Fabricators", total: "590.00", saleDate: "2026-10-30T06:00:00.000Z", status: "CANCELLED" },
  { id: "3", documentNumber: "INV/2026-27/0003", party: "Karnataka Builders", total: "2360.00", saleDate: "2026-10-30T06:00:00.000Z", status: "COMPLETED", note: "Patil" },
];
const keys = ["documentNumber", "party", "total", "saleDate", "status"];
const ids = (rows) => rows.map((row) => row.id);

test("search matches every word against the shown columns, ignoring case and spaces", () => {
  assert.deepEqual(ids(searchRows(bills, keys, "", formatCell)), ["1", "2", "3"]);
  assert.deepEqual(ids(searchRows(bills, keys, "  patil ", formatCell)), ["1"]); // the note column is not shown
  assert.deepEqual(ids(searchRows(bills, keys, "inv/2026-27/0002", formatCell)), ["2"]);
  assert.deepEqual(ids(searchRows(bills, keys, "builders 30 oct", formatCell)), ["3"]);
  assert.deepEqual(ids(searchRows(bills, keys, "cancelled", formatCell)), ["2"]);
  assert.deepEqual(ids(searchRows(bills, keys, "nobody", formatCell)), []);
});

test("search finds amounts as shown and as stored", () => {
  assert.deepEqual(ids(searchRows(bills, keys, "₹1,180", formatCell)), ["1"]);
  assert.deepEqual(ids(searchRows(bills, keys, "2360", formatCell)), ["3"]);
  assert.deepEqual(ids(searchRows([{ id: "x", meta: { a: 1 } }], ["meta"], "a", () => "")), []);
});

test("pages of rows, moved back inside the list when it shrinks", () => {
  const rows = Array.from({ length: 60 }, (_, index) => index + 1);
  assert.deepEqual(pageOf(rows, 1, 25), { rows: rows.slice(0, 25), page: 1, pages: 3, from: 1, to: 25, total: 60 });
  assert.deepEqual((({ page, from, to }) => ({ page, from, to }))(pageOf(rows, 3, 25)), { page: 3, from: 51, to: 60 });
  assert.deepEqual((({ page, from, to }) => ({ page, from, to }))(pageOf(rows, 9, 25)), { page: 3, from: 51, to: 60 });
  assert.deepEqual((({ page, from, to }) => ({ page, from, to }))(pageOf(rows, 0, 50)), { page: 1, from: 1, to: 50 });
  assert.deepEqual(pageOf([], 2, 25), { rows: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
});

test("the footer says how many rows are shown", () => {
  assert.equal(pageSummary(pageOf([1], 1, 25), false), "1 record");
  assert.equal(pageSummary(pageOf([1, 2, 3], 1, 25), false), "3 records");
  assert.equal(pageSummary(pageOf([1, 2], 1, 25), true), "2 matches");
  assert.equal(pageSummary(pageOf([1], 1, 25), true), "1 match");
  assert.equal(pageSummary(pageOf(Array(134).fill(0), 2, 25), false), "Showing 26–50 of 134 records");
  assert.equal(pageSummary(pageOf(Array(30).fill(0), 1, 25), true), "Showing 1–25 of 30 matches");
  assert.equal(pageSummary(pageOf([], 1, 25), true), "No matches");
});
