// 公共工具函数
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function cookieHeader(token) {
  return 'rc_session=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (30 * 24 * 3600);
}

export function clearCookie() {
  return 'rc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function getToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/rc_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

export async function currentUser(request, env) {
  const token = getToken(request);
  if (!token) return null;
  const now = Date.now();
  return await env.DB.prepare(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, now).first();
}

export function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export function validUsername(name) {
  return typeof name === 'string' && /^[\u4e00-\u9fa5a-zA-Z0-9_]{2,20}$/.test(name.trim());
}

export async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now() + 30 * 24 * 3600 * 1000).run();
  return token;
}
