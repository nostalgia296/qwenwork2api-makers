import { getKV } from '../_shared/kv.js';
import { getSettings, hashPassword, createSession } from '../_shared/auth.js';
import { json, error, preflight, readJSON } from '../_shared/http.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return preflight();
  if (context.request.method !== 'POST') return error('method not allowed', 405);

  const kv = await getKV(context.env);
  if (!kv) return error('KV namespace is not bound to this project', 500, 'kv_unbound');

  const settings = await getSettings(kv);
  if (!settings.initialized) return error('admin password is not initialized', 409, 'not_initialized');

  const body = (await readJSON(context.request)) || {};
  const password = String(body.password || '');
  const hash = await hashPassword(password, settings.adminSalt || '');
  if (hash !== settings.adminHash) return error('invalid password', 401, 'unauthorized');

  const token = await createSession(kv);
  return json({ token });
}
