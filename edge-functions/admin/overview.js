import { guard } from '../_shared/admin.js';
import { listAccounts, publicView } from '../_shared/accounts.js';
import { accountContext } from '../_shared/upstream.js';
import { read as readStats } from '../_shared/stats.js';
import { json } from '../_shared/http.js';

function quotaView(ctx) {
  const q = (ctx && ctx.quota) || {};
  return {
    total: q.total === undefined || q.total === null ? null : q.total,
    used: q.used === undefined || q.used === null ? null : q.used,
    remaining: q.remaining === undefined || q.remaining === null ? null : q.remaining,
    exceeded: !!q.exceeded,
    plan: ctx && ctx.plan ? { name: ctx.plan.name || '', userType: ctx.plan.user_type || '', isPersonal: !!ctx.plan.is_personal_version } : null,
    user: ctx && ctx.user ? { name: ctx.user.name || '', email: ctx.user.email || '', isBiz: !!ctx.user.is_biz } : null,
  };
}

export async function onRequest(context) {
  const g = await guard(context);
  if (g.response) return g.response;

  const url = new URL(context.request.url);
  const withCredits = url.searchParams.get('credits') !== '0';
  const accounts = await listAccounts(g.kv);
  const views = [];

  for (const account of accounts.slice(0, 20)) {
    const view = publicView(account);
    if (withCredits) {
      try {
        view.quota = quotaView(await accountContext(account.accessToken));
      } catch (err) {
        view.quota = null;
        view.quotaError = String(err && err.message ? err.message : err).slice(0, 200);
      }
    }
    views.push(view);
  }

  return json({
    accounts: views,
    stats: await readStats(g.kv),
    baseUrl: `${url.origin}/v1`,
    total: accounts.length,
  });
}
