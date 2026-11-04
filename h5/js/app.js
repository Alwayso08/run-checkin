/* 跑步打卡 H5 · app.js —— 纯本地存储，无需服务器 */
'use strict';

/* ========== 工具 ========== */
var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

function pad(n) { return (n < 10 ? '0' : '') + n; }
function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayKey() { return dateKey(new Date()); }
function mondayOf(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
function fmtPace(p) {
  if (!p || !isFinite(p)) return '--';
  var m = Math.floor(p), s = Math.round((p - m) * 60);
  if (s === 60) { m++; s = 0; }
  return m + "'" + pad(s) + '"';
}
function fmtNum(n, d) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  return Number(n).toFixed(d === undefined ? 1 : d);
}

/* ========== 状态 ========== */
var STORE_KEY = 'rc_state_v1';
var state = null;
var photoKeys = new Set();
var urlCache = {};

function defaultState() {
  return { settings: { weeklyGoal: 4, targetWeight: null, remindTime: '20:30' }, records: {} };
}
function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    state = raw ? JSON.parse(raw) : defaultState();
  } catch (e) { state = defaultState(); }
  if (!state.settings) state.settings = defaultState().settings;
  if (!state.records) state.records = {};
  if (!state.settings.weeklyGoal) state.settings.weeklyGoal = 4;
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function rec(k) {
  if (!k) k = todayKey();
  if (!state.records[k]) state.records[k] = {};
  return state.records[k];
}
function isRunDone(k) {
  var r = state.records[k];
  return !!(r && r.run && r.run.distance > 0);
}

/* ========== IndexedDB 照片库 ========== */
var idb = {
  db: null,
  open: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var rq = indexedDB.open('rc_photos', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('photos'); };
      rq.onsuccess = function () { self.db = rq.result; resolve(); };
      rq.onerror = function () { reject(rq.error); };
    });
  },
  put: function (key, blob) {
    return new Promise(function (res, rej) {
      var t = idb.db.transaction('photos', 'readwrite');
      t.objectStore('photos').put(blob, key);
      t.oncomplete = function () { res(); };
      t.onerror = function () { rej(t.error); };
    });
  },
  get: function (key) {
    return new Promise(function (res) {
      var t = idb.db.transaction('photos', 'readonly');
      var rq = t.objectStore('photos').get(key);
      rq.onsuccess = function () { res(rq.result || null); };
      rq.onerror = function () { res(null); };
    });
  },
  del: function (key) {
    return new Promise(function (res) {
      var t = idb.db.transaction('photos', 'readwrite');
      t.objectStore('photos').delete(key);
      t.oncomplete = function () { res(); };
    });
  },
  keys: function () {
    return new Promise(function (res) {
      var t = idb.db.transaction('photos', 'readonly');
      var rq = t.objectStore('photos').getAllKeys();
      rq.onsuccess = function () { res(Array.prototype.slice.call(rq.result)); };
      rq.onerror = function () { res([]); };
    });
  },
  clear: function () {
    return new Promise(function (res) {
      var t = idb.db.transaction('photos', 'readwrite');
      t.objectStore('photos').clear();
      t.oncomplete = function () { res(); };
    });
  }
};
async function refreshPhotoKeys() { photoKeys = new Set(await idb.keys()); }
async function getPhotoUrl(k) {
  if (urlCache[k]) return urlCache[k];
  var b = await idb.get(k);
  if (!b) return null;
  var u = URL.createObjectURL(b);
  urlCache[k] = u;
  return u;
}

/* ========== Toast / 弹窗 ========== */
var toastTimer = null;
function toast(msg) {
  var el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
}
function openModal(id) { $('#' + id).classList.add('open'); }
function closeModal(id) { $('#' + id).classList.remove('open'); }

