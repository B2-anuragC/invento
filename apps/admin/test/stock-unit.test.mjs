import { test } from "node:test";
import assert from "node:assert/strict";
import { stockAmount } from "../src/stock-unit.ts";

test("names stock units after a quantity", () => {
  assert.equal(stockAmount("150", "PIECE"), "150 pieces");
  assert.equal(stockAmount(1, "PIECE"), "1 piece");
  assert.equal(stockAmount("2.25", "DOZEN"), "2.25 dozen");
  assert.equal(stockAmount("1.9166666666666666667", "DOZEN"), "1.917 dozen");
  assert.equal(stockAmount(139, "SQUARE_FOOT"), "139 sq ft");
  assert.equal(stockAmount(1, "BOX"), "1 box");
  assert.equal(stockAmount(3, "NEW_UNIT"), "3 new unit");
});
