import { json, hashPassword, createSession, cookieHeader } from './_utils.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const user = await env.DB.prepare('SELECT id, username, password_hash, salt FROM users WHERE username = ?').bind(username).first();
  if (!user) return json({ error: '用户名或密码错误' }, 401);
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return json({ error: '用户名或密码错误' }, 401);
  const token = await createSession(env, user.id);
  return json({ ok: true, user: { id: user.id, username: user.username } }, 200, { 'Set-Cookie': cookieHeader(token) });
}