/* ========== Tab 导航 ========== */
function switchTab(name) {
  $$('.page').forEach(function (p) { p.classList.remove('active'); });
  $('#page-' + name).classList.add('active');
  $$('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === name); });
  if (name === 'today') renderToday();
  if (name === 'calendar') renderCalendar();
  if (name === 'stats') renderStats();
  if (name === 'photos') renderPhotos();
  if (name === 'me') renderMe();
}

/* ========== 周计划 / 连击 ========== */
function weekProgress() {
  var m = mondayOf(new Date());
  var done = 0, rest = 0;
  for (var i = 0; i < 7; i++) {
    var k = dateKey(addDays(m, i));
    if (isRunDone(k)) done++;
    else if (state.records[k] && state.records[k].rest) rest++;
  }
  var goal = state.settings.weeklyGoal;
  return { done: done, goal: goal, rest: rest, effectiveGoal: Math.max(0, goal - rest) };
}
function calcStreak() {
  var d = new Date();
  var s = 0;
  var k0 = dateKey(d);
  if (!isRunDone(k0) && !(state.records[k0] && state.records[k0].rest)) d = addDays(d, -1);
  while (true) {
    var kk = dateKey(d);
    var rr = state.records[kk];
    if (rr && rr.rest) { d = addDays(d, -1); continue; }
    if (!isRunDone(kk)) break;
    s++; d = addDays(d, -1);
    if (s > 3650) break;
  }
  return s;
}

/* ========== 今日页 ========== */
function renderToday() {
  var now = new Date();
  var week = ['日', '一', '二', '三', '四', '五', '六'];
  $('#today-date').textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 · 星期' + week[now.getDay()];

  var wp = weekProgress();
  var done = isRunDone(todayKey());
  var ringFg = $('#ring-fg');
  var C = 2 * Math.PI * 52;
  var ratio = wp.effectiveGoal > 0 ? Math.min(wp.done / wp.effectiveGoal, 1) : 1;
  ringFg.style.strokeDashoffset = (C * (1 - ratio)).toFixed(1);
  ringFg.style.stroke = wp.done > 0 ? '#22c55e' : (wp.effectiveGoal === 0 ? '#a3e635' : '#fb923c');
  $('#ring-num').textContent = wp.effectiveGoal > 0 ? (wp.done + '/' + wp.effectiveGoal) : '🏁';

  var hero = $('#hero-status'), sub = $('#hero-sub'), meta = $('#hero-meta');
  var today = state.records[todayKey()];
  var todayRest = today && today.rest;
  if (done) {
    hero.textContent = '✅ 今日已打卡';
    hero.style.color = '#6ee7a0';
    var r = today.run;
    sub.textContent = r.distance + ' km · ' + r.duration + ' 分钟 · 配速 ' + fmtPace(r.pace);
    if (r.note) sub.textContent += ' · ' + r.note;
  } else if (todayRest) {
    hero.textContent = '🛌 今日请假休息';
    hero.style.color = '#c4b5fd';
    sub.textContent = '好好恢复，明天继续加油';
  } else if (wp.done >= wp.effectiveGoal) {
    hero.textContent = '🎉 本周目标已达成';
    hero.style.color = '#a3e635';
    sub.textContent = '今天自由安排，休息或轻松加练';
  } else {
    hero.textContent = '🏃 今天还没跑';
    hero.style.color = '#fdba74';
    sub.textContent = '本周 ' + wp.done + '/' + wp.effectiveGoal + ' 完成 · 还差 ' + (wp.effectiveGoal - wp.done) + ' 天达标' + (wp.rest > 0 ? '（已请假 ' + wp.rest + ' 天）' : '');
  }
  var hasWeight = today && today.weight;
  var hasPhoto = today && today.photoId && photoKeys.has(today.photoId);
  meta.innerHTML =
    '<span class="chip ' + (hasWeight ? 'green' : '') + '">⚖️ 体重 ' + (hasWeight ? today.weight + ' kg' : '未记') + '</span>' +
    '<span class="chip ' + (hasPhoto ? 'green' : '') + '">📷 照片 ' + (hasPhoto ? '已拍' : '未拍') + '</span>' +
    (todayRest ? '<span class="chip">🛌 已请假</span>' : '');
  hero.classList.remove('pop'); void hero.offsetWidth; hero.classList.add('pop');

  var streak = calcStreak();
  $('#streak-num').textContent = streak;
  $('#streak-chip').classList.toggle('on', streak > 0);

  // 跑步卡
  $('#run-empty').style.display = done ? 'none' : '';
  $('#run-done').style.display = done ? 'grid' : 'none';
  $('#btn-run-edit').style.display = done ? '' : 'none';
  $('#run-sub').textContent = done ? '已打卡' : '今天跑了吗？';
  $('#btn-rest-day').style.display = done ? 'none' : '';
  $('#btn-rest-day').textContent = todayRest ? '🛌 已请假 · 点此取消' : '🛌 今天请假 / 休息';
  if (done) {
    $('#run-distance').textContent = fmtNum(today.run.distance, 2);
    $('#run-duration').textContent = fmtNum(today.run.duration, 1);
    $('#run-pace').textContent = fmtPace(today.run.pace);
  }

  // 体重卡
  $('#weight-sub').textContent = hasWeight ? ('今日 ' + today.weight + ' kg') : '今天称了吗？';
  $('#weight-input').value = '';

  // 照片卡
  $('#photo-placeholder').style.display = hasPhoto ? 'none' : '';
  $('#photo-today-img').style.display = hasPhoto ? '' : 'none';
  $('#btn-retake-photo').style.display = hasPhoto ? '' : 'none';
  $('#photo-sub').textContent = hasPhoto ? '今日已拍' : '记录面容变化';
  if (hasPhoto) {
    getPhotoUrl(today.photoId).then(function (u) { if (u) $('#photo-today-img').src = u; });
  }

  // 今日 tab 角标
  var badge = $('#tab-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'tab-badge';
    badge.className = 'tab-badge';
    $$('.tab').forEach(function (t) { if (t.dataset.tab === 'today') t.appendChild(badge); });
  }
  badge.style.display = (!done && !todayRest && wp.done < wp.effectiveGoal) ? '' : 'none';
}

/* ========== 跑步打卡弹窗 ========== */
var runFields = { distance: null, duration: null, pace: null };
var editingRun = false;

function runInputVal(id) {
  var v = parseFloat($('#' + id).value);
  return (isFinite(v) && v > 0) ? v : null;
}
function setRunInput(id, v) {
  $('#' + id).value = (v === null || v === undefined) ? '' : Math.round(v * 100) / 100;
}
function autoCalc() {
  var filled = ['distance', 'duration', 'pace'].filter(function (k) { return runFields[k] !== null; });
  if (filled.length !== 2) return;
  var empty = (filled.indexOf('distance') < 0) ? 'distance' : (filled.indexOf('duration') < 0 ? 'duration' : 'pace');
  var d = runFields.distance, t = runFields.duration, p = runFields.pace;
  if (empty === 'pace' && d) setRunInput('run-pace-input', t / d);
  else if (empty === 'duration' && p) setRunInput('run-duration-input', d * p);
  else if (empty === 'distance' && p && t) setRunInput('run-distance-input', t / p);
}
function bindRunField(id, key) {
  $('#' + id).addEventListener('input', function () {
    runFields[key] = runInputVal(id);
    autoCalc();
  });
}
function openRunModal(edit) {
  editingRun = edit;
  runFields = { distance: null, duration: null, pace: null };
  var r = state.records[todayKey()] && state.records[todayKey()].run;
  if (edit && r) {
    setRunInput('run-distance-input', r.distance);
    setRunInput('run-duration-input', r.duration);
    setRunInput('run-pace-input', r.pace);
    runFields.distance = r.distance; runFields.duration = r.duration; runFields.pace = r.pace;
    $('#run-note-input').value = r.note || '';
  } else {
    setRunInput('run-distance-input', null);
    setRunInput('run-duration-input', null);
    setRunInput('run-pace-input', null);
    $('#run-note-input').value = '';
  }
  $('#btn-run-delete').style.display = edit ? '' : 'none';
  openModal('modal-run');
}

/* ========== 日历页 ========== */
var calYear = null, calMonth = null;

function renderCalendar() {
  var now = new Date();
  if (calYear === null) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
  var wp = weekProgress();
  $('#cal-title').textContent = calYear + '年' + (calMonth + 1) + '月';
  $('#cal-subtitle').textContent = '连续打卡 ' + calcStreak() + ' 天 · 本周 ' + wp.done + '/' + wp.goal + ' 天';
  var grid = $('#cal-grid');
  grid.innerHTML = '';
  var first = new Date(calYear, calMonth, 1);
  var lead = first.getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var i, k, r, cell;
  for (i = 0; i < lead; i++) grid.appendChild(calCell(null, null));
  for (i = 1; i <= daysInMonth; i++) {
    k = calYear + '-' + pad(calMonth + 1) + '-' + pad(i);
    grid.appendChild(calCell(k, i));
  }
  // 本月小结
  var runs = 0, km = 0, wsum = 0, wcount = 0, dur = 0, restCount = 0;
  for (i = 1; i <= daysInMonth; i++) {
    k = calYear + '-' + pad(calMonth + 1) + '-' + pad(i);
    r = state.records[k];
    if (r && r.run && r.run.distance > 0) { runs++; km += r.run.distance; dur += (r.run.duration || 0); }
    if (r && r.rest) restCount++;
    if (r && r.weight) { wsum += r.weight; wcount++; }
  }
  $('#cal-month-sum').textContent =
    runs + ' 次跑步 · 累计 ' + fmtNum(km, 1) + ' km' +
    (runs ? ' · 平均配速 ' + fmtPace(km > 0 ? dur / km : null) : '') +
    (restCount ? ' · 请假 ' + restCount + ' 天' : '') +
    (wcount ? ' · 平均体重 ' + fmtNum(wsum / wcount, 1) + ' kg' : '');
}
function calCell(key, day) {
  var div = document.createElement('div');
  div.className = 'cal-cell';
  if (!key) { div.classList.add('empty'); return div; }
  if (key === todayKey()) div.classList.add('today');
  var r = state.records[key];
  var marks = '';
  if (r) {
    if (r.run && r.run.distance > 0) { div.classList.add('ran'); marks += '<i class="dot-run"></i>'; }
    if (r.rest) { div.classList.add('rest'); marks += '<i class="dot-rest"></i>'; }
    if (r.weight) marks += '<i class="dot-weight"></i>';
    if (r.photoId && photoKeys.has(r.photoId)) marks += '<i class="dot-photo"></i>';
  }
  div.innerHTML = day + (marks ? '<span class="marks">' + marks + '</span>' : '');
  return div;
}

/* ========== 统计页 ========== */
var weightChart = null, runChart = null;
var weightRange = 30, runRange = 'week';

function collectWeight(days) {
  var labels = [], data = [];
  var today = new Date();
  for (var i = days - 1; i >= 0; i--) {
    var d = addDays(today, -i);
    var k = dateKey(d);
    labels.push((d.getMonth() + 1) + '/' + d.getDate());
    var w = state.records[k] && state.records[k].weight;
    data.push(w ? w : null);
  }
  return { labels: labels, data: data };
}
function collectRunData(range) {
  var buckets = [];
  var today = new Date();
  if (range === 'week') {
    var m = mondayOf(today);
    for (var i = 3; i >= 0; i--) {
      var ws = addDays(m, -7 * i);
      buckets.push({ start: ws, end: addDays(ws, 6), km: 0, times: 0, dur: 0, label: (ws.getMonth() + 1) + '/' + ws.getDate() });
    }
  } else {
    var y = today.getFullYear(), mo = today.getMonth();
    for (var j = 5; j >= 0; j--) {
      var mm = mo - j, yy = y;
      while (mm < 0) { mm += 12; yy--; }
      buckets.push({ start: new Date(yy, mm, 1), end: new Date(yy, mm + 1, 0), km: 0, times: 0, dur: 0, label: (mm + 1) + '月' });
    }
  }
  Object.keys(state.records).forEach(function (k) {
    var r = state.records[k].run;
    if (!r || !(r.distance > 0)) return;
    var d = new Date(k + 'T00:00:00');
    for (var i = 0; i < buckets.length; i++) {
      if (d >= buckets[i].start && d <= buckets[i].end) {
        buckets[i].km += r.distance;
        buckets[i].times++;
        buckets[i].dur += (r.duration || 0);
        break;
      }
    }
  });
  var totKm = 0, totDur = 0, totTimes = 0;
  buckets.forEach(function (b) { totKm += b.km; totDur += b.dur; totTimes += b.times; });
  return {
    labels: buckets.map(function (b) { return b.label; }),
    km: buckets.map(function (b) { return Math.round(b.km * 100) / 100; }),
    times: buckets.map(function (b) { return b.times; }),
    totKm: totKm, totDur: totDur, totTimes: totTimes,
    avgPace: totKm > 0 ? totDur / totKm : null
  };
}
function chartBaseOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12 } } },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { grid: { color: '#223029' } }
    }
  };
}
function renderStats() {
  // 体重曲线
  var wd = collectWeight(weightRange);
  var firstV = null, lastV = null, i;
  for (i = 0; i < wd.data.length; i++) { if (wd.data[i] != null) { firstV = wd.data[i]; break; } }
  for (i = wd.data.length - 1; i >= 0; i--) { if (wd.data[i] != null) { lastV = wd.data[i]; break; } }
  var wsum = '暂无数据';
  if (lastV != null) {
    wsum = '最新 ' + fmtNum(lastV, 1) + ' kg';
    if (firstV != null && firstV !== lastV) {
      var diff = lastV - firstV;
      wsum += ' · ' + weightRange + '天 ' + (diff > 0 ? '+' : '') + fmtNum(diff, 1) + ' kg';
    }
  }
  $('#weight-sum').textContent = wsum;
  if (weightChart) weightChart.destroy();
  var ds = [{
    label: '体重(kg)', data: wd.data,
    borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.12)',
    fill: true, tension: .35, pointRadius: 2.5, pointBackgroundColor: '#a3e635', spanGaps: true
  }];
  if (state.settings.targetWeight) {
    ds.push({
      label: '目标 ' + state.settings.targetWeight + 'kg',
      data: wd.labels.map(function () { return state.settings.targetWeight; }),
      borderColor: '#fb923c', borderDash: [6, 4], pointRadius: 0, fill: false
    });
  }
  weightChart = new Chart($('#weight-chart'), {
    type: 'line', data: { labels: wd.labels, datasets: ds }, options: chartBaseOpts()
  });

  // 跑步图表
  var rd = collectRunData(runRange);
  $('#run-sum').textContent = rd.totTimes ? ('共 ' + rd.totTimes + ' 次 · ' + fmtNum(rd.totKm, 1) + ' km') : '暂无数据';
  if (runChart) runChart.destroy();
  runChart = new Chart($('#run-chart'), {
    type: 'bar',
    data: {
      labels: rd.labels,
      datasets: [
        {
          label: '距离(km)', data: rd.km, yAxisID: 'y', order: 2,
          backgroundColor: 'rgba(34,197,94,.55)', borderColor: '#22c55e',
          borderWidth: 1, borderRadius: 6
        },
        {
          label: '次数', data: rd.times, type: 'line', yAxisID: 'y1', order: 1,
          borderColor: '#fb923c', backgroundColor: '#fb923c',
          tension: .3, pointRadius: 3, pointBackgroundColor: '#fb923c'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12 } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#223029' }, beginAtZero: true },
        y1: { position: 'right', grid: { display: false }, beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
      }
    }
  });
  $('#stat-total-km').textContent = fmtNum(rd.totKm, 1);
  $('#stat-total-times').textContent = rd.totTimes;
  $('#stat-avg-pace').textContent = fmtPace(rd.avgPace);
}

