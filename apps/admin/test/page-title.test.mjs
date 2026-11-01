import { test } from "node:test";
import assert from "node:assert/strict";
import { platformPageTitle, shopPageTitle } from "../src/page-title.ts";

test("platform pages are named after the open section", () => {
  assert.equal(platformPageTitle(null), "Sign in · Invento admin");
  assert.equal(platformPageTitle("/overview"), "Overview · Invento admin");
  assert.equal(platformPageTitle("/businesses"), "Businesses · Invento admin");
  assert.equal(platformPageTitle("/users/u1"), "User · Invento admin");
  assert.equal(platformPageTitle("/audit-logs"), "Audit log · Invento admin");
  assert.equal(platformPageTitle("/shops"), "Businesses · Invento admin");
  assert.equal(platformPageTitle("/nowhere"), "Page not found · Invento admin");
});

test("shop pages name the tab and the shop", () => {
  assert.equal(shopPageTitle("Sales", "QA Glass & Hardware"), "Sales · QA Glass & Hardware · Invento admin");
  assert.equal(shopPageTitle("Team and roles"), "Team and roles · Invento admin");
  assert.equal(shopPageTitle("Products", "  "), "Products · Invento admin");
});
