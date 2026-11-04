import { json, validUsername, randomHex, hashPassword, createSession, cookieHeader } from './_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!validUsername(username)) return json({ error: '用户名需 2~20 位，只能为中文、字母、数字、下划线' }, 400);
  if (password.length < 6 || password.length > 64) return json({ error: '密码需 6~64 位' }, 400);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exists) return json({ error: '用户名已被注册' }, 409);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const res = await env.DB.prepare('INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .bind(username, passwordHash, salt, Date.now()).run();
  const userId = res.meta.last_row_id;
  const token = await createSession(env, userId);
  return json({ ok: true, user: { id: userId, username } }, 200, { 'Set-Cookie': cookieHeader(token) });
}