/* ========== 照片时间线 ========== */
function getPhotoDates(desc) {
  var all = [];
  Object.keys(state.records).forEach(function (k) {
    var r = state.records[k];
    if (r.photoId && photoKeys.has(r.photoId)) all.push(k);
  });
  all.sort();
  if (desc) all.reverse();
  return all;
}
async function renderPhotos() {
  var dates = getPhotoDates();
  var wrap = $('#photo-timeline');
  $('#photo-sum').textContent = dates.length ? ('共 ' + dates.length + ' 张 · ' + dates[0] + ' 起记录') : '还没有照片';
  wrap.innerHTML = '';
  if (!dates.length) {
    wrap.innerHTML = '<div class="empty-tip">📷 还没有照片<br>去「今日」页拍下第一张吧</div>';
    return;
  }
  var map = {};
  dates.forEach(function (k) {
    var m = k.slice(0, 7);
    if (!map[m]) map[m] = [];
    map[m].push(k);
  });
  Object.keys(map).sort().reverse().forEach(function (m) {
    var parts = m.split('-');
    var g = document.createElement('div');
    g.className = 'month-group';
    g.innerHTML = '<div class="month-title">' + parts[0] + '年' + parseInt(parts[1], 10) + '月<span>' + map[m].length + ' 张</span></div>';
    var grid = document.createElement('div');
    grid.className = 'photo-grid';
    map[m].forEach(function (k) {
      var cell = document.createElement('div');
      cell.className = 'photo-cell';
      cell.dataset.date = k;
      cell.innerHTML = '<div class="cell-date">' + parseInt(parts[1], 10) + '/' + parseInt(k.slice(8), 10) + '</div>';
      cell.addEventListener('click', function () { openViewer(k); });
      grid.appendChild(cell);
      getPhotoUrl(k).then(function (u) {
        if (u) { var im = document.createElement('img'); im.src = u; cell.insertBefore(im, cell.firstChild); }
      });
    });
    g.appendChild(grid);
    wrap.appendChild(g);
  });
}

