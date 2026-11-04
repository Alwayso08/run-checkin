// 云函数 sendReminder：每天定时给已订阅用户发送订阅消息
// 注意：一次性订阅消息每次授权只能发一条，发完需用户重新订阅
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLL = 'subscribers';

// TODO 1：把这里换成你在小程序后台选用的订阅消息模板ID（形如 XXXX_XXXX）
const TMPL_ID = 'TODO-填入订阅消息模板ID';

exports.main = async () => {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  // 只给这个时间点该提醒的用户发（定时器每小时触发一次，按用户设置的时间匹配）
  const subs = await db.collection(COLL).where({ active: true }).get();
  const matched = subs.data.filter((s) => s.remindTime === hhmm);
  const results = [];

  for (const sub of matched) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: sub.openid,
        templateId: TMPL_ID,
        page: 'pages/index/index',
        data: buildTemplateData()
      });
      results.push({ openid: sub.openid, ok: true });
      // 一次性订阅已消耗，标记 inactive 等用户下次打开小程序再订阅
      await db.collection(COLL).doc(sub._id).update({ data: { active: false } });
    } catch (e) {
      results.push({ openid: sub.openid, ok: false, err: e.errCode || e.message });
    }
  }

  console.log('提醒发送结果：', JSON.stringify({ hhmm, matched: matched.length, results }));
  return { ok: true, hhmm, matched: matched.length, results };
};

// TODO 2：按你选用模板的实际字段名修改下面的 data
function buildTemplateData() {
  return {
    thing1: { value: '跑步打卡提醒' },
    time2: { value: '今天该打卡啦' },
    thing3: { value: '跑完记得打开打卡页记录哦' }
  };
}
