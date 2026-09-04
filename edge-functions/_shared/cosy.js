import { uuid, utf8, b64, b64url, aesCbcEncrypt, rsaPkcs1Encrypt, md5 } from './crypto.js';
import {
  COSY_VERSION,
  IDE_VERSION,
  RELEASE_VERSION,
  BUILD,
  CLIENT_TYPE,
  BUSINESS_PRODUCT,
  BUSINESS_TYPE,
  SCENE,
  MACHINE_OS,
  UA,
} from './config.js';

const cache = new Map();

function sortedCompact(obj) {
  const keys = Object.keys(obj).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) out += ',';
    out += JSON.stringify(keys[i]) + ':' + JSON.stringify(obj[keys[i]]);
  }
  return out + '}';
}

function newSession(account) {
  const machineID = uuid();
  const seed = (uuid() + uuid()).slice(0, 50);
  const machineToken = b64url(utf8(seed));
  const machineType = uuid().replace(/-/g, '').slice(0, 18);
  const tempKey = uuid().replace(/-/g, '').slice(0, 16);

  const identity = sortedCompact({
    uid: account.uid || '',
    aid: account.uid || '',
    name: account.nickname || '',
    email: account.email || '',
    security_oauth_token: account.accessToken,
  });

  return {
    machineID,
    machineToken,
    machineType,
    tempKey,
    cosyKey: rsaPkcs1Encrypt(utf8(tempKey)),
    info: b64(aesCbcEncrypt(utf8(identity), utf8(tempKey))),
    accessToken: account.accessToken,
  };
}

export function sessionFor(account) {
  if (!account || !account.accessToken) throw new Error('cosy: empty access token');
  const key = account.id || account.uid || account.accessToken.slice(0, 16);
  const hit = cache.get(key);
  if (hit && hit.accessToken === account.accessToken) return hit;
  if (cache.size > 128) cache.clear();
  const sess = newSession(account);
  cache.set(key, sess);
  return sess;
}

export function invalidateSession(account) {
  const key = account && (account.id || account.uid);
  if (key) cache.delete(key);
}

function pathSig(rawURL) {
  const u = new URL(rawURL);
  let p = u.pathname;
  if (p.startsWith('/algo')) p = p.slice('/algo'.length);
  return p;
}

export function signHeaders(account, body, rawURL, modelKey, accept) {
  const sess = sessionFor(account);
  const payload = sortedCompact({
    cosyVersion: COSY_VERSION,
    ideVersion: IDE_VERSION,
    info: sess.info,
    requestId: uuid(),
    version: 'v1',
  });
  const payloadB64 = b64(utf8(payload));
  const date = Math.floor(Date.now() / 1000).toString();
  const sig = md5(`${payloadB64}\n${sess.cosyKey}\n${date}\n${body}\n${pathSig(rawURL)}`);

  const headers = {
    accept: accept || 'text/event-stream',
    'content-type': 'application/json',
    'user-agent': UA,
    'x-request-id': uuid(),
    'x-qwenwork-version': IDE_VERSION,
    'x-qwenwork-release-version': RELEASE_VERSION,
    'x-qwenwork-build': BUILD,
    'x-qwenwork-platform': 'win32',
    'x-qwenwork-arch': 'x64',
    'x-qwenwork-channel': 'stable',
    'cosy-version': COSY_VERSION,
    'cosy-clienttype': CLIENT_TYPE,
    'cosy-business-product': BUSINESS_PRODUCT,
    'cosy-business-type': BUSINESS_TYPE,
    'cosy-scene': SCENE,
    'cosy-machineos': MACHINE_OS,
    'login-version': 'v2',
    authorization: `Bearer COSY.${payloadB64}.${sig}`,
    'cosy-key': sess.cosyKey,
    'cosy-user': account.uid || '',
    'cosy-date': date,
    'cosy-machineid': sess.machineID,
    'accept-encoding': 'identity',
    connection: 'keep-alive',
    'cache-control': 'no-cache',
  };
  if (modelKey) {
    headers['x-model-key'] = modelKey;
    headers['x-model-source'] = 'system';
  }
  return headers;
}
