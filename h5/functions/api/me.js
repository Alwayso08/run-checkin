import { json, currentUser } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  return json({ ok: true, user });
}
