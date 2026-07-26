/* Throttle state for the "Forgot PIN?" button.

   Nullable with no default: a post that has never had a reminder sent has no
   cooldown, and NULL says that directly. (SQLite also rejects a non-constant
   default such as datetime('now') on ADD COLUMN, so a default was never an
   option here.)

   Stored as an ISO-8601 UTC string written by JS — new Date().toISOString() —
   NOT by datetime('now') the way created_at is. See src/api/remind.js for why
   the two columns deliberately differ. */
ALTER TABLE travel_posts ADD COLUMN last_remind_at TEXT;
