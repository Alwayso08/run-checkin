import { json, currentUser } from './_utils.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const rows = await env.DB.prepare('SELECT date, data FROM records WHERE user_id = ? ORDER BY date').bind(user.id).all();
  const records = {};
  for (const r of rows.results || []) {
    try { records[r.date] = JSON.parse(r.data); } catch (e) { /* 忽略损坏记录 */ }
  }
  const st = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(user.id).first();
  let settings = {};
  if (st) { try { settings = JSON.parse(st.data); } catch (e) {} }
  return json({ ok: true, records, settings });
}

export async function onRequestPut({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const records = body.records && typeof body.records === 'object' ? body.records : {};
  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};

  const keys = Object.keys(records).filter((k) => DATE_RE.test(k));
  if (keys.length > 4000) return json({ error: '记录条数过多' }, 413);

  await env.DB.prepare('DELETE FROM records WHERE user_id = ?').bind(user.id).run();
  const stmts = keys.map((k) =>
    env.DB.prepare('INSERT INTO records (user_id, date, data, updated_at) VALUES (?, ?, ?, ?)')
      .bind(user.id, k, JSON.stringify(records[k]), Date.now())
  );
  if (stmts.length) await env.DB.batch(stmts);

  await env.DB.prepare(
    'INSERT INTO settings (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(user.id, JSON.stringify(settings), Date.now()).run();

  return json({ ok: true, imported: keys.length });
}
