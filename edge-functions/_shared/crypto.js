const SBOX = (() => {
  const s = new Uint8Array(256);
  let p = 1;
  let q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    if (q & 0x80) q ^= 0x09;
    q &= 0xff;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    s[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

export function utf8(str) {
  return new TextEncoder().encode(str);
}

export function hex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function b64url(bytes) {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function uuid() {
  const r = new Uint8Array(16);
  crypto.getRandomValues(r);
  r[6] = (r[6] & 0x0f) | 0x40;
  r[8] = (r[8] & 0x3f) | 0x80;
  const h = hex(r);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = new Int32Array(64);
for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

function rotl(x, n) {
  return (x << n) | (x >>> (32 - n));
}

export function md5(input) {
  const msg = typeof input === 'string' ? utf8(input) : input;
  const len = msg.length;
  const bitLen = len * 8;
  const padLen = (56 - (len + 1) % 64 + 64) % 64;
  const total = len + 1 + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, bitLen >>> 0, true);
  view.setUint32(total - 4, Math.floor(bitLen / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < total; i += 64) {
    const m = new Int32Array(16);
    for (let j = 0; j < 16; j++) m[j] = view.getInt32(i + j * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let j = 0; j < 64; j++) {
      let f;
      let g;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }
      f = (f + a + MD5_K[j] + m[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, MD5_S[j])) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setInt32(0, a0, true);
  ov.setInt32(4, b0, true);
  ov.setInt32(8, c0, true);
  ov.setInt32(12, d0, true);
  return hex(out);
}

function xtime(a) {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}

function keyExpansion(key) {
  const w = new Uint8Array(176);
  w.set(key, 0);
  for (let i = 4; i < 44; i++) {
    const t = [w[(i - 1) * 4], w[(i - 1) * 4 + 1], w[(i - 1) * 4 + 2], w[(i - 1) * 4 + 3]];
    if (i % 4 === 0) {
      const r = t[0];
      t[0] = t[1];
      t[1] = t[2];
      t[2] = t[3];
      t[3] = r;
      for (let j = 0; j < 4; j++) t[j] = SBOX[t[j]];
      t[0] ^= RCON[i / 4 - 1];
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - 4) * 4 + j] ^ t[j];
  }
  return w;
}

function addRoundKey(state, w, round) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) state[c * 4 + r] ^= w[round * 16 + c * 4 + r];
  }
}

function subBytes(state) {
  for (let i = 0; i < 16; i++) state[i] = SBOX[state[i]];
}

function shiftRows(s) {
  const t = s.slice();
  const map = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11];
  for (let i = 0; i < 16; i++) s[i] = t[map[i]];
}

function mixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i];
    const a1 = s[i + 1];
    const a2 = s[i + 2];
    const a3 = s[i + 3];
    s[i] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
    s[i + 1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
    s[i + 2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
    s[i + 3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
  }
}

export function aesCbcEncrypt(plain, key) {
  const w = keyExpansion(key);
  const padLen = 16 - (plain.length % 16);
  const data = new Uint8Array(plain.length + padLen);
  data.set(plain, 0);
  for (let i = plain.length; i < data.length; i++) data[i] = padLen;
  const out = new Uint8Array(data.length);
  const block = new Uint8Array(16);
  let prev = key.slice(0, 16);
  for (let off = 0; off < data.length; off += 16) {
    for (let i = 0; i < 16; i++) block[i] = data[off + i] ^ prev[i];
    addRoundKey(block, w, 0);
    for (let round = 1; round < 10; round++) {
      subBytes(block);
      shiftRows(block);
      mixColumns(block);
      addRoundKey(block, w, round);
    }
    subBytes(block);
    shiftRows(block);
    addRoundKey(block, w, 10);
    out.set(block, off);
    prev = block.slice(0, 16);
  }
  return out;
}

const RSA_N = BigInt(
  '0x' +
    'c0f22307e5cd362e296bb04470f6de8fbf935ce24e8fcf511a0e2701329769c4' +
    'a76e499bb938036a52af1eaf818cf79a2600620e3ce87e371d2ca6d85803606a' +
    '1b3fa5e874643c9ed2db7e85673ef7227fca56e2e7c08f0927609bb896a9f24b' +
    'e1782099a66016a5bfdc3f1ff756bfc9e88d7b5dc5be30bf45a0223a00ebcecf'
);
const RSA_E = 65537n;

function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

export function rsaPkcs1Encrypt(data, n = RSA_N, e = RSA_E, k = 128) {
  const psLen = k - data.length - 3;
  if (psLen < 8) throw new Error('rsa: message too long');
  const ps = new Uint8Array(psLen);
  for (;;) {
    crypto.getRandomValues(ps);
    let ok = true;
    for (let i = 0; i < psLen; i++) {
      if (ps[i] === 0) {
        ok = false;
        break;
      }
    }
    if (ok) break;
  }
  const em = new Uint8Array(k);
  em[0] = 0x00;
  em[1] = 0x02;
  em.set(ps, 2);
  em[2 + psLen] = 0x00;
  em.set(data, 3 + psLen);
  let m = 0n;
  for (let i = 0; i < k; i++) m = (m << 8n) | BigInt(em[i]);
  const c = modPow(m, e, n);
  const out = new Uint8Array(k);
  let v = c;
  for (let i = k - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b64(out);
}
