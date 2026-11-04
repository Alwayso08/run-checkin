// app.js —— 跑步打卡提醒小程序
App({
  globalData: {
    h5Url: 'https://run-checkin.pages.dev', // 打卡网页地址（部署后如有变化改这里）
    tmplId: '', // TODO：在小程序后台「功能 → 订阅消息」选用模板后，把模板ID填到这里
    cloudEnvId: '' // TODO：开通云开发后，把环境ID填到这里（形如 cloud1-xxxxx）
  },
  onLaunch() {
    const g = this.globalData;
    if (wx.cloud && g.cloudEnvId) {
      wx.cloud.init({ env: g.cloudEnvId, traceUser: true });
    }
  }
});
