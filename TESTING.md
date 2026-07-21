# Test plan — guest travel board

End-to-end verification for `kristinmichael.com/travel` and the `/api` routes it
depends on.

This file lives outside `public/`, so it is not web-accessible.

---

## Ground rules

These tests run against **production**, against the **real D1 database that holds
real guest posts**. Three rules follow from that, and they are not negotiable.

**1. Every row a test creates must be namespaced.**
All test posts use a `name` beginning with `QATEST-<suite>-`, e.g.
`QATEST-A3-ride-offer`. Nothing else identifies a row as disposable — there is no
`is_test` column and adding one would be a schema change to a live database.

**2. Cleanup is scoped by that prefix, never by anything else.**

```sql
DELETE FROM travel_posts WHERE name LIKE 'QATEST-%';
```

A bare `DELETE FROM travel_posts` would erase real guests' travel plans. Do not
write one, even temporarily, even to "reset between runs."

**3. Snapshot before, verify after.**
Record the row count and max id before the run; confirm afterwards that only
`QATEST-` rows were added and that the pre-existing count is unchanged.

```sql
-- before
SELECT COUNT(*) AS total, COALESCE(MAX(id),0) AS max_id FROM travel_posts
  WHERE name NOT LIKE 'QATEST-%';
-- after: `total` must be identical
```

### Credentials

`GUEST_PASSWORD` is a Cloudflare secret. It is passed to test agents at dispatch
time and must **never** be written into this file, into a test artifact, into a
commit, or into a subagent's returned report. Refer to it as `$GUEST_KEY`.

### Tooling constraint — read before writing any UI test

`public/travel.js` uses native `confirm()`, `prompt()`, and `alert()` for the
delete and Forgot-PIN flows (lines 281–297). Native modals block every
subsequent automation event.

- **UI tests MUST use Playwright MCP** (`mcp__plugin_playwright_playwright__*`),
  arming `browser_handle_dialog` **before** the click that triggers the modal.
- **Never use the Chrome extension** (`mcp__claude-in-chrome__*`) for delete or
  Forgot-PIN. A modal there wedges the browser session and the run is lost.

---

## Suite A — API authentication and authorization

Pure HTTP. No browser. These are the highest-value tests: the shared password is
the only thing standing between the public internet and guests' contact details.

| # | Scenario | Request | Expect |
|---|---|---|---|
| A1 | No key rejected | `GET /api/travel`, no header | `401` `{"error":"unauthorized"}` |
| A2 | Wrong key rejected | `GET /api/travel`, `X-Guest-Key: wrong` | `401` |
| A3 | Empty key rejected | `X-Guest-Key:` (empty string) | `401` |
| A4 | Correct key accepted | `X-Guest-Key: $GUEST_KEY` | `200`, body has `posts` array |
| A5 | Case sensitivity | key with flipped case | `401` — comparison is exact |
| A6 | Whitespace-padded key | key with leading/trailing space | `200` — see note |
| A7 | Write blocked without key | `POST /api/travel`, no header, valid body | `401`, **and no row created** |
| A8 | Update blocked without key | `PUT`, no header | `401` |
| A9 | Delete blocked without key | `DELETE`, no header | `401` |
| A10 | Remind blocked without key | `POST /api/remind`, no header | `401` |

A7 is the one that matters most: assert the 401 **and** re-query the DB to prove
nothing was written. A rejected request that still writes is the bug this catches.

> **A6 note (learned from the run).** A key padded with leading or trailing
> whitespace is **accepted** (`200`), because RFC 9110 §5.5 requires HTTP
> recipients to strip optional whitespace around header field values before the
> handler ever sees them — Cloudflare's edge does this. This is not an
> application weakness: an attacker still needs the exact secret. The control
> that proves the comparison is otherwise byte-exact is a key with an extra
> *non-whitespace* character (`claudetestingx`), which correctly returns `401`.
> Assert `200` for padding, `401` for `claudetestingx`.

---

## Suite B — Input validation and boundaries

All requests authenticated. Each expects a `4xx` and **no row created**.

