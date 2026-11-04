import { json, currentUser } from './_utils.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 2 * 1024 * 1024; // 单张照片最大 2MB

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!DATE_RE.test(date)) return json({ error: '日期格式错误' }, 400);

  const row = await env.DB.prepare('SELECT mime, data FROM photos WHERE user_id = ? AND date = ?').bind(user.id, date).first();
  if (!row) return json({ error: '照片不存在' }, 404);
  // D1 返回的 BLOB 是普通 Array，需转成 Uint8Array 才能作为 Response body
  let body = row.data;
  if (body instanceof Array) body = new Uint8Array(body);
  else if (body instanceof ArrayBuffer) body = new Uint8Array(body);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': row.mime || 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

export async function onRequestPut({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!DATE_RE.test(date)) return json({ error: '日期格式错误' }, 400);
  const buf = await request.arrayBuffer();
  if (!buf || buf.byteLength === 0) return json({ error: '照片为空' }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: '照片超过 2MB' }, 413);
  const mime = (request.headers.get('Content-Type') || 'image/jpeg').split(';')[0];
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return json({ error: '不支持的图片格式' }, 400);

  await env.DB.prepare(
    'INSERT INTO photos (user_id, date, mime, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at'
  ).bind(user.id, date, mime, buf, Date.now()).run();
  return json({ ok: true, size: buf.byteLength });
}

export async function onRequestDelete({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!DATE_RE.test(date)) return json({ error: '日期格式错误' }, 400);
  await env.DB.prepare('DELETE FROM photos WHERE user_id = ? AND date = ?').bind(user.id, date).run();
  return json({ ok: true });
}
