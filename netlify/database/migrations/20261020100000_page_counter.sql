CREATE TABLE babble_page_counter (
  name text PRIMARY KEY,
  total bigint NOT NULL CHECK (total >= 0)
);

INSERT INTO babble_page_counter (name, total)
VALUES ('clues', 4197761)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE babble_page_visit_receipts (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX babble_page_visit_receipts_created_at
ON babble_page_visit_receipts (created_at);