| # | Field | Input | Expect |
|---|---|---|---|
| B1 | body | `not json` | `400` invalid JSON body |
| B2 | body | empty body | `400` |
| B3 | `name` | omitted / `""` / `"   "` | `400` name is required |
| B4 | `email` | omitted | `400` email is required |
| B5 | `email` | `bad`, `a@b`, `@b.co`, `a b@c.co` | `400` invalid email address |
| B6 | `pin` | `123`, `12345`, `abcd`, `12a4`, omitted | `400` PIN must be exactly 4 digits |
| B7 | `pin` | `0000` | `201` — leading zeros are valid |
| B8 | `ride` | `carpool` | `400` invalid ride option |
| B9 | `ride` | omitted | `201`, defaults to `info` |
| B10 | `party_size` | `-1`, `21`, `1.5`, `abc` | `400` between 0 and 20 |
| B11 | `party_size` | `0` and `20` | `201` — inclusive bounds |
| B12 | text fields | exactly 200 chars | `201` |
| B13 | text fields | 201 chars | `400` too long |
| B14 | `name` | non-string (`123`, `null`, `[]`) | `400` invalid name |

B11 and B12/B13 are the off-by-one pair — `> 200` and `n > 20` are the exact
comparisons in `src/api/travel.js`, so 200 and 20 must pass while 201 and 21 fail.

---

## Suite C — CRUD lifecycle and PIN enforcement

The PIN is the only thing stopping one guest from editing or deleting another's
post. Test it hard.

**C1 — full round trip.** Create → assert `201` and the returned post echoes every
submitted field → `GET` and confirm it appears in the list → `PUT` with the correct
PIN changing `name` and `ride` → confirm the change persisted → `DELETE` with the
correct PIN → confirm it is gone from the list.

**C2 — PIN required to edit.** `PUT` another post's id with a wrong PIN → `403`
`wrong pin`, and the row is **unchanged** (re-read and diff it).

**C3 — PIN required to delete.** `DELETE` with wrong PIN → `403`, row still present.

**C4 — malformed PIN on edit/delete.** `pin: "12"`, `pin: null`, `pin` omitted →
`403`, not `500`.

**C5 — nonexistent id.** `PUT`/`DELETE`/`POST /api/remind` with `id: 999999` →
`404` post not found.

**C6 — invalid id types.** `id: "abc"`, `id: null`, `id: 1.5` → `400` invalid id.

**C7 — PIN never leaks.** This is the critical one. After creating a post, assert
the string `pin` appears **nowhere** in:
- the `201` create response
- the `GET /api/travel` list response
- the `PUT` response
- any error response

`PUBLIC_COLS` in `src/api/travel.js` deliberately omits it; C7 is the regression
test that keeps it omitted.

**C8 — cross-post isolation.** Create two posts with different PINs. Confirm post
1's PIN cannot edit or delete post 2.

**C9 — method routing.** `PATCH /api/travel` → `405` with
`Allow: GET, POST, PUT, DELETE`. `GET /api/remind` → `405` with `Allow: POST`.

---

## Suite D — Forgot-PIN / email

`RESEND_API_KEY` is **not** configured. The documented behavior is that the email
payload is logged instead of sent, and the endpoint still reports success.

**D1** — `POST /api/remind` with a valid id and key → `200`
`{"ok":true,"message":"PIN sent to the email on this post"}`.

**D2** — the response body must **not** contain the PIN. The whole point is that
the PIN goes only to the stored address.

**D3** — the caller cannot redirect the email: `POST` with
`{"id":N,"email":"attacker@evil.com"}` → the supplied address is ignored
(`src/api/remind.js` reads the address from the row, never from the body).

**D4** — unknown id → `404`.

**D5** — unauthenticated → `401`.

> Once Resend is configured, D1 must be re-run and a real inbox checked. Until
> then D1 only proves the endpoint contract, not that mail is delivered.

---

## Suite E — Browser UI (Playwright MCP only)

Arm `browser_handle_dialog` **before** any click that triggers a modal.

**E1 — gate blocks by default.** Load `/travel` with clean storage → the
`#gate` section is visible, `#app` is hidden, and no guest names or emails appear
anywhere in the DOM.

**E2 — wrong password.** Submit a wrong password → `#gate-error` becomes visible,
`#app` stays hidden.

**E3 — correct password.** Submit `$GUEST_KEY` → `#gate` hides, `#app` shows,
posts render.

**E4 — session persists.** Reload the page → still inside, no re-prompt
(`travel.js` caches the key in `localStorage` under `guestKey`).

**E5 — stale key recovers.** Set `localStorage.guestKey` to garbage, reload →
falls back to the gate rather than showing a broken empty app.

**E6 — create via form.** Fill the form, choose "I can offer a ride", set a count,
submit → the new card appears with an `Offering N seats` badge. Verify the
`offer` branch maps the count to `seats`, not `party_size` (`travel.js:193-194`).

**E7 — client-side validation.** Submit with a blank name → inline
`#form-error`, no network request. Same for a 3-digit PIN.

