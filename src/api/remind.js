/* POST /api/remind — email a post's PIN to the email address stored on it.
   The PIN is only ever sent to the stored address; it is never returned in
   the response and the caller cannot supply a different address.

   Two rules hold everywhere in this file:

   1. Nothing sensitive reaches the logs. The PIN and the recipient address are
      never logged — only the post id. (A previous version leaked PINs in
      plaintext; that is what the id-only log lines below are protecting.)
   2. The response never claims more than actually happened. If mail could not
      be sent, the guest is told so rather than being handed a cheerful "sent". */

import { json, parseId } from './response.js';

/* One reminder per post per 10 minutes. The button sits behind the guest
   password, but that password is shared with every guest — without a throttle
   any one of them could mail-bomb another guest's inbox or drain the Resend
   free-tier daily quota by leaning on the button. */
const REMIND_COOLDOWN_MS = 10 * 60 * 1000;

/* Milliseconds since a last_remind_at stamp. Returns NaN when the post has
   never had a reminder (NULL) or the stamp is unreadable — and since every
   comparison against NaN is false, both cases fall through to "send it",
   which is the right way to fail: a bad stamp must not lock a guest out. */
function msSinceReminder(iso) {
  const then = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(then) ? NaN : Date.now() - then;
}

/* Hand the message to Resend. Returns either { message } describing what
   happened, or { error: Response } to return to the guest untouched.

   EMAIL_DEV_MODE is a real feature flag set only in .dev.vars — never in
   production. It logs a non-sensitive note instead of sending, so a local run
   can never reach a guest's inbox, and it answers with a deliberately
   different message so a dev result can never be mistaken for a real one. */
async function deliver(email, env, id) {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
    });
    if (!res.ok) {
      console.error('[remind] Resend error', res.status, await res.text());
      return {
        error: json(
          { error: 'could not send the email — please contact Michael & Kristin directly' },
          502,
        ),
      };
    }
    return { message: 'PIN sent to the email on this post' };
  }

  /* Compared against the exact string 'true', not just checked for truthiness:
     Worker vars always arrive as strings, so EMAIL_DEV_MODE=false would be the
     truthy string "false" and would switch dev mode ON — the precise opposite
     of what whoever wrote it meant. */
  if (env.EMAIL_DEV_MODE === 'true') {
    console.log(`[remind] dev mode — PIN reminder logged, not sent, for post ${id}`);
    return { message: '(dev) PIN reminder logged, not sent' };
  }

  console.error(`[remind] RESEND_API_KEY not set — cannot send PIN reminder for post ${id}`);
  return {
    error: json(
      { error: 'email is not configured — please contact Michael & Kristin directly' },
      503,
    ),
  };
}

async function sendPin(request, env) {
  if (!env.GUEST_PASSWORD || request.headers.get('X-Guest-Key') !== env.GUEST_PASSWORD) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const id = parseId(body.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);

  const row = await env.DB.prepare(
    'SELECT name, email, pin, last_remind_at FROM travel_posts WHERE id = ?'
  ).bind(id).first();
  if (!row) return json({ error: 'post not found' }, 404);

  const sinceLast = msSinceReminder(row.last_remind_at);
  if (sinceLast < REMIND_COOLDOWN_MS) {
    return json(
      {
        error:
          'A PIN reminder was sent recently — please check that inbox, including the ' +
          'spam folder, then try again in a few minutes.',
      },
      429,
      { 'Retry-After': String(Math.ceil((REMIND_COOLDOWN_MS - sinceLast) / 1000)) },
    );
  }

  const email = {
    from: 'Michael & Kristin <travel@kristinmichael.com>',
    to: [row.email],
    subject: 'Your PIN for the wedding travel board',
    text:
      `Hi ${row.name},\n\n` +
      `Your PIN for editing your post on the travel board at kristinmichael.com is: ${row.pin}\n\n` +
      `— Michael & Kristin`,
  };

  const outcome = await deliver(email, env, id);
  if (outcome.error) return outcome.error;

  /* Start the cooldown only now, after the message is genuinely on its way. A
     502 or 503 must not begin one, or a transient Resend outage would lock the
     guest out for ten minutes with no email to show for it.

     Written as an ISO-8601 UTC string from JS rather than via SQL's
     datetime('now') that created_at uses. datetime('now') yields
     "2026-07-26 18:04:11" — UTC, but with no timezone marker, and V8 reads that
     bare format as *local* time. Parsing it back would skew every comparison
     above by the machine's UTC offset. The trailing Z here is not decoration;
     it is what makes the cooldown correct. */
  await env.DB.prepare('UPDATE travel_posts SET last_remind_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();

  return json({ ok: true, message: outcome.message });
}

export const methods = {
  POST: sendPin,
};
