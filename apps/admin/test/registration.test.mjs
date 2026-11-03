import { test } from "node:test";
import assert from "node:assert/strict";
import { entryRoute, guardRoute, networkErrorMessage, nextShopId } from "../src/registration.ts";

const member = (n) => ({ isPlatformAdmin: false, shops: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}`, slug: `s${i}` })) });
const admin = { isPlatformAdmin: true, shops: [] };

test("sends each account to its first page", () => {
  assert.equal(entryRoute(admin), "/overview");
  assert.equal(entryRoute(member(0)), "/setup");
  assert.equal(entryRoute(member(1)), "/shops");
});

test("lets signed-out visitors reach only sign-in and create account", () => {
  assert.equal(guardRoute("/register", null), "/register");
  assert.equal(guardRoute("/setup", null), "/login");
  assert.equal(guardRoute("/shops/x", null), "/login");
});

test("sends signed-in accounts away from create account and sign-in", () => {
  assert.equal(guardRoute("/register", member(2)), "/shops");
  assert.equal(guardRoute("/register", member(0)), "/setup");
  assert.equal(guardRoute("/register", admin), "/overview");
  assert.equal(guardRoute("/login", member(2)), "/shops");
  assert.equal(guardRoute("/login", admin), "/overview");
});

test("keeps a member without a shop on setup", () => {
  for (const route of ["/shops", "/shops/x", "/register", "/overview", "/setup"]) assert.equal(guardRoute(route, member(0)), "/setup");
});

test("offers setup to members, never to platform admins", () => {
  assert.equal(guardRoute("/setup", member(2)), "/setup");
  assert.equal(guardRoute("/setup", admin), "/overview");
});

test("leaves every other signed-in route as it is", () => {
  assert.equal(guardRoute("/overview", admin), "/overview");
  assert.equal(guardRoute("/businesses/b1", admin), "/businesses/b1");
  assert.equal(guardRoute("/shops/s1/products", member(1)), "/shops/s1/products");
});

test("fills the shop ID from the name until the owner edits it", () => {
  let state = { shopId: "", edited: false };
  state = nextShopId(state, { name: "Shree Aluminium" });
  assert.deepEqual(state, { shopId: "shree-aluminium", edited: false });
  state = nextShopId(state, { shopId: "My ID" });
  assert.deepEqual(state, { shopId: "my-id", edited: true });
  assert.equal(nextShopId(state, { name: "Other" }).shopId, "my-id");
});

test("a cleared shop ID stays cleared and edited", () => {
  assert.deepEqual(nextShopId({ shopId: "shop", edited: false }, { shopId: "" }), { shopId: "", edited: true });
});

test("a symbols-only name leaves the shop ID empty", () => {
  assert.deepEqual(nextShopId({ shopId: "", edited: false }, { name: "!!!" }), { shopId: "", edited: false });
});

test("says when Invento cannot be reached", () => {
  assert.equal(networkErrorMessage(new TypeError("Failed to fetch")), "Could not reach Invento. Check your connection and try again.");
  assert.equal(networkErrorMessage(new Error("An account with this email already exists.")), "An account with this email already exists.");
});

test("typing a shop ID one key at a time keeps the separators", () => {
  // Each keystroke adds one character to what the field currently shows.
  let state = { shopId: "", edited: false };
  for (const key of "Shree HQ") state = nextShopId(state, { shopId: state.shopId + key });
  assert.equal(state.shopId, "shree-hq");
  assert.equal(nextShopId(state, { shopId: "Café" }).shopId, "cafe");
});
