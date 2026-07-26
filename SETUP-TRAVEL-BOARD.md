# Travel Board — one-time setup

The guest travel board (`/travel`) needs three one-time things in Cloudflare
plus an email account. Everything else deploys automatically on `git push`.

## 1. Create the database (~2 min)

Already done — the database `wedding-travel` exists and its ID is recorded in
`wrangler.jsonc`. Schema changes are applied with:

```bash
npx wrangler d1 migrations apply wedding-travel --remote
```

Everything in `migrations/` runs in filename order, and Wrangler records what
it has applied in a `d1_migrations` table, so this is safe to re-run and safe
against the already-populated production database. Never hand-run
`d1 execute --file=` against a schema file — that bypasses the bookkeeping and
leaves the two databases silently out of step.

**Apply migrations before deploying code that depends on them.** A Worker that
queries a column the remote database doesn't have yet will throw on every
request until the migration lands.

## 2. Set the secrets (~2 min)

Cloudflare dashboard → **Workers & Pages → kristinmichael-com → Settings →
Variables and Secrets**, environment **Production**:

| Type | Name | Value |
|---|---|---|
| Secret | `GUEST_PASSWORD` | The password you'll share with guests |
| Secret | `RESEND_API_KEY` | From step 3 |

## 3. Email for "Forgot PIN" (~10 min)

Sign up at [resend.com](https://resend.com) — free tier, 100 emails/day and
3000/month, far above what ~100 guests will use.

1. **Domains → Add Domain → `kristinmichael.com`** (the root, not a subdomain).
   The domain carries no MX or TXT records today, so there is nothing to
   conflict with. Resend puts SPF and the bounce MX on a `send.` subdomain, so
   the root MX stays free if a real mailbox is ever added here.
2. Resend shows 3–4 DNS records. Add each in Cloudflare → **DNS**, copying the
   values **exactly as Resend displays them** — the `feedback-smtp` region in
   the MX record and the DKIM key are account-specific and must not be guessed:

   | Type | Name | Value |
   |---|---|---|
   | MX | `send` | `feedback-smtp.<your-region>.amazonses.com`, priority 10 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey` | the DKIM public key Resend gives you |
   | TXT | `_dmarc` | `v=DMARC1; p=none;` (optional, recommended) |

   MX and TXT records can't be proxied, so no orange/grey cloud toggle appears.
3. Wait for Resend to show **Verified** (usually minutes).
4. **API Keys → Create**, *Sending access*, restricted to `kristinmichael.com`.
   Name it `prod-worker`.
5. Save it as a Worker secret:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

The sender address is `travel@kristinmichael.com` (set in `src/api/remind.js`).
There is no reply-to and no inbox behind that address — replies bounce, by
choice.

Until Resend is configured, everything else works, and **"Forgot PIN?" reports
an honest 503** rather than claiming it sent mail.

### Throttling

Each post accepts one PIN reminder per 10 minutes (`REMIND_COOLDOWN_MS` in
`src/api/remind.js`). Further attempts get a `429` with a `Retry-After` header.
The guest password is shared with every guest, so without this any one of them
could mail-bomb another guest's inbox or drain the daily Resend quota. The
cooldown starts only after a message is genuinely on its way — a failed send
never locks anyone out.

## 4. Deploy & smoke test

Push to `main` → Cloudflare Workers Builds auto-deploys. Then:

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
cp .dev.vars.example .dev.vars                        # gitignored
npx wrangler d1 migrations apply wedding-travel --local
npx wrangler dev --port 8788
```

`.dev.vars.example` sets `EMAIL_DEV_MODE=true`, which logs Forgot-PIN
reminders instead of sending them — local runs can never reach a real guest's
inbox — and answers with a distinct `(dev) PIN reminder logged, not sent` so a
local result can't be mistaken for a real delivery.

**No Resend key belongs in `.dev.vars`.** Dev and production never share a
credential; the key lives only as a Worker secret.

Note: running a second `wrangler d1 execute` while `wrangler dev` is up can
hang on the local-D1 lock. Seed test data through the API instead.
