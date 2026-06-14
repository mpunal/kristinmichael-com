# Michael & Kristin — kristinmichael.com

Static wedding website. Plain HTML/CSS/JS — no build step required.

## File structure

```
wedding-site/
├── index.html        # Home page (hero, countdown, details, CTA)
├── style.css         # All styles (shared across pages)
├── script.js         # Countdown timer + mobile nav
├── sitemap.xml       # SEO sitemap — update lastmod when content changes
├── robots.txt        # Allows all crawlers, points to sitemap
├── _headers          # Cloudflare Pages security headers
├── images/
│   ├── hero-couple.jpg   # ← Add your hero photo here (see below)
│   └── og-cover.jpg      # ← Open Graph cover image (1200×630 px)
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

## Deploying to Cloudflare Pages

1. Push this folder to a GitHub repo (e.g. `mpunal/kristinmichael-com`).
2. In the Cloudflare dashboard → **Pages** → **Create a project** → Connect to GitHub.
3. Select the repo. Build settings:
   - **Build command:** _(leave blank)_
   - **Build output directory:** `/` (or the subfolder if you nest it)
4. Click **Save and Deploy**.
5. In **Custom Domains**, add `kristinmichael.com` and `www.kristinmichael.com`.
   Cloudflare will auto-provision SSL.

`_headers` is automatically read by Cloudflare Pages for HTTP response headers.

## Adding more pages (e.g. Travel, Schedule)

1. Create a new HTML file, e.g. `travel.html`.
2. Copy the `<head>` block from `index.html` and update `<title>`, `<meta name="description">`, and `<link rel="canonical">`.
3. Add `<link rel="stylesheet" href="style.css">` and `<script src="script.js"></script>`.
4. Add the page to `<nav>` in every HTML file.
5. Add a new `<url>` entry in `sitemap.xml`.
