# Michael & Kristin — kristinmichael.com

Wedding website on **Cloudflare Workers** with static assets. Plain HTML/CSS/JS
for the site itself, plus a small Worker serving the `/api` routes behind
the guest travel board.

## File structure

Everything web-accessible lives in `public/`. Nothing outside it is ever
served — that boundary is what keeps the migrations and the API source
private, so do not move site files back to the repo root.

```
├── public/               # ← the ONLY publicly served directory
│   ├── index.html        # Home page (hero, countdown, details, CTA)
│   ├── travel.html       # Password-gated guest travel board
│   ├── style.css         # All styles (shared across pages)
│   ├── script.js         # Countdown timer + mobile nav
│   ├── travel.js         # Travel board client
│   ├── sitemap.xml       # SEO sitemap — update lastmod when content changes
│   ├── robots.txt        # Allows all crawlers, points to sitemap
│   ├── _headers          # Security headers applied to every response
│   └── images/
│       ├── hero-couple.jpg   # ← Add your hero photo here (see below)
│       └── og-cover.jpg      # ← Open Graph cover image (1200×630 px)
├── src/                  # Worker code — never served to browsers
│   ├── index.js          # Entry point: routes /api/*, else falls to assets
│   └── api/
│       ├── travel.js     # Travel board CRUD (D1)
│       ├── remind.js     # "Forgot PIN" email via Resend
│       └── response.js   # Shared JSON response helper
├── migrations/           # D1 schema history — applied by wrangler, in order
│   ├── 0001_initial_schema.sql
│   └── 0002_add_last_remind_at.sql
├── .dev.vars.example     # Template for local secrets (.dev.vars is gitignored)
├── wrangler.jsonc        # Worker config — the single source of truth
└── README.md
```

## Swapping in real photos

1. **Hero background** — add `images/hero-couple.jpg`. Aim for at least 2400px wide,
   landscape orientation. The CSS already references this path in `.hero-bg`.
   The green mountain gradient will automatically disappear once the file exists.

2. **Open Graph image** — add `images/og-cover.jpg` at 1200×630 px.
   This appears when guests share the site link on iMessage, Instagram, etc.

Both paths are referenced as relative URLs so they work on any domain.

## Editing the ceremony time

The countdown in `script.js` is set to **4:00 PM CT** as a placeholder:

```js
const WEDDING = new Date('2026-09-25T16:00:00-05:00');
```

Change `T16:00:00` to your actual ceremony start time (24-hour format, CT = `-05:00`).

## Deploying

Already wired up: pushing to `main` triggers Cloudflare Workers Builds, which
deploys automatically. There is nothing to run by hand.

`public/_headers` is read at deploy time and applied to every response.

### Local development

```bash
cp .dev.vars.example .dev.vars                        # gitignored
npx wrangler d1 migrations apply wedding-travel --local
npx wrangler dev --port 8788
```

`EMAIL_DEV_MODE=true` (from the example file) logs Forgot-PIN reminders instead
of sending them, so the whole board is testable offline and a local run can
never reach a real guest's inbox. No Resend key belongs in `.dev.vars` — it
lives only as a Worker secret, so dev and production never share a credential.

### Database changes

Schema changes go in `migrations/`, never a hand-run `d1 execute --file=`.
Wrangler applies them in filename order and records what it has applied, so
`npx wrangler d1 migrations apply wedding-travel --remote` is safe to re-run.
Apply migrations to remote **before** deploying code that reads the new
columns.

### A note on config

`wrangler.jsonc` is the **only** config file, deliberately. If a
`wrangler.toml` is ever added alongside it, Wrangler reads only the `.jsonc`
and the `.toml`'s bindings disappear with no warning or error — which is
exactly how production broke on 2026-07-21. Keep one file.

## Adding more pages (e.g. Schedule, Registry)

1. Create a new HTML file in `public/`, e.g. `public/schedule.html`.
2. Copy the `<head>` block from `index.html` and update `<title>`, `<meta name="description">`, and `<link rel="canonical">`.
3. Add `<link rel="stylesheet" href="style.css">` and `<script src="script.js"></script>`.
4. Add the page to `<nav>` in every HTML file.
5. Add a new `<url>` entry in `public/sitemap.xml`.

It will be live at `/schedule` — the `.html` extension is added automatically.

## Adding an API route

1. Write the handler in `src/api/`, exporting a `methods` map
   (`export const methods = { POST: myHandler }`).
2. Register the path in the `ROUTES` object in `src/index.js`.

Handlers receive `(request, env)` and return a `Response`. Uncaught errors are
logged and become a generic 500, so throwing is safe.