/* ========== 大图查看 ========== */
var viewerList = [], viewerIdx = -1;
function openViewer(k) {
  viewerList = getPhotoDates(false);
  viewerIdx = viewerList.indexOf(k);
  showViewerImage();
  openModal('modal-viewer');
}
async function showViewerImage() {
  var k = viewerList[viewerIdx];
  if (!k) return;
  $('#viewer-date').textContent = k + ' · ' + (viewerIdx + 1) + '/' + viewerList.length;
  var u = await getPhotoUrl(k);
  if (u) $('#viewer-img').src = u;
}

/* ========== 双图对比 ========== */
var compareA = null, compareB = null;
function openCompare() {
  compareA = null; compareB = null;
  $('#compare-stage').style.display = 'none';
  $('#compare-hint').style.display = '';
  $('#compare-hint').textContent = '先选第一张（较早的照片）';
  renderComparePick();
  openModal('modal-compare');
}
function renderComparePick() {
  var pick = $('#compare-pick');
  pick.innerHTML = '';
  var dates = getPhotoDates(true);
  if (!dates.length) { pick.innerHTML = '<p class="hint">还没有照片</p>'; return; }
  dates.forEach(function (k) {
    var cell = document.createElement('div');
    cell.className = 'photo-cell';
    cell.dataset.date = k;
    cell.innerHTML = '<div class="cell-date">' + k.slice(5).replace('-', '/') + '</div>';
    if (compareA === k || compareB === k) {
      var badge = document.createElement('div');
      badge.className = 'pick-badge';
      badge.textContent = compareA === k ? 'A' : 'B';
      cell.appendChild(badge);
    }
    cell.addEventListener('click', function () { pickCompare(k); });
    pick.appendChild(cell);
    getPhotoUrl(k).then(function (u) {
      if (u) { var im = document.createElement('img'); im.src = u; cell.insertBefore(im, cell.firstChild); }
    });
  });
}
function pickCompare(k) {
  if (compareA === k || compareB === k) return;
  if (!compareA) {
    compareA = k;
    $('#compare-hint').textContent = '已选 A（' + k + '），再选第二张 B';
    renderComparePick();
    return;
  }
  compareB = k;
  if (compareA > compareB) { var t = compareA; compareA = compareB; compareB = t; }
  $('#compare-hint').style.display = 'none';
  $('#compare-stage').style.display = '';
  getPhotoUrl(compareA).then(function (u) { $('#compare-img-a').src = u; });
  getPhotoUrl(compareB).then(function (u) { $('#compare-img-b').src = u; });
  $('#compare-label-a').textContent = 'A · ' + compareA;
  $('#compare-label-b').textContent = 'B · ' + compareB;
  $('#compare-img-b').style.clipPath = 'inset(0 0 0 50%)';
  $('#compare-divider').style.left = '50%';
}
function initCompareSlider() {
  var slider = $('#compare-slider');
  function setPos(clientX) {
    var r = slider.getBoundingClientRect();
    var p = (clientX - r.left) / r.width;
    p = Math.max(.03, Math.min(.97, p));
    $('#compare-img-b').style.clipPath = 'inset(0 0 0 ' + (p * 100) + '%)';
    $('#compare-divider').style.left = (p * 100) + '%';
  }
  var dragging = false;
  slider.addEventListener('pointerdown', function (e) {
    dragging = true;
    if (slider.setPointerCapture) { try { slider.setPointerCapture(e.pointerId); } catch (err) {} }
    setPos(e.clientX);
  });
  slider.addEventListener('pointermove', function (e) { if (dragging) setPos(e.clientX); });
  slider.addEventListener('pointerup', function () { dragging = false; });
  slider.addEventListener('pointercancel', function () { dragging = false; });
  slider.addEventListener('touchstart', function (e) { if (e.touches.length) setPos(e.touches[0].clientX); }, { passive: true });
  slider.addEventListener('touchmove', function (e) {
    if (e.touches.length) { setPos(e.touches[0].clientX); e.preventDefault(); }
  }, { passive: false });
}

