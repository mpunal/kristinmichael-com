/* Shared JSON response helper for the /api routes.

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
