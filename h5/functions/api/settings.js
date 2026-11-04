import { json, currentUser } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const st = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(user.id).first();
  let settings = {};
  if (st) { try { settings = JSON.parse(st.data); } catch (e) {} }
  return json({ ok: true, settings });
}

export async function onRequestPut({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: '格式错误' }, 400);
  await env.DB.prepare(
    'INSERT INTO settings (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(user.id, JSON.stringify(body), Date.now()).run();
  return json({ ok: true });
}