/* ========== 照片拍摄 / 压缩 ========== */
var pendingPhotoFile = null;
function loadImg(url) {
  return new Promise(function (res, rej) {
    var im = new Image();
    im.onload = function () { res(im); };
    im.onerror = rej;
    im.src = url;
  });
}
async function compressImage(file) {
  var url = URL.createObjectURL(file);
  var im = await loadImg(url);
  var ratio = 3 / 4;
  var sw = im.naturalWidth, sh = im.naturalHeight;
  var cw = sw, ch = sh;
  if (sw / sh > ratio) cw = sh * ratio; else ch = sw / ratio;
  var sx = (sw - cw) / 2, sy = (sh - ch) / 2;
  var maxW = 800;
  var scale = Math.min(1, maxW / cw);
  var outW = Math.max(1, Math.round(cw * scale)), outH = Math.max(1, Math.round(ch * scale));
  var canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  canvas.getContext('2d').drawImage(im, sx, sy, cw, ch, 0, 0, outW, outH);
  URL.revokeObjectURL(url);
  var blob = await new Promise(function (res) { canvas.toBlob(function (b) { res(b); }, 'image/jpeg', 0.72); });
  return blob;
}

/* ========== 复制 / 提醒 ========== */
function fallbackCopy(t) {
  var ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('✅ 已复制，去微信粘贴发送'); }
  catch (e) { toast('复制失败，请长按手动复制'); }
  document.body.removeChild(ta);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function () { toast('✅ 已复制，去微信粘贴发送'); }, function () { fallbackCopy(t); });
  } else fallbackCopy(t);
}

