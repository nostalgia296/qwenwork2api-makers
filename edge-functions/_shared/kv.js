import { KV_NAMES } from './config.js';

export function getKV(env) {
  if (env) {
    for (const name of KV_NAMES) {
      if (env[name]) return env[name];
    }
  }
  for (const name of KV_NAMES) {
    const found = globalThis[name];
    if (found) return found;
  }
  return null;
}

export async function getJSON(kv, key) {
  const raw = await kv.get(key);
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function putJSON(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

export async function listKeys(kv, prefix) {
  const out = [];
  let cursor;
  for (;;) {
    const result = await kv.list({ prefix, cursor });
    if (!result || !Array.isArray(result.keys)) break;
    for (const item of result.keys) {
      const name = item && (item.name || item.key);
      if (name) out.push(name);
    }
    // EdgeOne returns `complete`, Cloudflare KV returns `list_complete`
    const complete = result.complete === true || result.list_complete === true;
    if (complete || !result.cursor) break;
    cursor = result.cursor;
  }
  return out;
}
