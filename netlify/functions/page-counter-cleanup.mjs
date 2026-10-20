import { getDatabase } from '@netlify/database';

export default async () => {
  // Only random retry receipts expire. The accumulated visit total is retained.
  await getDatabase().pool.query("DELETE FROM babble_page_visit_receipts WHERE created_at < now() - interval '30 days'");
};
export const config = { schedule: '0 4 * * *' };
