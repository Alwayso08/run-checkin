import { json, currentUser } from './_utils.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestPut({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!DATE_RE.test(date)) return json({ error: '日期格式应为 YYYY-MM-DD' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  await env.DB.prepare(
    'INSERT INTO records (user_id, date, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(user.id, date, JSON.stringify(body), Date.now()).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!DATE_RE.test(date)) return json({ error: '日期格式应为 YYYY-MM-DD' }, 400);
  await env.DB.prepare('DELETE FROM records WHERE user_id = ? AND date = ?').bind(user.id, date).run();
  return json({ ok: true });
}
