import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousAlias } from '../netlify/lib/anonymous-alias.mjs';
import { ALIAS_NAMES, createAliasRegistry, LEGACY_ALIASES } from '../netlify/lib/alias-registry.mjs';

function storage() {
  const rows = new Map();
  return {
    rows,
    async get(key) { await new Promise(resolve => setImmediate(resolve)); return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async setJSON(key, value, options) {
      assert.equal(options.onlyIfNew, true);
      await new Promise(resolve => setImmediate(resolve));
      if (rows.has(key)) return { modified: false };
      rows.set(key, structuredClone(value)); return { modified: true };
    },
  };
}

test('expanded first-name pool preserves known names and resolves the two Joshuas', async () => {
  assert.ok(ALIAS_NAMES.length >= 900);
  assert.equal(ALIAS_NAMES.length, new Set(ALIAS_NAMES).size);
  const store = storage(), resolve = createAliasRegistry(store);
  assert.equal(await resolve('BE-MBQX-QRM7'), 'Joshua');
  const other = await resolve('BE-9D3P-CWUT');
  assert.match(other, /^[A-Z][a-z]+$/);
  assert.notEqual(other, 'Joshua');
  for (const [id, name] of Object.entries(LEGACY_ALIASES)) assert.equal(await resolve(id), name);
  const restarted = createAliasRegistry(store);
  assert.equal(await restarted('BE-9D3P-CWUT'), other);
  assert.equal(await restarted('BE-MBQX-QRM7'), 'Joshua');
});

test('simultaneous independent functions cannot assign a name twice or rename one ID', async () => {
  const store = storage(), alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ids = [...alphabet].slice(0, 24).map(a => `BE-ABC${a}-EFGH`);
  const options = { names: ALIAS_NAMES.slice(0, 32), legacy: {} };
  const names = await Promise.all(ids.map(id => createAliasRegistry(store, options)(id)));
  assert.equal(new Set(names).size, ids.length);
  const same = await Promise.all(Array.from({ length: 12 }, () => createAliasRegistry(store, options)(ids[0])));
  assert.deepEqual(new Set(same), new Set([names[0]]));
});

test('assignments survive name-pool expansion and reordering', async () => {
  const store = storage(), id = 'BE-9D3P-CWUT';
  const first = await createAliasRegistry(store, { names: ['Maya', 'Nora'], legacy: {} })(id);
  assert.equal(await createAliasRegistry(store, { names: [...ALIAS_NAMES].reverse(), legacy: {} })(id), first);
});

test('interrupted reservation resumes; unavailable storage and exhausted pools never reuse names', async () => {
  const store = storage(), id = 'BE-9D3P-CWUT';
  let interrupt = true;
  const interrupted = { ...store, async setJSON(key, value, options) {
    if (interrupt && key.includes('/ids/')) { interrupt = false; throw Error('storage unavailable'); }
    return store.setJSON(key, value, options);
  } };
  await assert.rejects(createAliasRegistry(interrupted, { names: ['Maya'], legacy: {} })(id), /unavailable/);
  assert.equal(await createAliasRegistry(store, { names: ['Maya'], legacy: {} })(id), 'Maya');
  await assert.rejects(createAliasRegistry(store, { names: ['Maya'], legacy: {} })('BE-ABCD-EFGH'), /exhausted/);
  await assert.rejects(createAliasRegistry({ get: async () => { throw Error('storage unavailable'); } })(id), /unavailable/);
});

test('invalid identifiers never acquire a plausible alias or access storage', async () => {
  const resolve = createAliasRegistry({ get: () => assert.fail('invalid IDs must not access storage') });
  for (const id of [undefined, null, {}, '', 'unknown', 'be-abcd-efgh', 'BE-ABCD-EFGI', 'BE-ABCD-EFGH\n', '<@everyone>']) {
    assert.equal(await resolve(id), 'Unknown');
    assert.equal(anonymousAlias(id), 'Unknown');
  }
  assert.equal(anonymousAlias('BE-MBQX-QRM7'), 'Joshua');
});
