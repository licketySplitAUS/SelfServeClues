export const incrementQuery = `
  WITH new_visit AS (
    INSERT INTO babble_page_visit_receipts (id) VALUES ($1)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  UPDATE babble_page_counter
  SET total = total + (SELECT count(*) FROM new_visit)
  WHERE name = 'clues'
  RETURNING total
`;

export const validVisitId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function pageCount(pool, visitId = null) {
  if (visitId !== null && !validVisitId(visitId)) throw new Error('Invalid page visit ID.');
  const result = visitId === null
    ? await pool.query("SELECT total FROM babble_page_counter WHERE name = 'clues'")
    : await pool.query(incrementQuery, [visitId]);
  const count = Number(result.rows[0]?.total);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Page counter is unavailable.');
  return count;
}
