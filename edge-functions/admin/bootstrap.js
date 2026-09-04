import { guard } from '../_shared/admin.js';
import { saveSettings, hashPassword, createSession, newAPIKey } from '../_shared/auth.js';
import { json, error } from '../_shared/http.js';

export async function onRequest(context) {
  const g = await guard(context, { allowBootstrap: true });
  if (g.response) return g.response;

  const password = String(g.body.password || '');
  if (password.length < 6) return error('password must be at least 6 characters', 400, 'invalid_request_error');

  const salt = crypto.getRandomValues(new Uint8Array(8)).join('');
  g.settings.initialized = true;
  g.settings.adminSalt = salt;
  g.settings.adminHash = await hashPassword(password, salt);
  if (!Array.isArray(g.settings.apiKeys) || g.settings.apiKeys.length === 0) {
    g.settings.apiKeys = [newAPIKey('default')];
  }
  await saveSettings(g.kv, g.settings);
  const token = await createSession(g.kv);
  return json({ token });
}
