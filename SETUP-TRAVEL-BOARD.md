# Travel Board — one-time setup

The guest travel board (`/travel`) needs three one-time things in Cloudflare
plus an email account. Everything else deploys automatically on `git push`.

## 1. Create the database (~2 min)

Cloudflare dashboard → **Storage & Databases → D1 → Create database**
- Name it exactly `wedding-travel`
- Copy the **Database ID** (a UUID) and paste it into `wrangler.toml`,
  replacing `REPLACE-AFTER-D1-CREATE`. Commit and push that change.
- Open the database → **Console** tab → paste the contents of `schema.sql`
  → Execute.

## 2. Set the secrets (~2 min)

Cloudflare dashboard → **Workers & Pages → kristinmichael-com → Settings →
Variables and Secrets**, environment **Production**:

| Type | Name | Value |
|---|---|---|
| Secret | `GUEST_PASSWORD` | The password you'll share with guests |
| Secret | `RESEND_API_KEY` | From step 3 |

## 3. Email for "Forgot PIN" (~5 min)

Sign up at [resend.com](https://resend.com) (free tier, 100 emails/day —
plenty). Add the domain `kristinmichael.com`, add the DNS records it shows
you (your DNS is already on Cloudflare, so it's a few clicks), wait for
verification, then create an API key and save it as `RESEND_API_KEY` above.

The sender address is `travel@kristinmichael.com` (set in
`functions/api/remind.js`). Until Resend is configured, everything else
works — only the "Forgot PIN?" email will fail.

## 4. Deploy & smoke test

Push to `main` → Cloudflare Pages auto-deploys. Then:

1. `https://kristinmichael.com/api/travel` should return `{"error":"unauthorized"}`.
2. Open `https://kristinmichael.com/travel`, enter the guest password,
   post a test entry, click **Forgot PIN?** and check the email arrives,
   then delete the entry with your PIN.

## Managing posts

To remove any guest's post without their PIN: D1 → wedding-travel →
Console → `DELETE FROM travel_posts WHERE id = <id>;`
(`SELECT id, name FROM travel_posts;` to find it).

## Local development

```bash
echo 'GUEST_PASSWORD=butler2026' > .dev.vars   # gitignored
npx wrangler d1 execute wedding-travel --local --file=schema.sql
npx wrangler pages dev . --port 8788
```

Without `RESEND_API_KEY` in `.dev.vars`, Forgot-PIN emails are logged to
the console instead of sent.