**E8 — edit flow.** Click Edit → form populates, title changes to
`Edit <name>'s post`, PIN field is **empty** and its hint changes → submit with
correct PIN → card updates. Then repeat with a wrong PIN → error reads
"That PIN doesn't match this post."

**E9 — cancel edit.** Click Edit then Cancel → form resets to create mode
(title, button label, PIN hint all revert).

**E10 — delete flow.** Pre-arm dialog handling. Click Delete → accept the
`confirm` → supply the correct PIN to the `prompt` → card disappears. Repeat with
a wrong PIN → `alert` reports the mismatch and the card remains.

**E11 — dismissing the confirm aborts.** Click Delete → dismiss the `confirm` →
no request is sent, post remains.

**E12 — Forgot PIN.** Click → accept confirm → success `alert` appears. The PIN
must not be visible anywhere in the page or the alert text.

**E13 — mobile viewport.** At 390×844, the form and post cards are usable and the
page does not scroll horizontally (`document.scrollWidth <= window.innerWidth`).
Do **not** rely on another suite's data being present — create your own post
first, `QATEST-E1-longtoken`, whose `arrival_airport` is a single 200-char
unbroken string (`A`×200). That is the realistic worst case a guest can enter,
and it must not break the layout. **Known to FAIL today** — see Findings §2 —
so this test currently documents an open defect rather than a passing state.

---

## Suite F — Security and regression

**F1 — private files stay private.** All must return `404`:

```
/.git/HEAD  /.git/index  /.git/config  /.git/logs/HEAD
/schema.sql  /wrangler.jsonc  /wrangler.toml  /package.json
/README.md  /SETUP-TRAVEL-BOARD.md  /TESTING.md
/src/index.js  /src/api/travel.js  /src/api/remind.js
/functions/api/travel.js  /.dev.vars  /.assetsignore
```

This is a **regression guard**. Every one of the `.git` paths returned `200` on
production on 2026-07-20 — full repository history was publicly downloadable. If
any of these ever returns `200` again, treat it as an incident, not a test
failure.

**F2 — public files stay public.** `/`, `/travel`, `/style.css`, `/script.js`,
`/travel.js`, `/robots.txt`, `/sitemap.xml`, `/images/hero-couple.jpg` → `200`.

**F3 — security headers** present on `/`: `content-security-policy`,
`x-frame-options: DENY`, `x-content-type-options: nosniff`,
`referrer-policy: strict-origin-when-cross-origin`.

**F4 — API responses are uncacheable.** Every `/api/*` response carries
`Cache-Control: no-store`. A cached authenticated response served to another
visitor would leak guest data.

**F5 — stored XSS.** Create a post with
`name` = `<img src=x onerror="document.title='XSS'">` and
`arrival_time` = `"><script>document.title='XSS2'</script>`. Load `/travel`,
authenticate, and assert `document.title` is unchanged and no element was
injected. `travel.js` renders with `textContent` throughout — F5 proves it stays
that way.

**F6 — mailto injection.** Create a post with an email containing a quote.
Confirm the rendered `<a href="mailto:...">` does not break out of the attribute.

**F7 — Unicode and emoji.** Name `Zoë 🎉 Ñuñez`, 200-char CJK string. Must
round-trip through D1 unchanged.

**F8 — SQL injection.** `name` = `'); DROP TABLE travel_posts;--`. The post is
stored **literally** and the table still exists. All queries use `.bind()`
parameters — F8 proves no one replaced one with string concatenation.

**F9 — `/travel` is noindex.** Confirm `<meta name="robots" content="noindex">`
is present, so guests' contact details never enter a search index.

---

## Suite G — Known gaps to confirm and document

These are expected to "fail" in the sense of revealing a real weakness. Do not
fix them mid-test; record the evidence.

**G1 — no rate limiting on the password gate.** Send 30 rapid `GET /api/travel`
requests with wrong keys. All return `401` with no throttling, lockout, or
delay. The shared password is therefore brute-forceable.

**G2 — no rate limiting on PIN attempts.** A 4-digit PIN is 10,000 candidates.
With G1's lack of throttling, anyone holding the guest password can iterate every
PIN and edit or delete any guest's post. Confirm ~20 wrong-PIN attempts draw no
throttling.

**G3 — PIN comparison is not constant-time.** `body.pin !== row.pin`
(`src/api/travel.js`). Note it; given G2 the timing channel is not the
weak link, but it should be recorded.

**G4 — PIN stored in plaintext.** By design — it is emailed back on Forgot-PIN,
so it cannot be hashed. Worth stating explicitly so it is a known accepted
tradeoff rather than an oversight.

