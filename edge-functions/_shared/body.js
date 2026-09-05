import { uuid } from './crypto.js';
import { DEFAULT_MODEL } from './config.js';

export function mapModel(name) {
  const m = String(name || '').trim();
  switch (m) {
    case '':
    case 'auto':
    case 'advanced':
    case 'pro':
      return 'pro';
    case 'lite':
    case 'flash':
      return 'flash';
    case 'max':
    case 'qwen3.8-max':
    case 'qwen3.8-max-preview':
      return 'qwen3.8-max-preview';
    default:
      return m;
  }
}

function contentText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    let out = '';
    for (const part of value) {
      if (part && typeof part === 'object' && typeof part.text === 'string') out += part.text;
    }
    return out;
  }
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function blankResponseMeta() {
  return {
    id: '',
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 0 },
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };
}

// 兼容 OpenAI 的 image_url / input_image 两种 part，以及三种 url 写法
function extractImagePart(part) {
  if (!part || typeof part !== 'object') return null;
  const t = part.type || '';
  if (t !== 'image_url' && t !== 'input_image') return null;
  const iu = part.image_url;
  let url;
  if (iu && typeof iu === 'object') url = iu.url;
  else if (typeof iu === 'string') url = iu;
  else url = part.url;
  return typeof url === 'string' && url ? url : null;
}

function extractMessageImages(message) {
  const content = message && message.content;
  const urls = [];
  if (Array.isArray(content)) {
    for (const part of content) {
      const url = extractImagePart(part);
      if (url) urls.push(url);
    }
  }
  return urls;
}

// 上游多模态形态：图片 part 在前、文本 part 在后，正文放 contents 而非 content
function buildMultimodalUserMessage(text, images) {
  const parts = images.map((url) => ({ type: 'image_url', image_url: { url } }));
  if (String(text || '').trim()) parts.push({ type: 'text', text });
  return {
    role: 'user',
    content: '',
    contents: parts,
    response_meta: blankResponseMeta(),
    reasoning_content_signature: '',
  };
}

function attachImages(messages) {
  let count = 0;
  const out = messages.map((m) => {
    if (!m || typeof m !== 'object' || m.role !== 'user') return m;
    const images = extractMessageImages(m);
    if (!images.length) return m;
    count += images.length;
    return buildMultimodalUserMessage(contentText(m.content), images);
  });
  return { messages: out, count };
}

// 脱敏只动文本，保留图片 part，避免把多模态消息压平成纯字符串
function desensitizeMessage(m, desensitize) {
  if (!m || typeof m !== 'object') return m;
  if (m.role !== 'user' || !hasCliMarker(contentText(m.content))) return m;
  if (Array.isArray(m.content) && extractMessageImages(m).length) {
    return {
      ...m,
      content: m.content.map((p) =>
        p && typeof p === 'object' && typeof p.text === 'string' ? { ...p, text: desensitize(p.text) } : p
      ),
    };
  }
  return { ...m, content: desensitize(contentText(m.content)) };
}

function splitMessages(payload) {
  const raw = Array.isArray(payload.messages) ? payload.messages : [];
  const sysParts = [];
  const messages = [];
  let lastUser = '';
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (item.role === 'system') {
      const text = contentText(item.content);
      if (text) sysParts.push(text);
      continue;
    }
    messages.push(item);
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      lastUser = contentText(m.content);
      break;
    }
  }
  return { system: sysParts.join('\n\n'), messages, lastUser };
}

export function buildBody(payload, modelKey, desensitize) {
  const key = modelKey || DEFAULT_MODEL;
  const requestID = uuid();
  const { system, messages, lastUser: first } = splitMessages(payload);
  let lastUser = first;
  if (!lastUser) {
    for (const m of messages) {
      if (m && m.role === 'user') {
        lastUser = contentText(m.content);
        if (lastUser) break;
      }
    }
  }
  if (!lastUser) lastUser = 'ping';

  const parameters = {};
  for (const k of ['temperature', 'top_p', 'max_tokens', 'presence_penalty', 'frequency_penalty']) {
    if (payload[k] !== undefined && payload[k] !== null) parameters[k] = payload[k];
  }
  if (parameters.max_tokens === undefined) parameters.max_tokens = 32000;

  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const isReasoning = false;

  let systemText = system;
  let upstreamMessages = messages;
  let upstreamTools = tools;
  let upstreamText = lastUser;
  if (desensitize && typeof desensitize === 'function') {
    systemText = desensitize(systemText);
    upstreamText = desensitize(upstreamText);
    upstreamMessages = messages.map((m) => desensitizeMessage(m, desensitize));
    upstreamTools = tools.map((t) => {
      if (!t || typeof t !== 'object') return t;
      const fn = t.function && typeof t.function === 'object' ? t.function : null;
      const copy = { ...t };
      if (typeof t.description === 'string') copy.description = desensitize(t.description);
      if (fn) {
        copy.function = { ...fn };
        if (typeof fn.name === 'string') copy.function.name = desensitize(fn.name);
        if (typeof fn.description === 'string') copy.function.description = desensitize(fn.description);
      }
      return copy;
    });
  }

  // 带图片的 user 消息改写成上游多模态形态（contents 数组），纯文本消息保持原样透传
  upstreamMessages = attachImages(upstreamMessages).messages;

  return JSON.stringify({
    request_id: requestID,
    request_set_id: requestID,
    chat_record_id: requestID,
    session_id: uuid(),
    stream: true,
    chat_task: 'FREE_INPUT',
    chat_context: {
      text: upstreamText,
      features: [],
      extra: {
        context: [],
        modelConfig: { key, is_reasoning: isReasoning, is_vl: true },
        originalContent: upstreamText,
      },
      chatPrompt: '',
      imageUrls: null,
    },
    is_reply: true,
    is_retry: false,
    source: 1,
    version: '3',
    agent_id: 'agent_common',
    task_id: 'common',
    session_type: 'qoder_work',
    aliyun_user_type: '',
    model_config: {
      key,
      display_name: key,
      model: '',
      format: 'openai',
      is_vl: true,
      is_reasoning: isReasoning,
      api_key: '',
      url: '',
      source: 'system',
      max_input_tokens: 180000,
    },
    system: systemText,
    messages: upstreamMessages,
    tools: upstreamTools,
    parameters,
  });
}

function hasCliMarker(text) {
  return (
    typeof text === 'string' &&
    (text.includes('# AGENTS.md instructions') || text.includes('<system-reminder>'))
  );
}
