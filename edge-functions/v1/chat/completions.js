import { getKV } from '../../_shared/kv.js';
import { getSettings, readBearer, matchAPIKey, effectiveTerms } from '../../_shared/auth.js';
import {
  listAccounts,
  pickAccount,
  refreshAccount,
  markCooldown,
  markDead,
  saveAccount,
  needsRefresh,
} from '../../_shared/accounts.js';
import { buildBody, mapModel } from '../../_shared/body.js';
import { makeDesensitizer } from '../../_shared/desensitize.js';
import { chat as callUpstream } from '../../_shared/upstream.js';
import { transform, collectSync } from '../../_shared/sse.js';
import { json, error, sseHeaders, preflight, timeoutSignal, readJSON } from '../../_shared/http.js';
import { bump } from '../../_shared/stats.js';

function replace(accounts, updated) {
  const idx = accounts.findIndex((a) => a.id === updated.id);
  if (idx >= 0) accounts[idx] = updated;
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return error('method not allowed, use POST', 405, 'invalid_request_error');

  const kv = await getKV(env);
  if (!kv) return error('KV namespace is not bound to this project', 500, 'kv_unbound');

  const settings = await getSettings(kv);
  if (!settings.allowAnonymous) {
    const key = matchAPIKey(settings, readBearer(request));
    if (!key) return error('invalid api key', 401, 'invalid_api_key');
  }

  const payload = await readJSON(request);
  if (!payload || typeof payload !== 'object') return error('invalid json body', 400, 'invalid_request_error');
  if (!Array.isArray(payload.messages)) return error('messages is required', 400, 'invalid_request_error');

  const model = payload.model || settings.defaultModel || 'pro';
  const modelKey = mapModel(model);
  const wantStream = payload.stream === true;
  const desensitizer = makeDesensitizer(settings.desensitize, effectiveTerms(settings));
  const bodyStr = buildBody(payload, modelKey, desensitizer);

  let accounts = await listAccounts(kv);
  if (accounts.length === 0) return error('no qwenwork account configured', 503, 'no_account');

  for (let i = 0; i < accounts.length; i++) {
    if (needsRefresh(accounts[i])) {
      accounts[i] = await refreshAccount(kv, accounts[i]).catch(() => accounts[i]);
    }
  }

  const attempts = Math.min(accounts.length, 3);
  const refreshed = new Set();
  let lastMessage = 'no available account';
  let lastStatus = 503;

  for (let n = 0; n < attempts; n++) {
    const account = pickAccount(accounts);
    if (!account) break;

    const { signal, done } = timeoutSignal(settings.requestTimeoutMs || 120000);
    let res;
    try {
      res = await callUpstream(account, modelKey, bodyStr, signal);
    } catch (err) {
      done();
      lastMessage = `upstream_error: ${err && err.message ? err.message : err}`;
      lastStatus = 502;
      markCooldown(account, lastMessage);
      await saveAccount(kv, account);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      done();
      lastMessage = `upstream ${res.status}: ${String(text).slice(0, 200)}`;
      lastStatus = res.status >= 400 && res.status < 500 ? res.status : 502;
      if ((res.status === 401 || res.status === 403) && account.refreshToken && !refreshed.has(account.id)) {
        refreshed.add(account.id);
        try {
          replace(accounts, await refreshAccount(kv, account));
        } catch (err) {
          markDead(account, `refresh failed: ${err && err.message ? err.message : err}`);
          await saveAccount(kv, account);
        }
        continue;
      }
      markCooldown(account, lastMessage);
      await saveAccount(kv, account);
      continue;
    }

    account.lastUsed = Date.now();
    const persist = saveAccount(kv, account);

    if (wantStream) {
      let statsDone;
      const statsPromise = new Promise((resolve) => {
        statsDone = resolve;
      });
      const stream = transform(res.body, model, (usage) => {
        statsDone(usage);
      });
      if (waitUntil) {
        waitUntil(
          (async () => {
            await persist;
            const usage = await statsPromise;
            await bump(kv, true, usage);
          })().catch(() => {})
        );
      } else {
        persist.catch(() => {});
      }
      return new Response(stream, { headers: sseHeaders() });
    }

    const result = await collectSync(res.body, model);
    done();
    await persist;
    if (result.error) {
      await bump(kv, false, null);
      return error(result.error, 502, 'upstream_error');
    }
    if (waitUntil) waitUntil(bump(kv, true, result.usage).catch(() => {}));
    else bump(kv, true, result.usage).catch(() => {});
    return json(result.completion);
  }

  if (waitUntil) waitUntil(bump(kv, false, null).catch(() => {}));
  else bump(kv, false, null).catch(() => {});
  return error(lastMessage, lastStatus, lastStatus === 401 ? 'invalid_api_key' : 'upstream_error');
}
