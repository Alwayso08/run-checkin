# 🏃 跑步打卡

个人跑步打卡系统：**每日跑步打卡 + 体重记录 + 面容照片变化追踪**，微信内使用。

## 项目组成

| 目录 | 说明 |
|---|---|
| `h5/` | 打卡网页（纯前端，托管在 Cloudflare Pages：https://run-checkin.pages.dev） |
| `miniprogram/` | 微信小程序（每日打卡提醒壳，基于云开发订阅消息） |
| `docs/` | 设计文档与部署教程 |

## 功能

- 今日打卡：距离 / 时长 / 配速（任意两项自动算第三项）、备注、可编辑撤销
- 每周目标监督：自定义每周跑几天、周进度环、连击天数、请假/休息日（目标自动顺延）
- 体重记录：每日体重 + 30/90 天曲线 + 目标体重参考线
- 面容照片：每日正面照（自动压缩），按月时间线 + 双图滑动对比
- 数据统计：近 4 周/近 6 月跑步图表、平均配速
- 数据导出：完整备份 zip（含照片）、Excel/CSV 表格
- 打卡提醒：微信自带提醒（当前）/ 小程序订阅消息（可选）

## 技术栈

- 网页：纯 HTML/CSS/JS + Chart.js + JSZip；数据本地存储（localStorage + IndexedDB），**无后端**
- 小程序：原生小程序 + 云函数（定时订阅消息）
- 托管：Cloudflare Pages（免费）

## 数据说明

打卡数据保存在使用者的手机本地（微信内置浏览器存储），不上传任何服务器。请定期使用「我的 → 导出备份」备份到文件传输助手。

## 界面预览

| 今日页 | 打卡弹窗 | 日历 |
|---|---|---|
| ![](docs/screenshots/shot-1-today.png) | ![](docs/screenshots/shot-2-run-modal.png) | ![](docs/screenshots/shot-3-calendar.png) |

| 统计 | 照片时间线 | 双图对比 |
|---|---|---|
| ![](docs/screenshots/shot-4-stats.png) | ![](docs/screenshots/shot-5-photos.png) | ![](docs/screenshots/shot-6-compare.png) |

| 我的 | 请假休息 | 首次打开 |
|---|---|---|
| ![](docs/screenshots/shot-7-me.png) | ![](docs/screenshots/shot-10-rest.png) | ![](docs/screenshots/shot-0-fresh.png) |

## 文档

- [设计方案](docs/跑步打卡H5设计方案.md)
- [部署到微信手把手教程](docs/部署到微信·手把手教程.md)
- [小程序部署指南](docs/小程序部署指南.md)
