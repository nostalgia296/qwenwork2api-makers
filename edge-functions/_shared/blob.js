// EdgeOne Blob 存储 (@edgeone/pages-blob) 适配层。
// 把 Blob Store 包装成 KV 风格接口 (get/put/delete/list),
// 作为未绑定 KV 时的存储后端。SDK 不可用时所有函数返回 null。
//
// 会话、登录轮询等"写后立即读"场景依赖强一致读取,故 get/list 默认 consistency: 'strong'。

const BLOB_STORE_NAME = 'qwenwork2api';

let cached = null;
let probe = null; // null = 未探测, false = 不可用

async function loadSDK() {
  if (probe !== null) return probe ? probe : null;
  try {
    // 变量形式动态 import,避免打包器(wrangler/esbuild)静态解析该依赖
    const pkg = '@edgeone/pages-blob';
    probe = await import(pkg);
  } catch {
    probe = false;
  }
  return probe || null;
}

function wrapStore(store) {
  return {
    isBlob: true,
    async get(key) {
      return store.get(key, { type: 'text', consistency: 'strong' });
    },
    async put(key, value) {
      await store.set(key, value);
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(options) {
      const { prefix, cursor } = options || {};
      const result = await store.list({ prefix, cursor, paginate: false, consistency: 'strong' });
      return {
        keys: (result && Array.isArray(result.blobs) ? result.blobs : []).map((b) => ({ name: b.key })),
        complete: !(result && result.cursor),
        cursor: result ? result.cursor : undefined,
      };
    },
  };
}

// 返回 KV 兼容适配器,不可用时返回 null
export async function getBlobKV() {
  if (cached) return cached;
  const sdk = await loadSDK();
  if (!sdk || typeof sdk.getStore !== 'function') return null;
  try {
    cached = wrapStore(sdk.getStore(BLOB_STORE_NAME));
    return cached;
  } catch {
    return null;
  }
}
