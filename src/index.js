/* Worker entry point for kristinmichael.com.

   Static files live in public/ and are served by the ASSETS binding. This
   Worker exists to handle the /api routes, which Cloudflare's static-asset
   serving knows nothing about.

   Request flow: Cloudflare matches the request against public/ first and
   serves the file directly without invoking this Worker. Only requests with
   no matching asset reach fetch() below — which in practice means the /api
   routes plus genuine 404s. */

import { json } from './api/response.js';
import { methods as travelMethods } from './api/travel.js';
import { methods as remindMethods } from './api/remind.js';

const ROUTES = {
  '/api/travel': travelMethods,
  '/api/remind': remindMethods,
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];

    /* Not an API route — hand back to static assets so 404s render the
       site's own not-found response rather than a bare Worker error. */
    if (!route) return env.ASSETS.fetch(request);

    const handler = route[request.method];
    if (!handler) {
      const allowed = Object.keys(route).join(', ');
      return json({ error: 'method not allowed' }, 405, { Allow: allowed });
    }

    try {
      return await handler(request, env);
    } catch (err) {
      /* Surfaces in `wrangler tail` and the Workers logs. The guest never
         sees the internal message — only that something went wrong. */
      console.error(`[${request.method} ${pathname}]`, err?.stack || err);
      return json({ error: 'something went wrong — please try again' }, 500);
    }
  },
};
