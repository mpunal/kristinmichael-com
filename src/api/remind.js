/* POST /api/remind — email a post's PIN to the email address stored on it.
   The PIN is only ever sent to the stored address; it is never returned in
   the response and the caller cannot supply a different address.
   Without RESEND_API_KEY (local dev) the email payload is logged instead. */

import { json } from './response.js';

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
  const id = Number(body.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);

  const row = await env.DB.prepare(
    'SELECT name, email, pin FROM travel_posts WHERE id = ?'
  ).bind(id).first();
  if (!row) return json({ error: 'post not found' }, 404);

  const email = {
    from: 'Michael & Kristin <travel@kristinmichael.com>',
    to: [row.email],
    subject: 'Your PIN for the wedding travel board',
    text:
      `Hi ${row.name},\n\n` +
      `Your PIN for editing your post on the travel board at kristinmichael.com is: ${row.pin}\n\n` +
      `— Michael & Kristin`,
  };

  if (!env.RESEND_API_KEY) {
    console.log('[remind] RESEND_API_KEY not set — would send:', JSON.stringify(email));
  } else {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
    });
    if (!res.ok) {
      console.log('[remind] Resend error', res.status, await res.text());
      return json({ error: 'could not send the email — please contact Michael & Kristin directly' }, 502);
    }
  }

  return json({ ok: true, message: 'PIN sent to the email on this post' });
}

export const methods = {
  POST: sendPin,
};
