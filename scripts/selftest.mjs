import crypto from 'node:crypto';
import { md5, aesCbcEncrypt, rsaPkcs1Encrypt, utf8, hex, b64, unb64, uuid } from '../edge-functions/_shared/crypto.js';
import { makeDesensitizer, DEFAULT_TERMS } from '../edge-functions/_shared/desensitize.js';

let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      actual  = ${actual}\n      expected= ${expected}`);
}

const samples = [
  '',
  'a',
  'abc',
  'message digest',
  'abcdefghijklmnopqrstuvwxyz',
  '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
  '千问办公 QwenWork COSY 签名测试',
  '{"cosyVersion":"1.1.18","ideVersion":"0.1.8"}',
];

for (const s of samples) {
  check(`md5(${JSON.stringify(s.slice(0, 20))})`, md5(s), crypto.createHash('md5').update(s, 'utf8').digest('hex'));
}

for (let i = 0; i < 8; i++) {
  const len = Math.floor(Math.random() * 200) + 1;
  const plain = crypto.randomBytes(len);
  const key = crypto.randomBytes(16);
  const mine = hex(aesCbcEncrypt(new Uint8Array(plain), new Uint8Array(key)));
  const c = crypto.createCipheriv('aes-128-cbc', key, key);
  const ref = Buffer.concat([c.update(plain), c.final()]).toString('hex');
  check(`aes-128-cbc len=${len}`, mine, ref);
}

const identity = utf8('{"aid":"a1","email":"u@example.com","name":"tester","security_oauth_token":"jwt.token.here","uid":"1234567890"}');
const tempKey = utf8('0123456789abcdef');
const mineAes = hex(aesCbcEncrypt(identity, tempKey));
const c = crypto.createCipheriv('aes-128-cbc', tempKey, tempKey);
const refAes = Buffer.concat([c.update(Buffer.from(identity)), c.final()]).toString('hex');
check('aes-128-cbc identity block', mineAes, refAes);

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const privPem = pair.privateKey.export({ type: 'pkcs1', format: 'pem' });
const pubDer = pair.publicKey.export({ type: 'spki', format: 'der' });
const jwk = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' }).export({ format: 'jwk' });
const n = BigInt('0x' + Buffer.from(jwk.n, 'base64url').toString('hex'));
const e = BigInt('0x' + Buffer.from(jwk.e, 'base64url').toString('hex'));

for (const msg of ['hello', '0123456789abcdef', JSON.stringify({ a: 1, b: 'x' })]) {
  const ct = Buffer.from(rsaPkcs1Encrypt(utf8(msg), n, e), 'base64');
  const em = crypto.privateDecrypt({ key: privPem, padding: crypto.constants.RSA_NO_PADDING }, ct);
  check(`rsa pkcs1 em length (${msg.length}B)`, em.length, 128);
  check(`rsa pkcs1 em header (${msg.length}B)`, em.subarray(0, 2).toString('hex'), '0002');
  const sep = em.indexOf(0, 2);
  check(`rsa pkcs1 em separator (${msg.length}B)`, sep > 2 && sep === 128 - msg.length - 1, true);
  check(`rsa pkcs1 em payload (${msg.length}B)`, em.subarray(sep + 1).toString('utf8'), msg);
}

const qwenPubPem = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;

const fixedCt = Buffer.from(rsaPkcs1Encrypt(utf8('0123456789abcdef')), 'base64');
check('rsa pkcs1 fixed-key ciphertext length', fixedCt.length, 128);
const fixedKey = crypto.createPublicKey(qwenPubPem).export({ format: 'jwk' });
check(
  'rsa pkcs1 fixed-key modulus',
  '0x' + Buffer.from(fixedKey.n, 'base64url').toString('hex'),
  '0xc0f22307e5cd362e296bb04470f6de8fbf935ce24e8fcf511a0e2701329769c4a76e499bb938036a52af1eaf818cf79a2600620e3ce87e371d2ca6d85803606a1b3fa5e874643c9ed2db7e85673ef7227fca56e2e7c08f0927609bb896a9f24be1782099a66016a5bfdc3f1ff756bfc9e88d7b5dc5be30bf45a0223a00ebcecf'
);
check('rsa pkcs1 fixed-key exponent', Buffer.from(fixedKey.e, 'base64url').toString('hex'), '010001');

check('b64 roundtrip', Buffer.from(unb64(b64(utf8('千问 ab?~_')))).toString('utf8'), '千问 ab?~_');
check('uuid format', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid()), true);

const d = makeDesensitizer(true, ['Codex', 'Claude Code']);
check('desensitize single term', d('use Codex now'), 'use C​odex now');
check('desensitize multi word term', d('Claude Code rules'), 'C​laude Code rules');
check('desensitize case insensitive', d('CODEX'), 'C​ODEX');
check('desensitize idempotent', d(d('Codex')), d('Codex'));
check('desensitize plain text untouched', d('hello world'), 'hello world');
check('desensitize disabled returns null', makeDesensitizer(false, ['Codex']), null);
check('desensitize default terms count', DEFAULT_TERMS.length, 85);
check('desensitize default terms active', makeDesensitizer(true, [])('exploit it'), 'e​xploit it');

console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
