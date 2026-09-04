import { getJSON, putJSON } from './kv.js';
import { STATS_KEY } from './config.js';

function empty() {
  return { requests: 0, failures: 0, promptTokens: 0, completionTokens: 0, updatedAt: 0 };
}

export async function bump(kv, ok, usage) {
  const stats = (await getJSON(kv, STATS_KEY)) || empty();
  stats.requests += 1;
  if (!ok) stats.failures += 1;
  if (usage) {
    stats.promptTokens += Number(usage.prompt_tokens) || 0;
    stats.completionTokens += Number(usage.completion_tokens) || 0;
  }
  stats.updatedAt = Date.now();
  await putJSON(kv, STATS_KEY, stats);
  return stats;
}

export async function read(kv) {
  return (await getJSON(kv, STATS_KEY)) || empty();
}

export async function reset(kv) {
  await putJSON(kv, STATS_KEY, empty());
}
