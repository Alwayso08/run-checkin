// 跑步打卡提醒小程序 —— 首页
const app = getApp();

Page({
  data: {
    dateStr: '',
    weekDay: '',
    h5Url: '',
    weeklyGoal: 4,
    goalIndex: 3,
    goalOptions: ['1 天/周', '2 天/周', '3 天/周', '4 天/周', '5 天/周', '6 天/周', '7 天/周'],
    remindTime: '20:30',
    tmplId: ''
  },

  onLoad() {
    const g = app.globalData;
    const s = wx.getStorageSync('rc_settings') || {};
    const goal = s.weeklyGoal || 4;
    this.setData({
      h5Url: g.h5Url,
      tmplId: g.tmplId,
      weeklyGoal: goal,
      goalIndex: Math.min(Math.max(goal - 1, 0), 6),
      remindTime: s.remindTime || '20:30'
    });
    this.updateDate();
  },

  updateDate() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    this.setData({
      dateStr: d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日',
      weekDay: '星期' + week[d.getDay()]
    });
  },

  // 打开/复制打卡页
  openCheckin() {
    const url = this.data.h5Url;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '打卡链接已复制',
          content: '打开一个微信聊天窗口，粘贴链接发送后点击即可打开打卡页。\n\n建议把打卡链接收藏起来，每天从收藏进入。',
          showCancel: false,
          confirmText: '知道了'
        });
      }
    });
  },

  // 订阅明天的提醒
  subscribe() {
    const tmplId = this.data.tmplId;
    if (!tmplId) {
      wx.showModal({
        title: '模板还没配置',
        content: '请先在小程序后台「功能 → 订阅消息」选用模板，然后把模板ID填到 app.js 的 tmplId 里。',
        showCancel: false
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res) => {
        if (res[tmplId] === 'accept') {
          wx.showToast({ title: '已订阅，明天提醒你', icon: 'success' });
          wx.setStorageSync('rc_subscribed', true);
          this.reportSubscription();
        } else {
          wx.showToast({ title: '未订阅，明天收不到提醒', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '订阅失败，请重试', icon: 'none' });
      }
    });
  },

  // 把订阅状态上报到云数据库（云函数发消息时用）
  reportSubscription() {
    const tmplId = this.data.tmplId;
    const remindTime = this.data.remindTime;
    if (!wx.cloud || !app.globalData.cloudEnvId) {
      console.log('未开通云开发，跳过订阅上报（仅本地有效）');
      return;
    }
    wx.cloud.callFunction({
      name: 'saveSubscription',
      data: { remindTime, tmplId },
      fail: (e) => console.log('saveSubscription 调用失败', e)
    });
  },

  changeGoal(e) {
    const idx = Number(e.detail.value);
    const goal = idx + 1;
    const s = wx.getStorageSync('rc_settings') || {};
    s.weeklyGoal = goal;
    wx.setStorageSync('rc_settings', s);
    this.setData({ weeklyGoal: goal, goalIndex: idx });
  },

  changeTime(e) {
    const t = e.detail.value;
    const s = wx.getStorageSync('rc_settings') || {};
    s.remindTime = t;
    wx.setStorageSync('rc_settings', s);
    this.setData({ remindTime: t });
  }
});
