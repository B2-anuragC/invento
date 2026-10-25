const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

function setup(fetch, storageFails = false) {
  const source = fs.readFileSync(path.join(__dirname, '../services/api.ts'), 'utf8');
  const exports = {};
  let cleared = false;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: (name) => name === 'react-native' ? { Platform: { OS: 'web' } } : name === 'expo-constants' ? { default: {} } : {},
    process: { env: {} }, fetch, Headers, FormData, URLSearchParams,
    localStorage: { setItem() { if (storageFails) throw new Error('storage full'); }, removeItem() { cleared = true; } },
  });
  const session = { accessToken: 'old-access', refreshToken: 'old-refresh', businessId: 'shop', user: { id: 'owner' } };
  exports.appSession.current = session;
  return { api: exports, session, cleared: () => cleared };
}
const reply = (status, data) => new Response(JSON.stringify(data), { status });
const tokens = { accessToken: 'new-access', refreshToken: 'new-refresh', user: { id: 'owner' } };

test('late unauthorized response reuses rotated tokens without refreshing twice', async () => {
  let refreshes = 0;
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const { api, session } = setup(async (url, options) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return reply(200, tokens); }
    if (options.headers.get('Authorization') === 'Bearer new-access') return reply(200, []);
    if (url.endsWith('/inventory')) { await delayed; return reply(401, {}); }
    return reply(401, {});
  });
  const late = api.fetchInventory(session);
  await api.fetchSales(session);
  release();
  await late;
  assert.equal(refreshes, 1);
  await api.fetchSales(session);
  assert.equal(refreshes, 1);
});

test('network refresh failures preserve the session', async () => {
  const state = setup(async (url) => { if (url.endsWith('/auth/refresh')) throw new Error('offline'); return reply(401, {}); });
  await assert.rejects(state.api.fetchSales(state.session), /Check your connection/);
  assert.equal(state.api.appSession.current, state.session);
  assert.equal(state.cleared(), false);
});

test('rejected refresh token clears the session', async () => {
  const state = setup(async () => reply(401, {}));
  await assert.rejects(state.api.fetchSales(state.session), /Please sign in again/);
  assert.equal(state.api.appSession.current, null);
  assert.equal(state.cleared(), true);
});

test('storage failure after rotation does not log out', async () => {
  const state = setup(async (url, options) => url.endsWith('/auth/refresh') ? reply(200, tokens) : reply(options.headers.get('Authorization') === 'Bearer new-access' ? 200 : 401, []), true);
  await state.api.fetchSales(state.session);
  assert.equal(state.api.appSession.current.refreshToken, 'new-refresh');
  assert.equal(state.cleared(), false);
});
