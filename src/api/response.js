/* Shared helpers for the /api routes.

   Cache-Control: no-store on every API response — the travel board is
   password-gated and edits must be visible immediately, so nothing here
   is ever safe to cache at the edge or in the browser. */

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

/* Parse a post id from a request body. Returns a positive integer, or NaN if
   the value is not one. Accepts a real number or an all-digit string; rejects
   null, undefined, arrays, objects, floats, and empty/non-numeric strings.

   Number(x) alone is too permissive here: Number(null) === 0 and Number([])
   === 0, so a null id would slip past an Number.isInteger check and be treated
   as id 0. This helper closes that gap. */
export function parseId(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : NaN;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return NaN;
}