/* ========== 备份导出 / 导入 / 清理 ========== */
async function exportBackup() {
  toast('正在打包…');
  var zip = new JSZip();
  zip.file('data.json', JSON.stringify(state, null, 2));
  var folder = zip.folder('photos');
  var keys = await idb.keys();
  for (var i = 0; i < keys.length; i++) {
    var b = await idb.get(keys[i]);
    if (b) folder.file(keys[i] + '.jpg', b);
  }
  var blob = await zip.generateAsync({ type: 'blob' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '跑步打卡备份-' + todayKey() + '.zip';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 60000);
  toast('✅ 已导出，请转发到「文件传输助手」留存');
}

/* 导出记录表格 (CSV，可用 Excel 打开) */
function exportCsv() {
  var rows = [['日期', '跑步距离(km)', '时长(分钟)', '配速(分/公里)', '备注', '体重(kg)', '是否请假']];
  Object.keys(state.records).sort().forEach(function (k) {
    var r = state.records[k];
    var run = (r.run && r.run.distance > 0) ? r.run : null;
    rows.push([
      k,
      run ? run.distance : '',
      run && run.duration ? run.duration : '',
      run && run.pace ? run.pace.toFixed(2) : '',
      run && run.note ? run.note : '',
      (r.weight !== undefined && r.weight !== null) ? r.weight : '',
      r.rest ? '是' : ''
    ]);
  });
  var csv = rows.map(function (row) {
    return row.map(function (c) {
      var s = String(c === undefined || c === null ? '' : c);
      if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',');
  }).join('\r\n');
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '跑步打卡记录-' + todayKey() + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); }, 1000);
  toast('📊 表格已导出，可用 Excel 打开');
}

