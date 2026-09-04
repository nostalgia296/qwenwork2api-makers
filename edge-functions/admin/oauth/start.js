import { guard } from '../../_shared/admin.js';
import { putJSON } from '../../_shared/kv.js';
import { newDeviceFlow } from '../../_shared/upstream.js';
import { uuid } from '../../_shared/crypto.js';
import { LOGIN_PREFIX, LOGIN_TTL_MS } from '../../_shared/config.js';
import { json } from '../../_shared/http.js';

export async function onRequest(context) {
  const g = await guard(context);
  if (g.response) return g.response;
  if (g.method !== 'POST') return json({ error: { message: 'method not allowed', type: 'invalid_request_error' } }, 405);

  const flow = await newDeviceFlow();
  const state = `qw_${uuid().replace(/-/g, '').slice(0, 16)}`;
  await putJSON(g.kv, `${LOGIN_PREFIX}${state}`, {
    verifier: flow.verifier,
    nonce: flow.nonce,
    expiresAt: Date.now() + LOGIN_TTL_MS,
  });
  return json({ state, url: flow.url, expiresAt: Date.now() + LOGIN_TTL_MS });
}
