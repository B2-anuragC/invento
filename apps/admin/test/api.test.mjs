import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TAKEN_MESSAGE } from "@invento/shared";
import { api, clearSession, createShop, login, register } from "../src/api.ts";

const session = { accessToken: "access-1", refreshToken: "refresh-1" };
const reply = (status, data) => new Response(JSON.stringify(status < 400 ? { success: true, data } : data), { status, headers: { "Content-Type": "application/json" } });
let calls;
let routes;
beforeEach(() => {
  calls = [];
  routes = {};
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined, auth: new Headers(init.headers).get("Authorization") };
    calls.push(call);
    const route = routes[`${call.method} ${call.url}`];
    if (!route) throw new Error(`Unexpected ${call.method} ${call.url}`);
    return route(call);
  };
});
afterEach(() => clearSession());

const user = { name: "QA Owner", email: "owner@example.test", password: "Valid#Pass1" };

test("register signs the new account in and reads its panel access", async () => {
  routes["POST /api/auth/register"] = () => reply(201, session);
  routes["GET /api/auth/panel-access"] = () => reply(200, { isPlatformAdmin: false, shops: [] });
  assert.deepEqual(await register(user), { isPlatformAdmin: false, shops: [] });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ["POST /api/auth/register", "GET /api/auth/panel-access"]);
  assert.deepEqual(calls[0].body, user);
  assert.equal(calls[1].auth, "Bearer access-1");
});

test("a double submit sends one registration", async () => {
  routes["POST /api/auth/register"] = () => reply(201, session);
  routes["GET /api/auth/panel-access"] = () => reply(200, { isPlatformAdmin: false, shops: [] });
  const [first, second] = await Promise.all([register(user), register(user)]);
  assert.deepEqual(first, second);
  assert.equal(calls.filter((c) => c.url === "/api/auth/register").length, 1);
});

test("a taken email is reported and leaves no session", async () => {
  routes["POST /api/auth/register"] = () => reply(409, { success: false, error: { message: EMAIL_TAKEN_MESSAGE } });
  await assert.rejects(register(user), { message: EMAIL_TAKEN_MESSAGE });
  routes["GET /api/anything"] = () => reply(200, {});
  await api("/anything");
  assert.equal(calls.at(-1).auth, null);
});

test("an unreachable API gets a connection message", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(register(user), { message: "Could not reach Invento. Check your connection and try again." });
});

test("an account without a shop can sign in and go on to setup", async () => {
  routes["POST /api/auth/login"] = () => reply(201, session);
  routes["GET /api/auth/panel-access"] = () => reply(200, { isPlatformAdmin: false, shops: [] });
  assert.deepEqual(await login(user.email, user.password), { isPlatformAdmin: false, shops: [] });
  assert.equal(calls.some((c) => c.url === "/api/auth/logout"), false);
});

test("createShop sends a clean name and shop ID, then refreshes panel access", async () => {
  const shop = { id: "b1", name: "Shree Aluminium", slug: "shree-aluminium" };
  routes["POST /api/auth/login"] = () => reply(201, session);
  let shops = [];
  routes["GET /api/auth/panel-access"] = () => reply(200, { isPlatformAdmin: false, shops });
  await login(user.email, user.password);
  routes["POST /api/businesses"] = () => { shops = [shop]; return reply(201, shop); };
  const result = await createShop({ name: "  Shree Aluminium ", slug: "Shree Aluminium!" });
  const post = calls.find((c) => c.url === "/api/businesses");
  assert.deepEqual(post.body, { name: "Shree Aluminium", slug: "shree-aluminium" });
  assert.equal(post.auth, "Bearer access-1");
  assert.equal(calls.at(-1).url, "/api/auth/panel-access");
  assert.deepEqual(result, { shop, access: { isPlatformAdmin: false, shops: [shop] } });
});

test("a double click creates one shop", async () => {
  const shop = { id: "b1", name: "Shop", slug: "shop" };
  routes["POST /api/businesses"] = () => reply(201, shop);
  routes["GET /api/auth/panel-access"] = () => reply(200, { isPlatformAdmin: false, shops: [shop] });
  await Promise.all([createShop({ name: "Shop", slug: "shop" }), createShop({ name: "Shop", slug: "shop" })]);
  assert.equal(calls.filter((c) => c.url === "/api/businesses").length, 1);
});
