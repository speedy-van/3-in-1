CREATE TABLE IF NOT EXISTS signage_document (
  id integer PRIMARY KEY CHECK (id = 1),
  document jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE IF NOT EXISTS signage_devices (
  screen_id integer PRIMARY KEY CHECK (screen_id BETWEEN 1 AND 6),
  code_hash text,
  code_expires_at timestamptz,
  token_hash text,
  token_expires_at timestamptz,
  last_seen timestamptz,
  reported_revision integer
);
-- statement-break
CREATE TABLE IF NOT EXISTS signage_sessions (
  token_hash text PRIMARY KEY,
  credential_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
-- statement-break
CREATE TABLE IF NOT EXISTS signage_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
-- statement-break
CREATE TABLE IF NOT EXISTS signage_images (
  id uuid PRIMARY KEY,
  content bytea NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