/* ========== 我的页 ========== */
function renderMe() {
  $('#goal-value').textContent = state.settings.weeklyGoal;
  $('#target-weight-input').value = state.settings.targetWeight || '';
  $('#remind-time').value = state.settings.remindTime || '20:30';
}

/* ========== 初始化 ========== */
async function init() {
  try { await idb.open(); } catch (e) { console.warn('IndexedDB 不可用', e); }
  load();
  await refreshPhotoKeys();

  // 导航与弹窗
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.dataset.tab); }); });
  $$('.modal-close').forEach(function (b) { b.addEventListener('click', function () { closeModal(b.dataset.close); }); });
  $$('.modal-mask').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(m.id); });
  });

  // 跑步
  bindRunField('run-distance-input', 'distance');
  bindRunField('run-duration-input', 'duration');
  bindRunField('run-pace-input', 'pace');
  $('#btn-run-checkin').addEventListener('click', function () { openRunModal(false); });
  $('#btn-run-edit').addEventListener('click', function () { openRunModal(true); });
  $('#btn-run-save').addEventListener('click', function () {
    var d = runInputVal('run-distance-input'), t = runInputVal('run-duration-input'), p = runInputVal('run-pace-input');
    if (!d || !t) { toast('请填写距离和时长（或距离和配速）'); return; }
    if (!p) p = t / d;
    var r = rec();
    delete r.rest;
    r.run = {
      distance: Math.round(d * 100) / 100,
      duration: Math.round(t * 100) / 100,
      pace: Math.round(p * 100) / 100,
      note: $('#run-note-input').value.trim(),
      savedAt: new Date().toISOString()
    };
    save();
    closeModal('modal-run');
    var wp = weekProgress();
    toast(wp.done >= wp.goal ? '🎉 本周目标达成！太棒了！' : '✅ 打卡成功，继续加油！');
    renderToday();
  });
  $('#btn-run-delete').addEventListener('click', function () {
    var r = rec();
    delete r.run;
    save();
    closeModal('modal-run');
    toast('已撤销今日打卡');
    renderToday();
  });

  // 体重
  $('#btn-weight-save').addEventListener('click', function () {
    var v = parseFloat($('#weight-input').value);
    if (!isFinite(v) || v <= 0) { toast('请输入有效体重'); return; }
    rec().weight = Math.round(v * 10) / 10;
    save();
    toast('⚖️ 体重已记录');
    renderToday();
  });

  // 请假 / 休息
  $('#btn-rest-day').addEventListener('click', function () {
    var r = rec();
    if (r.rest) { delete r.rest; toast('已取消请假，今天动起来吧！'); }
    else { r.rest = true; toast('🛌 已请假，今天好好休息'); }
    save();
    renderToday();
  });

  // 拍照
  $('#btn-take-photo').addEventListener('click', function () { $('#camera-input').click(); });
  $('#btn-retake-photo').addEventListener('click', function () { $('#camera-input').click(); });
  $('#camera-input').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    pendingPhotoFile = f;
    $('#photo-preview-img').src = URL.createObjectURL(f);
    openModal('modal-photo');
    e.target.value = '';
  });
  $('#btn-photo-retake').addEventListener('click', function () { $('#camera-input').click(); });
  $('#btn-photo-save').addEventListener('click', async function () {
    if (!pendingPhotoFile) return;
    $('#btn-photo-save').textContent = '保存中…';
    try {
      var blob = await compressImage(pendingPhotoFile);
      await idb.put(todayKey(), blob);
      rec().photoId = todayKey();
      save();
      photoKeys.add(todayKey());
      closeModal('modal-photo');
      toast('📷 今日照片已保存');
      renderToday();
    } catch (err) { toast('照片保存失败：' + err.message); }
    $('#btn-photo-save').textContent = '使用这张';
  });

  // 日历翻页
  $('#cal-prev').addEventListener('click', function () {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', function () {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  // 统计范围切换
  $$('#weight-range button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#weight-range button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      weightRange = parseInt(b.dataset.r, 10);
      renderStats();
    });
  });
  $$('#run-range button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#run-range button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      runRange = b.dataset.r;
      renderStats();
    });
  });

  // 照片：大图与对比
  $('#btn-compare').addEventListener('click', openCompare);
  $('#btn-viewer-prev').addEventListener('click', function () { if (viewerIdx > 0) { viewerIdx--; showViewerImage(); } });
  $('#btn-viewer-next').addEventListener('click', function () { if (viewerIdx < viewerList.length - 1) { viewerIdx++; showViewerImage(); } });
  $('#btn-compare-reset').addEventListener('click', function () {
    compareA = null; compareB = null;
    $('#compare-stage').style.display = 'none';
    $('#compare-hint').style.display = '';
    $('#compare-hint').textContent = '先选第一张（较早的照片）';
    renderComparePick();
  });
  initCompareSlider();

  // 我的页设置
  $('#btn-goal-minus').addEventListener('click', function () {
    state.settings.weeklyGoal = Math.max(1, state.settings.weeklyGoal - 1);
    save(); renderMe(); renderToday();
  });
  $('#btn-goal-plus').addEventListener('click', function () {
    state.settings.weeklyGoal = Math.min(7, state.settings.weeklyGoal + 1);
    save(); renderMe(); renderToday();
  });
  $('#btn-target-weight-save').addEventListener('click', function () {
    var v = parseFloat($('#target-weight-input').value);
    state.settings.targetWeight = (isFinite(v) && v > 0) ? Math.round(v * 10) / 10 : null;
    save();
    toast('✅ 目标体重已保存');
    renderMe();
  });
  $('#remind-time').addEventListener('change', function () {
    state.settings.remindTime = this.value || '20:30';
    save();
    toast('⏰ 提醒时间已保存');
  });
  $('#btn-gen-reminder').addEventListener('click', function () {
    var t = state.settings.remindTime || '20:30';
    var msg = '🏃【跑步打卡提醒】\n今天跑了吗？\n跑完记得打卡 + 拍张正面照：\n' + location.href + '\n\n💡 长按这条消息 → 提醒 → 设为每天 ' + t + ' 重复提醒';
    copyText(msg);
    $('#remind-hint').textContent = '已复制！发给「文件传输助手」，长按消息 → 提醒 → 每天 ' + t + ' 重复。小程序注册好后可升级为微信订阅消息推送。';
  });

  // 备份
  $('#btn-export').addEventListener('click', function () {
    exportBackup().catch(function (e) { toast('导出失败：' + e.message); });
  });
  $('#btn-export-csv').addEventListener('click', exportCsv);
  $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
  $('#import-file').addEventListener('change', async function (e) {
    var f = e.target.files[0];
    if (!f) return;
    try {
      var zip = await JSZip.loadAsync(f);
      var df = zip.file('data.json');
      if (!df) throw new Error('备份里没有 data.json');
      var data = JSON.parse(await df.async('string'));
      if (!data.records || !data.settings) throw new Error('备份格式不正确');
      if (!confirm('导入将覆盖当前全部数据（现有 ' + Object.keys(state.records).length + ' 天记录），确定继续？')) return;
      var names = Object.keys(zip.files).filter(function (n) { return n.indexOf('photos/') === 0 && !zip.files[n].dir; });
      for (var i = 0; i < names.length; i++) {
        var k = names[i].slice(7, -4);
        var blob = await zip.files[names[i]].async('blob');
        await idb.put(k, blob);
      }
      state = data;
      save();
      await refreshPhotoKeys();
      renderToday(); renderCalendar(); renderStats(); renderPhotos(); renderMe();
      toast('✅ 备份导入成功');
    } catch (err) { toast('导入失败：' + err.message); }
    e.target.value = '';
  });

  // 清理
  $('#btn-clear-old-photos').addEventListener('click', async function () {
    var cutoff = dateKey(addDays(new Date(), -30));
    var keys = await idb.keys();
    var old = keys.filter(function (k) { return k < cutoff; });
    if (!old.length) { toast('没有 30 天前的照片'); return; }
    if (!confirm('将删除 ' + old.length + ' 张 30 天前的照片（打卡记录保留），确定？')) return;
    for (var i = 0; i < old.length; i++) { await idb.del(old[i]); }
    await refreshPhotoKeys();
    toast('✅ 已清理 ' + old.length + ' 张旧照片');
  });
  $('#btn-clear-all').addEventListener('click', async function () {
    if (!confirm('确定清空全部打卡数据和照片？此操作不可恢复，请先备份！')) return;
    if (!confirm('再次确认：真的要清空全部数据吗？')) return;
    await idb.clear();
    localStorage.removeItem(STORE_KEY);
    state = defaultState();
    photoKeys = new Set();
    urlCache = {};
    renderToday(); renderCalendar(); renderStats(); renderPhotos(); renderMe();
    toast('已清空全部数据');
  });

  renderToday();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
