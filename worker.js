import { error } from './edge-functions/_shared/http.js';
import { onRequest as chatCompletions } from './edge-functions/v1/chat/completions.js';
import { onRequest as models } from './edge-functions/v1/models.js';
import { onRequest as bootstrap } from './edge-functions/admin/bootstrap.js';
import { onRequest as login } from './edge-functions/admin/login.js';
import { onRequest as logout } from './edge-functions/admin/logout.js';
import { onRequest as state } from './edge-functions/admin/state.js';
import { onRequest as accounts } from './edge-functions/admin/accounts.js';
import { onRequest as settings } from './edge-functions/admin/settings.js';
import { onRequest as keys } from './edge-functions/admin/keys.js';
import { onRequest as overview } from './edge-functions/admin/overview.js';
import { onRequest as oauthStart } from './edge-functions/admin/oauth/start.js';
import { onRequest as oauthPoll } from './edge-functions/admin/oauth/poll.js';
import { onRequest as keepalive } from './edge-functions/cron/keepalive.js';

const routes = {
  '/v1/chat/completions': chatCompletions,
  '/v1/models': models,
  '/admin/bootstrap': bootstrap,
  '/admin/login': login,
  '/admin/logout': logout,
  '/admin/state': state,
  '/admin/accounts': accounts,
  '/admin/settings': settings,
  '/admin/keys': keys,
  '/admin/overview': overview,
  '/admin/oauth/start': oauthStart,
  '/admin/oauth/poll': oauthPoll,
  '/cron/keepalive': keepalive,
};

function route(pathname) {
  if (routes[pathname]) return routes[pathname];
  const trimmed = pathname.replace(/\/+$/, '');
  return routes[trimmed] || null;
}

export default {
  async fetch(request, env, ctx) {
    const handler = route(new URL(request.url).pathname);
    if (!handler) return error('not found', 404, 'not_found');
    return handler({
      request,
      env,
      waitUntil: (promise) => {
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise);
        else Promise.resolve(promise).catch(() => {});
      },
    });
  },

  async scheduled(event, env, ctx) {
    const headers = { 'content-type': 'application/json' };
    if (env && env.CRON_TOKEN) headers['x-cron-token'] = env.CRON_TOKEN;
    const request = new Request('https://internal/cron/keepalive', { method: 'POST', headers });
    await keepalive({
      request,
      env,
      waitUntil: (promise) => {
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise);
        else Promise.resolve(promise).catch(() => {});
      },
    });
  },
};
