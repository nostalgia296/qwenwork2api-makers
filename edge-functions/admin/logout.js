import { guard } from '../_shared/admin.js';
import { destroySession } from '../_shared/auth.js';
import { json } from '../_shared/http.js';

export async function onRequest(context) {
  const g = await guard(context);
  if (g.response) return g.response;
  await destroySession(g.kv);
  return json({ ok: true });
}
