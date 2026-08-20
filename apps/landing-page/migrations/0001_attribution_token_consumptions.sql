CREATE TABLE IF NOT EXISTS attribution_token_consumptions (
  token TEXT NOT NULL,
  kind TEXT NOT NULL,
  consumed_by TEXT,
  consumed_at TEXT NOT NULL,
  PRIMARY KEY (token, kind)
);
