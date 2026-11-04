// 云函数 saveSubscription：记录用户订阅信息（openid + 提醒时间）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLL = 'subscribers';

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { remindTime, tmplId } = event;
  const now = Date.now();
  // 集合不存在时自动创建（首次运行时）
  try {
    await db.createCollection(COLL);
  } catch (e) {
    // 已存在则忽略
  }
  const res = await db.collection(COLL).where({ openid: OPENID }).get();
  if (res.data.length) {
    await db.collection(COLL).doc(res.data[0]._id).update({
      data: { remindTime, tmplId, active: true, updatedAt: now }
    });
  } else {
    await db.collection(COLL).add({
      data: { openid: OPENID, remindTime, tmplId, active: true, createdAt: now, updatedAt: now }
    });
  }
  return { ok: true };
};
