import { getKV } from '../_shared/kv.js';
import { getSettings, readAdminToken, checkSession } from '../_shared/auth.js';
import { json, preflight } from '../_shared/http.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return preflight();
  const kv = getKV(context.env);
  if (!kv) return json({ kvBound: false, initialized: false, authenticated: false });
  const settings = await getSettings(kv);
  const authenticated = await checkSession(kv, readAdminToken(context.request));
  return json({ kvBound: true, initialized: !!settings.initialized, authenticated });
}
