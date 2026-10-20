import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pageCount } from '../netlify/lib/page-counter.mjs';
import handler from '../netlify/functions/page-counter.mjs';

test('database counter retains the historic total, counts each refresh and deduplicates retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(await fs.readFile(new URL('../netlify/database/migrations/20261020100000_page_counter.sql', import.meta.url), 'utf8'));
    assert.equal(await pageCount(db), 4197761);
    const visitId = randomUUID();
    assert.equal(await pageCount(db, visitId), 4197762);
    assert.equal(await pageCount(db, visitId), 4197762, 'A retry cannot increment the same page load twice');
    const ids = Array.from({ length: 30 }, () => randomUUID());
    await Promise.all(ids.flatMap(id => [pageCount(db, id), pageCount(db, id)]));
    assert.equal(await pageCount(db), 4197792);
    await db.query("INSERT INTO babble_page_visit_receipts (id, created_at) VALUES ($1, now() - interval '31 days')", [randomUUID()]);
    await db.query("DELETE FROM babble_page_visit_receipts WHERE created_at < now() - interval '30 days'");
    assert.equal(await pageCount(db), 4197792, 'Receipt cleanup must never reset accumulated visits');
  } finally { await db.close(); }
});

test('invalid or oversized counter requests never reach storage', async () => {
  for (const body of ['{}', '{"visitId":"not-an-id"}', 'x'.repeat(129)]) {
    assert.equal((await handler(new Request('https://example.test/api/page-counter', { method: 'POST', body }))).status, 400);
  }
  assert.equal((await handler(new Request('https://example.test/api/page-counter', { method: 'DELETE' }))).status, 405);
  await assert.rejects(pageCount({ query: () => assert.fail('Storage must not be called') }, 'invalid'), /Invalid/);
});
