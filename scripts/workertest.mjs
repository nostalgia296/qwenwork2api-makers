// Cloudflare Worker 入口（worker.js）的冒烟测试：在 Node 中直接调度 default export。
import { putJSON } from '../edge-functions/_shared/kv.js';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      actual  = ${JSON.stringify(actual)}\n      expected= ${JSON.stringify(expected)}`);
}
function assert(name, condition, detail) {
  if (!condition) failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition && detail !== undefined) console.log(`      ${detail}`);
}

const worker = (await import('../worker.js')).default;
const { onRequest: keepalive } = await import('../edge-functions/cron/keepalive.js');

const noopCtx = { waitUntil() {} };
const req = (path, init) => new Request(`https://worker.example.com${path}`, init);

// --- 阶段一：KV 未绑定（env 与 globalThis 均无 KV） ---
delete globalThis.QWENWORK_KV;

let res = await worker.fetch(req('/v1/models'), {}, noopCtx);
check('worker routes /v1/models', res.status, 500);
check('worker kv unbound error type', (await res.json()).error.type, 'kv_unbound');

// --- 阶段二：绑定 mock KV ---
const store = new Map();
globalThis.QWENWORK_KV = {
  async get(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async put(key, value) {
    store.set(key, String(value));
  },
  async delete(key) {
    store.delete(key);
  },
  async list({ prefix } = {}) {
    const keys = [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).sort().map((name) => ({ name }));
    return { keys, complete: true, cursor: null };
  },
};

res = await worker.fetch(req('/v1/models'), {}, noopCtx);
check('worker models rejects anonymous', res.status, 401);

res = await worker.fetch(req('/definitely/not/a/route'), {}, noopCtx);
check('worker unknown path 404', res.status, 404);
check('worker unknown path error type', (await res.json()).error.type, 'not_found');

res = await worker.fetch(req('/v1/chat/completions', { method: 'OPTIONS' }), {}, noopCtx);
check('worker preflight passthrough', res.status, 204);

// allowAnonymous 开启后 models 可用（无账号 → 静态兜底列表，无上游请求）
await putJSON(globalThis.QWENWORK_KV, 'settings', { allowAnonymous: true });
res = await worker.fetch(req('/v1/models'), {}, noopCtx);
check('worker models allow anonymous', res.status, 200);
const list = await res.json();
check('worker models object', list.object, 'list');
assert('worker models fallback data', Array.isArray(list.data) && list.data.length > 0, JSON.stringify(list));

res = await worker.fetch(req('/v1/models/'), {}, noopCtx);
check('worker trailing slash normalized', res.status, 200);

// --- 阶段三：scheduled 保活 ---
// scheduled 永远不带 force，正确性由 keepalive handler 兜底（未授权也只做临近过期刷新）
try {
  await worker.scheduled({}, {}, noopCtx);
  await worker.scheduled({}, { CRON_TOKEN: 'tok42' }, noopCtx);
  assert('worker scheduled runs with and without CRON_TOKEN', true);
} catch (err) {
  assert('worker scheduled runs with and without CRON_TOKEN', false, String(err));
}

// env.CRON_TOKEN 授权传播（keepalive 响应携带 authorized 字段；scheduled 会把 env.CRON_TOKEN 放进 x-cron-token 头）
const cronReq = (headers) =>
  req('/cron/keepalive', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

res = await keepalive({ request: cronReq({ 'x-cron-token': 'tok42' }), env: { CRON_TOKEN: 'tok42' } });
check('keepalive env CRON_TOKEN authorized', (await res.json()).authorized, true);

res = await keepalive({ request: cronReq(), env: {} });
check('keepalive without token unauthorized', (await res.json()).authorized, false);

console.log(failed === 0 ? '\nall worker checks passed' : `\n${failed} worker check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
