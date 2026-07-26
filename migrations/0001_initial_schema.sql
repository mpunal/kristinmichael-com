/* Guest travel board — baseline schema.

   Applied by `npx wrangler d1 migrations apply wedding-travel` — see README.
   This was the repo's schema.sql, applied by hand before migrations existed,
   so the production table already matches it. IF NOT EXISTS makes replaying it
   against that live table a no-op, which is what lets Wrangler adopt the
   existing database without recreating anything.

   This file uses only block comments, so a D1 dashboard console that flattens
   multi-line input into one line can't have a comment swallow the statement. */
CREATE TABLE IF NOT EXISTS travel_posts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  arrival_airport   TEXT,
  arrival_date      TEXT,            /* 'YYYY-MM-DD' from <input type="date"> */
  arrival_time      TEXT,            /* free text, e.g. "around 3pm" */
  departure_airport TEXT,
  departure_date    TEXT,
  departure_time    TEXT,
  ride              TEXT NOT NULL DEFAULT 'info',  /* 'need' | 'offer' | 'info' */
  party_size        INTEGER,         /* group size (ride = need/info) */
  seats             INTEGER,         /* open seats (ride = offer) */
  pin               TEXT NOT NULL,   /* 4 digits, plaintext so it can be emailed back on "Forgot PIN" */
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
