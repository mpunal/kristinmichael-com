-- Guest travel board — single table.
-- Apply locally:  npx wrangler d1 execute wedding-travel --local  --file=schema.sql
-- Apply to prod:  npx wrangler d1 execute wedding-travel --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS travel_posts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  arrival_airport   TEXT,
  arrival_date      TEXT,            -- 'YYYY-MM-DD' from <input type="date">
  arrival_time      TEXT,            -- free text, e.g. "around 3pm"
  departure_airport TEXT,
  departure_date    TEXT,
  departure_time    TEXT,
  ride              TEXT NOT NULL DEFAULT 'info',  -- 'need' | 'offer' | 'info'
  party_size        INTEGER,         -- group size (ride = need/info)
  seats             INTEGER,         -- open seats (ride = offer)
  pin               TEXT NOT NULL,   -- 4 digits, plaintext so it can be emailed back on "Forgot PIN"
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
