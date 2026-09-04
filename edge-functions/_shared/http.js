const BASE_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-admin-token',
  'access-control-max-age': '86400',
};

export function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(extra || {}),
    },
  });
}

export function error(message, status = 500, type = 'server_error') {
  return json({ error: { message, type } }, status);
}

export function sseHeaders() {
  return {
    ...BASE_HEADERS,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  };
}

export function preflight() {
  return new Response(null, { status: 204, headers: BASE_HEADERS });
}

export function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

export async function readJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