CLAUDE.md requires rate limiting on auth and write operations. G1 and G2 are
direct violations. Expect a follow-up task, not a hotfix during testing.

---

## Parallel execution

Six agents, grouped so that no two mutate the same rows.

| Agent | Suites | Marker prefix | Tool |
|---|---|---|---|
| 1 | A (auth) | `QATEST-A-` | curl |
| 2 | B (validation) | `QATEST-B-` | curl |
| 3 | C (CRUD/PIN) | `QATEST-C-` | curl |
| 4 | D (remind) | `QATEST-D-` | curl |
| 5 | **all of E + F5/F6** | `QATEST-E-` / `QATEST-F-` | Playwright MCP |
| 6 | F (rest) + G | `QATEST-F-` | curl |

Each agent creates only rows carrying its own prefix and asserts only on those
rows. Suites B and C both write, but their prefixes keep them disjoint, so no
barrier is needed between them.

**All browser work is one agent, not several.** Playwright MCP drives a single
shared browser instance; two browser agents racing for it produce flaky failures
that masquerade as product bugs. The one browser agent owns the session
exclusively. (This is why the plan lists six agents, not seven.)

**Browser tests must use Playwright MCP, never the Chrome extension** — the
delete and Forgot-PIN flows fire native `confirm`/`prompt`/`alert` dialogs, and
only Playwright can pre-arm `browser_handle_dialog`. See the tooling constraint
at the top.

### Sequencing

1. **Pre-flight** (serial): confirm `GUEST_PASSWORD` works, snapshot the
   non-test row count.
2. **Fan out**: all seven agents in parallel.
3. **Cleanup** (serial): `DELETE FROM travel_posts WHERE name LIKE 'QATEST-%';`
4. **Post-flight** (serial): re-count non-test rows and confirm the number is
   unchanged from step 1, and that zero `QATEST-` rows remain.

Step 4 is not optional. It is the proof that testing against production left no
trace.

### Reporting

Each agent returns structured results: suite id, pass/fail, and for each failure
the request sent, the response received, and the expected response. Agents must
not include `$GUEST_KEY` or any PIN in their report.

---

## Findings from the 2026-07-20 run

First full execution. 6 agents, ~80 checks. Everything below is a **product**
finding; the test plan itself passed once A6/E13 were corrected above.

**Security core held everywhere it counted:** password auth enforced server-side,
per-post PIN isolation both directions, PIN never leaked in any response, stored
XSS neutralized (`textContent`), mailto injection neutralized (attribute
encoding), SQLi defeated (bound params), and every private path — including the
`.git` directory that was public earlier that day — now returns 404.

Open defects, highest priority first:

1. **PINs logged in plaintext (privacy).** `src/api/remind.js` logs the full
   email object — including the PIN — when `RESEND_API_KEY` is unset, and
   `wrangler.jsonc` sets `observability.head_sampling_rate: 1`, so 100% of
   Forgot-PIN calls persist a guest PIN into Workers logs. Fix before the guest
   password is distributed.

2. **Mobile horizontal scroll (E13).** A long unbroken string in a post
   (200-char airport value) overflows the layout on a 390px viewport — every
   ancestor up to `<html>` stretches to ~2085px. Add
   `overflow-wrap: break-word` to `.post-leg` / post text and `overflow-x`
   containment on `.posts-list`.

3. **No rate limiting (G1/G2 + remind).** The gate password is brute-forceable
   (30 wrong keys, no throttle), the 4-digit PIN is brute-forceable by anyone
   holding the gate password (10,000 candidates, no lockout), and `/api/remind`
   can be POSTed repeatedly to mail-bomb a guest's inbox once Resend is live.
   Directly violates the project's "rate limiting on auth and write operations"
   rule.

4. **`id: null` returns 404, not 400 (C6).** `Number(null) === 0` passes the
   `Number.isInteger` guard in `travel.js` and `remind.js`, so a null id is
   treated as id 0 rather than rejected. Fails safely; wrong status code. Add a
   `typeof body.id !== 'number'` guard.

5. **CSP blocks own analytics (minor).** The site injects the Cloudflare Insights
   beacon, but the CSP `script-src 'self'` forbids it, so analytics silently
   fail. Either allow `static.cloudflareinsights.com` or drop the beacon.

**Re-run required once Resend is configured:** Suite D (D1/D3) currently proves
only the endpoint contract, not mail delivery. Re-run against a real inbox to
confirm mail arrives, and arrives at the *stored* address rather than an
injected one.

**Safety record:** pre-flight and post-flight non-test row counts both 0 — the
run created and removed 20+ rows and left the production database exactly as
found.
