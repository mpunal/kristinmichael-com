/* /api/travel — guest travel board CRUD.
   Auth: every request must carry header X-Guest-Key === env.GUEST_PASSWORD.
   The 4-digit pin is stored per post and never returned by any endpoint. */

import { json } from './response.js';

const TEXT_FIELDS = [
  'name', 'email', 'phone',
  'arrival_airport', 'arrival_date', 'arrival_time',
  'departure_airport', 'departure_date', 'departure_time',
];

const PUBLIC_COLS =
  'id, name, email, phone, arrival_airport, arrival_date, arrival_time, ' +
  'departure_airport, departure_date, departure_time, ride, party_size, seats, created_at';

function authorized(request, env) {
  return Boolean(env.GUEST_PASSWORD) &&
    request.headers.get('X-Guest-Key') === env.GUEST_PASSWORD;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/* Returns { fields } on success or { error } on failure. */
function validate(body) {
  const out = {};
  for (const f of TEXT_FIELDS) {
    let v = body[f] ?? '';
    if (typeof v !== 'string') return { error: `invalid ${f}` };
    v = v.trim();
    if (v.length > 200) return { error: `${f} is too long (200 characters max)` };
    out[f] = v || null;
  }
  if (!out.name) return { error: 'name is required' };
  if (!out.email) return { error: 'email is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: 'invalid email address' };

  const ride = body.ride ?? 'info';
  if (!['need', 'offer', 'info'].includes(ride)) return { error: 'invalid ride option' };
  out.ride = ride;

  for (const f of ['party_size', 'seats']) {
    const v = body[f];
    if (v === undefined || v === null || v === '') { out[f] = null; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 20) {
      return { error: `${f} must be a whole number between 0 and 20` };
    }
    out[f] = n;
  }
  return { fields: out };
}

function validPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

async function getPost(env, id) {
  return env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM travel_posts WHERE id = ?`)
    .bind(id).first();
}

async function list(request, env) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLS} FROM travel_posts
     ORDER BY arrival_date IS NULL, arrival_date, created_at`
  ).all();
  return json({ posts: results });
}

async function create(request, env) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  if (!body) return json({ error: 'invalid JSON body' }, 400);
  if (!validPin(body.pin)) return json({ error: 'PIN must be exactly 4 digits' }, 400);

  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);
  const f = v.fields;

  const { meta } = await env.DB.prepare(
    `INSERT INTO travel_posts
       (name, email, phone, arrival_airport, arrival_date, arrival_time,
        departure_airport, departure_date, departure_time, ride, party_size, seats, pin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    f.name, f.email, f.phone, f.arrival_airport, f.arrival_date, f.arrival_time,
    f.departure_airport, f.departure_date, f.departure_time, f.ride,
    f.party_size, f.seats, body.pin
  ).run();

  return json({ post: await getPost(env, meta.last_row_id) }, 201);
}

async function update(request, env) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  if (!body) return json({ error: 'invalid JSON body' }, 400);

  const id = Number(body.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);
  const row = await env.DB.prepare('SELECT pin FROM travel_posts WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'post not found' }, 404);
  if (!validPin(body.pin) || body.pin !== row.pin) return json({ error: 'wrong pin' }, 403);

  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);
  const f = v.fields;

  await env.DB.prepare(
    `UPDATE travel_posts SET
       name = ?, email = ?, phone = ?,
       arrival_airport = ?, arrival_date = ?, arrival_time = ?,
       departure_airport = ?, departure_date = ?, departure_time = ?,
       ride = ?, party_size = ?, seats = ?
     WHERE id = ?`
  ).bind(
    f.name, f.email, f.phone, f.arrival_airport, f.arrival_date, f.arrival_time,
    f.departure_airport, f.departure_date, f.departure_time, f.ride,
    f.party_size, f.seats, id
  ).run();

  return json({ post: await getPost(env, id) });
}

async function remove(request, env) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  if (!body) return json({ error: 'invalid JSON body' }, 400);

  const id = Number(body.id);
  if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);
  const row = await env.DB.prepare('SELECT pin FROM travel_posts WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'post not found' }, 404);
  if (!validPin(body.pin) || body.pin !== row.pin) return json({ error: 'wrong pin' }, 403);

  await env.DB.prepare('DELETE FROM travel_posts WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

export const methods = {
  GET: list,
  POST: create,
  PUT: update,
  DELETE: remove,
};
