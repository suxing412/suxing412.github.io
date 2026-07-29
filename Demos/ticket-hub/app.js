// app.js — 视图逻辑：项目总览 / 树形 / 看板 / 详情编辑（hash 路由）
// 暂存-保存模式：一切改动先进 staged，点「保存」才 POST /api/save
let INDEX = null;
const staged = { updates: new Map(), creates: [] }; // updates: id → {fields, body}
const ui = { tab: {},                               // tab: project → 'tree'|'board'
  // 折叠状态持久化：collapsed=当前折叠集；collapsedTouched=用户手动碰过的（自动折叠不覆盖用户意愿）
  collapsed: new Set(JSON.parse(localStorage.getItem('hub.collapsed') || '[]')),
  collapsedTouched: new Set(JSON.parse(localStorage.getItem('hub.collapsedTouched') || '[]')),
  glabelW: parseInt(localStorage.getItem('hub.glabelW'), 10) || 0 }; // 甘特工单栏宽度记忆
function saveCollapsed() {
  localStorage.setItem('hub.collapsed', JSON.stringify([...ui.collapsed]));
  localStorage.setItem('hub.collapsedTouched', JSON.stringify([...ui.collapsedTouched]));
}
function toggleCollapse(id) {
  ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id);
  ui.collapsedTouched.add(id);
  saveCollapsed();
}
// 某单之下所有「待验收」后代（一键验收用）
function pendingAcceptDescendants(id) {
  const byId = new Map(INDEX.tickets.map((t) => [t.id, t]));
  const out = [];
  (function walk(tid) {
    const t = byId.get(tid);
    if (!t) return;
    for (const cid of (t.childIds || [])) {
      const c = byId.get(cid);
      if (!c) continue;
      if (c.status === '待验收' && (c.isLeaf || c.statusManual)) out.push(c.id);
      walk(cid);
    }
  })(id);
  return out;
}

// 已完成的父单默认自动折叠（仅限用户从未手动碰过的），树形保持清爽
function autoCollapseDone() {
  if (!INDEX) return;
  let changed = false;
  for (const t of INDEX.tickets) {
    if (t.childIds && t.childIds.length && t.status === '完成'
      && !ui.collapsedTouched.has(t.id) && !ui.collapsed.has(t.id)) {
      ui.collapsed.add(t.id);
      changed = true;
    }
  }
  if (changed) saveCollapsed();
}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ST_CLS = { 草稿: 'st-draft', 就绪: 'st-ready', 进行中: 'st-doing', 待评审: 'st-review',
  待验收: 'st-accept', 完成: 'st-done', 搁置: 'st-hold', 废弃: 'st-dead' };

// 顶栏动态标题 + 面包屑（对齐设计稿：36px 页面标题 / 14px 面包屑）
function setHeader(title, crumbHtml) {
  $('page-title').textContent = title;
  $('crumb').innerHTML = crumbHtml;
}

async function loadIndex() {
  const res = await fetch('/api/index');
  const data = await res.json();
  if (data.error) { $('view').innerHTML = `<div class="fatal"><h2>无法加载</h2><p>${esc(data.error)}</p></div>`; throw new Error(data.error); }
  INDEX = data;
  autoCollapseDone(); // 已完成父单默认折叠（用户手动展开过的不动）
}

// ---- 暂存层 ----
function stageUpdate(id, fields, body) {
  const cur = staged.updates.get(id) || { fields: {} };
  Object.assign(cur.fields, fields || {});
  if (body !== undefined) cur.body = body;
  staged.updates.set(id, cur);
  renderSaveBar();
}
function stagedCount() { return staged.updates.size + staged.creates.length; }
function discardStaged() { staged.updates.clear(); staged.creates.length = 0; renderSaveBar(); route(); }

// 合并暂存后的展示值
function eff(t) {
  const u = staged.updates.get(t.id);
  return u ? { ...t, ...u.fields, dependsOn: u.fields.depends_on ?? t.dependsOn } : t;
}

async function saveStaged() {
  const btn = $('btn-save');
  btn.disabled = true; btn.textContent = '保存中…';
  try {
    const changes = [];
    for (const [id, u] of staged.updates) {
      const c = { type: 'update', id, fields: u.fields };
      if (u.body !== undefined) c.body = u.body;
      changes.push(c);
    }
    for (const c of staged.creates) changes.push({ type: 'create', ...c });
    const res = await fetch('/api/save', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
    const data = await res.json();
    if (data.ok) {
      staged.updates.clear(); staged.creates.length = 0;
      await loadIndex(); renderSaveBar(); route();
      showToast(`已保存 ✓（${data.applied.length} 张工单）`);
    } else {
      $('savebar-text').innerHTML = `<span class="err">保存被拒绝：${esc((data.errors || [data.error]).join('；'))}</span>`;
    }
  } finally {
    btn.disabled = false; btn.textContent = '保存';
  }
}

function renderSaveBar() {
  const n = stagedCount();
  const bar = $('savebar');
  bar.hidden = false; // 常驻：不再突然蹦出
  bar.classList.toggle('idle', n === 0);
  $('savebar-text').textContent = n ? `未保存变更 ${n} 条` : '没有未保存的更改';
  $('btn-save').disabled = n === 0;
  $('btn-discard').disabled = n === 0;
}

// 悬浮横向滑块：内容平铺时，横向滚动条固定在窗口底部跟随（容器底部滚入视口后隐藏，交还原生滚条）
function attachFloatScroll(container) {
  if (window._fsCleanup) { window._fsCleanup(); window._fsCleanup = null; }
  document.querySelectorAll('.floatscroll').forEach((e) => e.remove());
  if (!container) return;
  const bar = document.createElement('div');
  bar.className = 'floatscroll';
  bar.innerHTML = '<div style="height:1px"></div>';
  document.body.appendChild(bar);
  const sync = () => {
    if (!document.body.contains(container)) { bar.remove(); return; }
    const r = container.getBoundingClientRect();
    const need = container.scrollWidth > container.clientWidth + 2;
    // 容器顶部已进入视口、底部（自带滚条处）还在窗口外 → 悬浮条出场
    const show = need && r.top < window.innerHeight - 80 && r.bottom > window.innerHeight;
    bar.style.display = show ? 'block' : 'none';
    if (show) {
      bar.style.left = Math.max(0, r.left) + 'px';
      bar.style.width = Math.min(r.width, window.innerWidth) + 'px';
      bar.firstChild.style.width = container.scrollWidth + 'px';
      if (Math.abs(bar.scrollLeft - container.scrollLeft) > 1) bar.scrollLeft = container.scrollLeft;
    }
  };
  bar.addEventListener('scroll', () => { container.scrollLeft = bar.scrollLeft; });
  container.addEventListener('scroll', () => { if (bar.style.display !== 'none') bar.scrollLeft = container.scrollLeft; });
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  window._fsCleanup = () => { window.removeEventListener('scroll', sync); window.removeEventListener('resize', sync); };
  sync(); setTimeout(sync, 60);
}

// 操作成功轻提示（1.8s 自动淡出）
function showToast(msg) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1900);
}

// ---- 视图：项目总览 ----
function renderOverview() {
  setHeader('工单中台', 'ticket-hub · AI开单工作流');
  const cards = INDEX.projects.map((p) => {
    const ms = p.milestones.map((m) =>
      `<div class="ms"><span>${esc(m.name)}</span><div class="bar"><i style="width:${m.completion}%"></i></div><b>${m.completion}%</b></div>`).join('');
    return `<a class="proj-card" href="#/p/${esc(p.code)}" style="--spine:${esc(p.color)}">
      <div class="head"><h2>${esc(p.name)}</h2><span class="code">${esc(p.code)}</span></div>
      <div class="big"><b>${p.completion}%</b><span>整体完成度</span></div>
      <div class="bar main"><i style="width:${p.completion}%"></i></div>
      <div class="nums">
        <span>共 ${p.total} 单</span><span>进行中 ${p.inProgress}</span>
        <span class="${p.overdue ? 'warn' : ''}">逾期 ${p.overdue}</span>
      </div>
      <div class="mss">${ms || '<span class="dim">（尚无里程碑）</span>'}</div>
    </a>`;
  }).join('');
  $('view').innerHTML = `<div class="proj-grid">${cards}</div>`;
}

// ---- 视图：项目工作区（树 / 看板）----
function projTickets(code) { return INDEX.tickets.filter((t) => t.project === code); }

function renderProject(code) {
  const p = INDEX.projects.find((x) => x.code === code);
  if (!p) { $('view').innerHTML = '<p class="dim">项目不存在</p>'; return; }
  const tab = ui.tab[code] || 'tree';
  const tabNames = { tree: '树形', board: '看板', gantt: '甘特', queue: '队列' };
  setHeader(p.name, `<a href="#/">项目</a> / ${esc(p.name)} / ${tabNames[tab]}`);
  $('view').innerHTML = `
    <div class="proj-head">
      <div class="tabs">
        <button data-tab="tree" class="${tab === 'tree' ? 'active' : ''}">树形</button>
        <button data-tab="board" class="${tab === 'board' ? 'active' : ''}">看板</button>
        <button data-tab="gantt" class="${tab === 'gantt' ? 'active' : ''}">甘特</button>
        <button data-tab="queue" class="${tab === 'queue' ? 'active' : ''}" id="tab-queue">队列</button>
      </div>
      <button id="btn-new-top" class="primary small">＋ 顶层工单</button>
    </div>
    <div id="proj-body"></div>`;
  $('view').querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => { ui.tab[code] = b.dataset.tab; renderProject(code); }));
  $('btn-new-top').addEventListener('click', () => { location.hash = `#/new/${code}`; });
  // 队列计数角标（后台拉取，不阻塞视图）
  fetch('/api/queue?project=' + encodeURIComponent(code)).then((r) => r.json()).then((q) => {
    const el = $('tab-queue');
    if (el && !q.error) el.textContent = `队列·${q.queue.length}${q.paused ? '⏸' : ''}${q.inFlight && q.inFlight.stalled ? '⚠' : ''}`;
  }).catch(() => {});
  if (tab === 'tree') renderTree(code); else if (tab === 'board') renderBoard(code);
  else if (tab === 'gantt') renderGantt(code); else renderQueue(code);
}

function renderTree(code) {
  const all = projTickets(code).map(eff);
  const byParent = new Map();
  for (const t of all) {
    const key = t.parent || '__root__';
    (byParent.get(key) || byParent.set(key, []).get(key)).push(t);
  }
  const rows = [];
  function walk(list, depth) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    for (const t of list) {
      const kids = byParent.get(t.id) || [];
      const stagedKids = staged.creates.filter((c) => c.parent === t.id);
      const collapsed = ui.collapsed.has(t.id);
      rows.push(`<div class="trow" style="--indent:${depth}">
        <span class="twist ${kids.length + stagedKids.length ? '' : 'none'}" data-id="${esc(t.id)}">${collapsed ? '▸' : '▾'}</span>
        <span class="chip ${ST_CLS[t.status] || ''}">${esc(t.status)}</span>
        <a class="tid" href="#/t/${esc(t.id)}">${esc(t.id)}</a>
        <a class="ttitle" href="#/t/${esc(t.id)}">${esc(t.title)}${staged.updates.has(t.id) ? ' <i class="stagedmark">●未保存</i>' : ''}</a>
        <span class="tmeta">${esc(t.levelName || '')} · ${esc(t.priority)}${t.estimate ? ' · ' + esc(t.estimate) : ''}${t.start || t.due ? ` · ${esc(t.start || '?')}→${esc(t.due || '?')}` : ''}</span>
        ${t.overdue ? '<span class="badge-over">逾期</span>' : ''}
        ${t.errors && t.errors.length ? `<span class="badge-err" title="${esc(t.errors.join('；'))}">结构错误</span>` : ''}
        <span class="tbar"><i style="width:${t.progress}%"></i></span><b class="tpct">${t.progress}%</b>
        ${t.status === '待验收' && (t.isLeaf || t.statusManual) ? `<button class="mini2 accept" data-id="${esc(t.id)}">✓验收</button>` : ''}
        ${!t.isLeaf && pendingAcceptDescendants(t.id).length ? `<button class="mini2 acceptall" data-id="${esc(t.id)}">✓验收子单×${pendingAcceptDescendants(t.id).length}</button>` : ''}
        ${t.depth < (INDEX.maxDepth || 4) ? `<button class="mini addchild" data-id="${esc(t.id)}">＋子单</button>` : ''}
      </div>`);
      if (!collapsed) {
        for (const c of stagedKids) {
          rows.push(`<div class="trow staged-new" style="--indent:${depth + 1}"><span class="twist none"></span>
            <span class="chip st-draft">草稿</span><span class="tid dim">（保存后分配）</span>
            <span class="ttitle">${esc(c.fields.title || '（未命名）')} <i class="stagedmark">●新建未保存</i></span></div>`);
        }
        if (kids.length) walk(kids, depth + 1);
      }
    }
  }
  walk(byParent.get('__root__') || [], 0);
  const stagedTop = staged.creates.filter((c) => !c.parent && c.project === code).map((c) =>
    `<div class="trow staged-new" style="--indent:0"><span class="twist none"></span>
     <span class="chip st-draft">草稿</span><span class="tid dim">（保存后分配）</span>
     <span class="ttitle">${esc(c.fields.title || '（未命名）')} <i class="stagedmark">●新建未保存</i></span></div>`).join('');
  $('proj-body').innerHTML = `<div class="tree">${rows.join('') + stagedTop || '<p class="dim">还没有工单，点右上「＋ 顶层工单」。</p>'}</div>`;
  $('proj-body').querySelectorAll('.twist:not(.none)').forEach((el) =>
    el.addEventListener('click', () => {
      toggleCollapse(el.dataset.id);
      renderTree(code);
    }));
  $('proj-body').querySelectorAll('.addchild').forEach((el) =>
    el.addEventListener('click', () => { location.hash = `#/new/${code}?parent=${el.dataset.id}`; }));
  $('proj-body').querySelectorAll('.acceptall').forEach((el) =>
    el.addEventListener('click', async () => {
      const ids = pendingAcceptDescendants(el.dataset.id);
      if (!ids.length) return;
      if (!confirm(`一键验收 ${el.dataset.id} 下全部 ${ids.length} 张待验收子单？\n${ids.join('、')}\n状态全部置「完成」。`)) return;
      const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: ids.map((tid) => ({ type: 'update', id: tid, fields: { status: '完成' } })) }) });
      const data = await res.json();
      if (!data.ok) alert('批量验收失败：' + (data.errors || [data.error]).join('；'));
      else showToast(`已验收 ${ids.length} 张子单 ✓`);
      await loadIndex(); renderTree(code);
    }));
  $('proj-body').querySelectorAll('.accept').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm(`验收通过 ${el.dataset.id}？状态置「完成」。`)) return;
      const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: [{ type: 'update', id: el.dataset.id, fields: { status: '完成' } }] }) });
      const data = await res.json();
      if (!data.ok) alert('验收失败：' + (data.errors || [data.error]).join('；'));
      else showToast(`${el.dataset.id} 验收完成 ✓`);
      await loadIndex(); renderTree(code);
    }));
}

function renderBoard(code) {
  // 设计稿 03：六主列常显，搁置/废弃折叠（点击展开）
  const mainStatuses = ['草稿', '就绪', '进行中', '待评审', '待验收', '完成'];
  const foldStatuses = ['搁置', '废弃'];
  const cfgStatuses = ui.boardFold === false ? mainStatuses.concat(foldStatuses) : mainStatuses;
  const all = projTickets(code).map(eff);
  const foldCount = all.filter((t) => foldStatuses.includes(t.status)).length;
  const cols = cfgStatuses.map((s) => {
    const cards = all.filter((t) => t.status === s).map((t) => {
      const draggable = t.isLeaf || t.statusManual;
      return `<div class="bcard ${draggable ? '' : 'locked'}" draggable="${draggable}" data-id="${esc(t.id)}">
        <a class="tid" href="#/t/${esc(t.id)}">${esc(t.id)}</a>
        <p>${esc(t.title)}${staged.updates.has(t.id) ? ' <i class="stagedmark">●</i>' : ''}</p>
        <span class="tmeta">${esc(t.priority)}${t.due ? ' · 截止 ' + esc(t.due) : ''}</span>
        ${t.overdue ? '<span class="badge-over">逾期</span>' : ''}
        ${!draggable ? '<span class="locktag">🔒 父单 · 状态由子单推导</span>' : ''}
      </div>`;
    }).join('');
    return `<div class="bcol" data-status="${esc(s)}"><h3>${esc(s)} <span class="cnt">${all.filter((t) => t.status === s).length}</span></h3>${cards}</div>`;
  }).join('');
  const foldStrip = ui.boardFold === false
    ? '<div class="bcol bfold" id="board-fold"><h3>« 收起</h3></div>'
    : `<div class="bcol bfold" id="board-fold"><h3>搁置/废弃 ${foldCount} »</h3></div>`;
  $('proj-body').innerHTML = `<div class="board">${cols}${foldStrip}</div>`;
  $('board-fold').addEventListener('click', () => { ui.boardFold = ui.boardFold === false ? true : false; renderBoard(code); });
  attachFloatScroll($('proj-body').querySelector('.board')); // 悬浮横向滑块（固定栏宽溢出时可拖）
  let dragId = null;
  $('proj-body').querySelectorAll('.bcard').forEach((el) => {
    // 点卡片任意处进详情（拖拽会抑制 click；点已有链接不重复跳）
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = '#/t/' + el.dataset.id;
    });
  });
  $('proj-body').querySelectorAll('.bcard[draggable="true"]').forEach((el) => {
    el.addEventListener('dragstart', () => { dragId = el.dataset.id; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });
  $('proj-body').querySelectorAll('.bcol').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault(); col.classList.remove('over');
      if (dragId) { stageUpdate(dragId, { status: col.dataset.status }); renderBoard(code); }
    });
  });
}

// ---- 视图：甘特图 ----
const DAY = 86400000;
const d2n = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY); // YYYY-MM-DD → 天序号
const n2d = (n) => new Date(n * DAY).toISOString().slice(0, 10);
// 小时级：'YYYY-MM-DD[ HH:mm]' ↔ 浮点天数
const s2n = (s) => {
  const [d, t] = String(s).split(' ');
  let n = Date.parse(d + 'T00:00:00Z') / DAY;
  if (t) { const [h, m] = t.split(':'); n += (Number(h) + Number(m) / 60) / 24; }
  return n;
};
const n2s = (n) => {
  const day = Math.floor(n + 1e-9);
  const frac = n - day;
  const dstr = n2d(day);
  if (frac > 1e-6) {
    const mins = Math.round(frac * 1440);
    return `${dstr} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  return dstr;
};
const hasTime = (s) => String(s).includes(' ');
// 结束边界：date-only 截止=当天整天（+1），带时分=精确到点
const endN = (s) => hasTime(s) ? s2n(s) : s2n(s) + 1;

function ganttOrder(code) {
  // 与树形一致的先序遍历
  const all = projTickets(code).map(eff);
  const byParent = new Map();
  for (const t of all) {
    const key = t.parent || '__root__';
    (byParent.get(key) || byParent.set(key, []).get(key)).push(t);
  }
  const rows = [];
  (function walk(list, depth) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    for (const t of list) {
      rows.push({ ...t, gDepth: depth, gKids: (byParent.get(t.id) || []).length });
      if (!ui.collapsed.has(t.id)) walk(byParent.get(t.id) || [], depth + 1); // 折叠与树形共享
    }
  })(byParent.get('__root__') || [], 0);
  // 父单汇总区间 = 子孙叶子日期的包络（用全量集合，折叠不影响包络）
  const byId = new Map(all.map((r) => [r.id, r]));
  function span(t) {
    if (t.isLeaf) return (t.start && t.due) ? [t.start, t.due] : (t.start ? [t.start, t.start] : null);
    let lo = null; let hi = null;
    for (const cid of t.childIds) {
      const c = byId.get(cid); if (!c) continue;
      const s = span(c); if (!s) continue;
      if (!lo || s[0] < lo) lo = s[0];
      if (!hi || s[1] > hi) hi = s[1];
    }
    return lo ? [lo, hi] : null;
  }
  for (const r of rows) r.gSpan = span(r);
  return rows;
}

// 视口即周期：日视图 1 天占满图表宽、周视图 7 天、月视图 31 天、年视图 366 天
const GSCALES = { day: { period: 1, label: '日' }, week: { period: 7, label: '周' },
  month: { period: 31, label: '月' }, year: { period: 366, label: '年' } };

function renderGantt(code) {
  const rows = ganttOrder(code);
  const today = INDEX.today;
  const tn = d2n(today);
  const scale = ui.gscale || 'day';
  // 当前时刻在一天里的比例（日视图今日线按小时分钟精确定位）
  const nowDt = new Date();
  const nowFrac = (nowDt.getHours() + nowDt.getMinutes() / 60) / 24;
  const nowHM = `${String(nowDt.getHours()).padStart(2, '0')}:${String(nowDt.getMinutes()).padStart(2, '0')}`;
  // 完整日历时间窗：保底窗口（不随工单收缩）∪ 数据包络（只向外扩）
  const MIN_WIN = { day: [3, 11], week: [14, 42], month: [62, 124], year: [366, 550] }[scale];
  const pad = { day: 2, week: 7, month: 31, year: 180 }[scale];
  let lo = tn - MIN_WIN[0]; let hi = tn + MIN_WIN[1];
  const dated = rows.filter((r) => r.gSpan);
  if (dated.length) {
    lo = Math.min(lo, Math.floor(Math.min(...dated.map((r) => s2n(r.gSpan[0])))) - pad);
    hi = Math.max(hi, Math.ceil(Math.max(...dated.map((r) => endN(r.gSpan[1])))) + pad);
  }
  // 起点对齐：日/周从周一开始，月/年从每月 1 号开始——像真日历
  if (scale === 'day' || scale === 'week') {
    while (new Date(lo * DAY).getUTCDay() !== 1) lo--;
  } else {
    while (new Date(lo * DAY).getUTCDate() !== 1) lo--;
  }
  // 视口即周期：图表可视宽 ÷ 周期天数 = 每天像素宽
  const labelW = window.innerWidth <= 1200 ? 240 : (window.innerWidth <= 1600 ? 300 : 380);
  const chartW = Math.max(480, ($('proj-body').clientWidth || 1200) - labelW - 4);
  const dayW = chartW / GSCALES[scale].period;
  const rowH = 64; const headH = 46;
  const days = hi - lo + 1;
  const W = Math.round(days * dayW); const H = rows.length * rowH;

  // 表头：按粒度出刻度；周末底纹仅日粒度
  let head = ''; let shade = '';
  let curMonth = ''; let curYear = '';
  for (let i = 0; i < days; i++) {
    const dstr = n2d(lo + i);
    const dt = new Date((lo + i) * DAY);
    const dow = dt.getUTCDay();
    const dom = dt.getUTCDate();
    const x = i * dayW;
    const DOW_CN = ['日', '一', '二', '三', '四', '五', '六'];
    const isToday = lo + i === tn;
    if (scale === 'day') {
      // 一天占满图表：逐小时竖线，每 2 小时标注，日期大标题
      if (dow === 0 || dow === 6) shade += `<rect x="${x}" y="0" width="${dayW}" height="${H}" class="gwe"/>`;
      if (isToday) shade += `<rect x="${x}" y="0" width="${dayW}" height="${H}" class="gtodaycol"/>`;
      shade += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="gweekline"/>`;
      const nowX = isToday ? x + dayW * nowFrac : null;
      for (let hh = 1; hh < 24; hh++) {
        const hx = x + dayW * hh / 24;
        shade += `<line x1="${hx}" y1="0" x2="${hx}" y2="${H}" class="${hh % 6 === 0 ? 'gdaysep' : 'ghour'}"/>`;
        // 灰色小时刻度让位给红色「▾ HH:mm」标签，避免撞字
        const nearNow = nowX !== null && hx > nowX - 14 && hx < nowX + 52;
        if (hh % 2 === 0 && !nearNow) head += `<text x="${hx}" y="42" class="ghourtxt">${hh}</text>`;
      }
      head += `<text x="${x + 8}" y="20" class="gdayl big ${isToday ? 'gtodaytxt' : ''}">${dstr.slice(5)} 周${DOW_CN[dow]}${isToday ? ' · 今天' : ''}</text>`;
      if (isToday) head += `<text x="${x + dayW * nowFrac + 5}" y="42" class="gnowtxt">▾ ${nowHM}</text>`;
    } else if (scale === 'week') {
      // 一周占满：逐日分隔与标注
      if (dow === 0 || dow === 6) shade += `<rect x="${x}" y="0" width="${dayW}" height="${H}" class="gwe"/>`;
      if (isToday) shade += `<rect x="${x}" y="0" width="${dayW}" height="${H}" class="gtodaycol"/>`;
      shade += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="${dow === 1 ? 'gweekline' : 'gdaysep'}"/>`;
      head += `<text x="${x + dayW / 2}" y="34" class="gday ${isToday ? 'gtodaytxt' : ''}">${dom} 周${DOW_CN[dow]}</text>`;
      const mon = dstr.slice(0, 7);
      if (mon !== curMonth) { curMonth = mon; head += `<text x="${x + 4}" y="14" class="gmon">${mon}</text>`; }
    } else if (scale === 'month') {
      // 一月占满：逐日小标注，周一加粗
      if (dow === 0 || dow === 6) shade += `<rect x="${x}" y="0" width="${dayW}" height="${H}" class="gwe"/>`;
      if (isToday) shade += `<rect x="${x}" y="0" width="${dayW}" height="${H}" class="gtodaycol"/>`;
      shade += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="${dow === 1 ? 'gweekline' : 'ghour'}"/>`;
      head += `<text x="${x + dayW / 2}" y="34" class="ghourtxt ${isToday ? 'gtodaytxt' : ''}">${dom}</text>`;
      if (dom === 1) head += `<text x="${x + 4}" y="14" class="gmon">${dstr.slice(0, 7)}</text>`;
    } else { // year：月为格
      if (dom === 1) {
        shade += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="${dt.getUTCMonth() % 3 === 0 ? 'gweekline' : 'gdaysep'}"/>`;
        head += `<text x="${x + 4}" y="34" class="ghourtxt">${dt.getUTCMonth() + 1}月</text>`;
      }
      const yr = dstr.slice(0, 4);
      if (yr !== curYear) { curYear = yr; head += `<text x="${x + 4}" y="14" class="gmon">${yr}</text>`; }
    }
  }

  // 行、条、依赖
  const ST_BAR = { 草稿: 'gb-draft', 就绪: 'gb-ready', 进行中: 'gb-doing', 待评审: 'gb-review',
    待验收: 'gb-accept', 完成: 'gb-done', 搁置: 'gb-hold', 废弃: 'gb-dead' };
  let bars = ''; let deps = ''; let labels = '';
  const pos = new Map(); // id → {x1,x2,y} 供依赖箭头
  rows.forEach((r, i) => {
    const y = i * rowH;
    labels += `<div class="glabel" style="height:${rowH}px;padding-left:${r.gDepth * 18 + 8}px">
      <span class="twist ${r.gKids ? '' : 'none'}" data-tw="${esc(r.id)}">${ui.collapsed.has(r.id) ? '▸' : '▾'}</span>
      <a class="tid" href="#/t/${esc(r.id)}">${esc(r.id)}</a>
      <a class="gtitle" href="#/t/${esc(r.id)}" title="${esc(r.id)} ${esc(r.title)}">${esc(r.title)}${staged.updates.has(r.id) ? ' <i class="stagedmark">●</i>' : ''}</a>
      ${r.gSpan ? '' : `<button class="mini gsched" data-id="${esc(r.id)}" ${r.isLeaf ? '' : 'hidden'}>排到今天</button>`}
    </div>`;
    if (!r.gSpan) return;
    const sN = s2n(r.gSpan[0]);
    const eN = endN(r.gSpan[1]);
    const x1 = (sN - lo) * dayW;
    const x2 = (eN - lo) * dayW;
    pos.set(r.id, { x1, x2, y: y + rowH / 2 });
    if (!r.isLeaf) {
      bars += `<g class="gparent"><rect x="${x1}" y="${y + 28}" width="${x2 - x1}" height="8" rx="4"/>
        <path d="M${x1},${y + 28} v14 M${x2},${y + 28} v14" /></g>`;
    } else {
      const cls = ST_BAR[r.status] || 'gb-draft';
      const bw = x2 - x1;
      const barLabel = bw > 150 ? `${r.progress}% · ${r.title.slice(0, Math.floor((bw - 60) / 14))}` : (bw > 48 ? `${r.progress}%` : '');
      bars += `<g class="gbar ${cls} ${r.overdue ? 'gover' : ''}" data-id="${esc(r.id)}"
          data-s="${sN}" data-e="${eN}">
        <title>${esc(r.id)} ${esc(r.title)} · ${esc(r.gSpan[0])} → ${esc(r.gSpan[1])}（右键取消排期）</title>
        <rect class="gmain" x="${x1}" y="${y + 21}" width="${bw}" height="22" rx="11"/>
        <rect class="ghandle gh-l" x="${x1}" y="${y + 21}" width="7" height="22"/>
        <rect class="ghandle gh-r" x="${x2 - 7}" y="${y + 21}" width="7" height="22"/>
        ${barLabel ? `<text x="${x1 + 12}" y="${y + 36}" class="gpct">${esc(barLabel)}</text>` : ''}
      </g>`;
    }
  });
  rows.forEach((r) => {
    for (const dep of (r.dependsOn || [])) {
      const a = pos.get(dep); const b = pos.get(r.id);
      if (!a || !b) continue;
      const mx = a.x2 + Math.max(12, (b.x1 - a.x2) / 2);
      deps += `<path class="gdep" d="M${a.x2},${a.y} C${mx},${a.y} ${b.x1 - 14},${b.y} ${b.x1 - 3},${b.y}"/>
        <path class="gdep-head" d="M${b.x1 - 3},${b.y} l-6,-4 v8 z"/>`;
    }
  });
  // 今日线：日视图钉在当前时刻（小时级），其余粒度钉在今天列的中心
  const todayX = scale === 'day' ? (tn - lo + nowFrac) * dayW : (tn - lo) * dayW + dayW / 2;

  $('proj-body').innerHTML = `
    <div class="gscalebar">
      <div class="gseg">
        ${Object.entries(GSCALES).map(([k, v]) =>
          `<button data-gs="${k}" class="${scale === k ? 'active' : ''}">${v.label}</button>`).join('')}
      </div>
      <button id="btn-autosched" class="mini">⚡ 自动排期</button>
      <span class="tmeta">视口=一个周期（日/周/月占满图表），左右滑动看更多 · 双击条子看详情</span>
    </div>
    <div class="gantt"${ui.glabelW ? ` style="grid-template-columns:${ui.glabelW}px 6px minmax(0,1fr)"` : ''}>
      <div class="glabels"><div class="glabels-head">工单</div>${labels}</div>
      <div class="gsplit" title="拖动调整工单栏宽度"></div>
      <div class="gchart">
        <svg width="${W}" height="${H + headH}">
          <g transform="translate(0,${headH})">
            ${rows.map((_, i) => i % 2 ? `<rect x="0" y="${i * rowH}" width="${W}" height="${rowH}" class="galt"/>` : '').join('')}
            ${shade}
            ${rows.map((_, i) => `<line x1="0" y1="${i * rowH}" x2="${W}" y2="${i * rowH}" class="grow"/>`).join('')}
            ${deps}${bars}
            <line x1="${todayX}" y1="-8" x2="${todayX}" y2="${H}" class="gtoday"/>
          </g>
          <rect x="0" y="0" width="${W}" height="${headH}" class="ghead-bg"/>
          <g>${head}</g>
        </svg>
      </div>
    </div>
    <p class="dim ganthint">拖动条=挪期，日视图按小时吸附、其余按天 · 拖两端=改起止 · 右键条子=取消排期 · 改动进暂存点保存 · 父单为子单包络（不可拖）</p>`;

  // 自动定位：首次/换粒度 → 今日线滚到图表视口正中央；
  // 同粒度重渲染（拖动/排期后）→ 保持原滚动位置
  const chart = $('proj-body').querySelector('.gchart');
  if (ui.gLastScale === scale && ui.gLastLo === lo && ui.gScroll != null) {
    chart.scrollLeft = ui.gScroll;
  } else {
    chart.scrollLeft = Math.max(0, Math.round(todayX - chart.clientWidth / 2));
  }
  chart.addEventListener('scroll', () => { ui.gScroll = chart.scrollLeft; });
  ui.gLastScale = scale; ui.gLastLo = lo; ui.gScroll = chart.scrollLeft;
  attachFloatScroll(chart); // 横向滑块悬浮在窗口底部

  // 分隔条拖动：调工单栏宽度，记忆在本机（localStorage）
  const gantt = $('proj-body').querySelector('.gantt');
  const gsplit = gantt.querySelector('.gsplit');
  gsplit.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gsplit.classList.add('dragging');
    const startX = e.clientX;
    const startW = gantt.querySelector('.glabels').getBoundingClientRect().width;
    const onMove = (ev) => {
      const w = Math.max(160, Math.min(640, Math.round(startW + ev.clientX - startX)));
      ui.glabelW = w;
      gantt.style.gridTemplateColumns = `${w}px 6px minmax(0,1fr)`;
    };
    const onUp = () => {
      gsplit.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (ui.glabelW) localStorage.setItem('hub.glabelW', String(ui.glabelW));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  // 自动排期：拿提案 → 全部进暂存（不落盘），甘特立刻预览，点保存才生效
  $('btn-autosched').addEventListener('click', async () => {
    const res = await fetch('/api/autoschedule', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: code }) });
    const data = await res.json();
    if (data.error) { alert('自动排期失败：' + data.error); return; }
    if (!data.proposals.length) { showToast('没有可排的工单（只排「草稿/就绪」叶子单）'); return; }
    for (const p of data.proposals) stageUpdate(p.id, { start: p.start, due: p.due });
    const s = data.summary;
    showToast(`自动排期：${s.count} 张进暂存 · 排到 ${s.to}（今日容量 ${s.todayCapacityHours}h，按额度折算）`);
    renderGantt(code);
  });

  $('proj-body').querySelectorAll('[data-gs]').forEach((el) =>
    el.addEventListener('click', () => { ui.gscale = el.dataset.gs; ui.gScroll = null; renderGantt(code); }));
  $('proj-body').querySelectorAll('.twist[data-tw]').forEach((el) =>
    el.addEventListener('click', () => {
      toggleCollapse(el.dataset.tw);
      renderGantt(code);
    }));

  // 「排到今天」：start=今天，due=今天+估时-1
  $('proj-body').querySelectorAll('.gsched').forEach((el) =>
    el.addEventListener('click', () => {
      const r = rows.find((x) => x.id === el.dataset.id);
      let len = 1;
      if (r && r.estimate) {
        const m = String(r.estimate).match(/^(\d+(?:\.\d+)?)([hd])$/);
        if (m) len = Math.max(1, Math.ceil(m[2] === 'h' ? parseFloat(m[1]) / 8 : parseFloat(m[1])));
      }
      stageUpdate(el.dataset.id, { start: today, due: n2d(tn + len - 1) });
      renderGantt(code);
    }));

  // 拖拽：过程 1:1 跟手（像素级），松手吸附——日视图吸附到小时，其余到天
  const snapUnit = scale === 'day' ? 1 / 24 : 1;
  const svg = $('proj-body').querySelector('svg');
  // 右键条子 = 直接取消排期（进暂存可放弃，不做二次确认）；空白处右键只拦默认菜单
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const g = e.target.closest && e.target.closest('.gbar');
    if (!g) return;
    stageUpdate(g.dataset.id, { start: null, due: null });
    showToast(`已取消 ${g.dataset.id} 的排期（暂存，点保存生效）`);
    renderGantt(code);
  });
  let drag = null;
  svg.querySelectorAll('.gbar').forEach((g) => {
    g.addEventListener('dblclick', () => { location.hash = '#/t/' + g.dataset.id; }); // 双击进详情
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // 只左键拖
      const kind = e.target.classList.contains('gh-l') ? 'start'
        : e.target.classList.contains('gh-r') ? 'due' : 'move';
      const main = g.querySelector('.gmain');
      drag = { id: g.dataset.id, kind, x0: e.clientX,
        s: parseFloat(g.dataset.s), e: parseFloat(g.dataset.e), g,
        px: parseFloat(main.getAttribute('x')), pw: parseFloat(main.getAttribute('width')) };
      g.classList.add('dragging');
      svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dxr = e.clientX - drag.x0; // 原始像素位移，不吸附
    const main = drag.g.querySelector('.gmain');
    if (drag.kind === 'move') {
      drag.g.setAttribute('transform', `translate(${dxr},0)`);
    } else if (drag.kind === 'start') {
      // 最小宽度=吸附单位（日视图 1 小时），不再被整天钳制
      const minW = dayW * snapUnit;
      const nx = Math.min(drag.px + dxr, drag.px + drag.pw - minW);
      main.setAttribute('x', nx); main.setAttribute('width', drag.px + drag.pw - nx);
      drag.g.querySelector('.gh-l').setAttribute('x', nx);
    } else {
      const nw = Math.max(drag.pw + dxr, dayW * snapUnit);
      main.setAttribute('width', nw);
      drag.g.querySelector('.gh-r').setAttribute('x', drag.px + nw - 7);
    }
    drag.dxr = dxr;
  });
  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    // 吸附：日视图 1/24 天（小时），其余整天
    const delta = Math.round((drag.dxr || 0) / (dayW * snapUnit)) * snapUnit;
    let s = drag.s; let en = drag.e; // en 为排他结束边界（浮点天）
    if (drag.kind === 'move') { s += delta; en += delta; }
    else if (drag.kind === 'start') s = Math.min(s + delta, en - snapUnit);
    else en = Math.max(en + delta, s + snapUnit);
    if (Math.abs(s - drag.s) > 1e-9 || Math.abs(en - drag.e) > 1e-9) {
      // 写回：整点边界 → date-only（截止=前一天整天）；带小数 → 精确时分
      const intish = (n) => Math.abs(n - Math.round(n)) < 1e-9;
      const due = intish(en) ? n2d(Math.round(en) - 1) : n2s(en);
      const start = intish(s) ? n2d(Math.round(s)) : n2s(s);
      stageUpdate(drag.id, { start, due });
    }
    drag = null;
    renderGantt(code); // 重渲染即回到吸附位置（含未变时的回弹）
  });
}

// ---- 视图：队列（第四视角：执行管线）----
async function queueOp(url, body, code) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.ok && (data.errors || data.error)) alert('操作被拒绝：' + (data.errors || [data.error]).join('；'));
  else showToast('已执行 ✓');
  await loadIndex(); renderQueue(code);
}
// 队列操作是即时保存（非暂存）：每次动作一条 journal
async function queueSave(changes, code) {
  const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
  const data = await res.json();
  if (!data.ok) alert('操作被拒绝：' + (data.errors || [data.error]).join('；'));
  else showToast('已执行 ✓');
  await loadIndex(); renderQueue(code);
}

// ---- 额度条：结构化渲染 + 跨渲染缓存（进队列页即时上屏，杜绝加载跳动）----
let QUOTA_HTML = null;
function quotaRowHtml(name, q) {
  if (!q || !q.available) {
    return `<div class="qq-row"><span class="qq-name">${esc(name)}</span><span class="qq-na">额度查询不可用</span></div>`;
  }
  const wins = (q.windows || []).map((w) =>
    `<span class="qq-win"><em>${esc(w.label)}</em><span class="qq-bar"><i class="${w.pct >= 80 ? 'hot' : ''}" style="width:${Math.min(100, Math.max(0, w.pct))}%"></i></span><b>${w.pct}%</b><em class="qq-reset">${esc(w.reset)} 重置</em></span>`).join('');
  return `<div class="qq-row"><span class="qq-name">${esc(name)}</span>${wins}${q.plan ? `<span class="qq-plan">${esc(q.plan)}</span>` : ''}</div>`;
}
function quotaSkeleton() {
  const row = (n) => `<div class="qq-row"><span class="qq-name">${n}</span><span class="qq-na">读取中…</span></div>`;
  return row('claude') + row('codex');
}

// ISO 时刻 → 本地 HH:mm（跨天带月-日）
function fmtHM(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  const t = new Date();
  const sameDay = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  return (sameDay ? '' : `${p(d.getMonth() + 1)}-${p(d.getDate())} `) + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function renderQueue(code) {
  const q = await (await fetch('/api/queue?project=' + encodeURIComponent(code))).json();
  if (q.error) { $('proj-body').innerHTML = `<p class="err">${esc(q.error)}</p>`; return; }
  const jr = await (await fetch('/api/journal')).json();
  const moves = (jr.lines || []).filter((l) => l.includes(code + '-')).slice(-8).reverse();

  const row = (t, extra, actions) => `
    <div class="qrow ${t.pinned ? 'qpinned' : ''}">
      ${t.pinned ? '<span class="qpin">📌置顶</span>' : ''}
      <span class="tid">${esc(t.id)} · ${esc(t.priority)}</span>
      ${t.autoDispatch && t.start ? `<span class="qauto">⏱ ${esc(t.start)}</span>` : (t.autoDispatch ? '<span class="qauto">⏱ 自动</span>' : '')}
      <a class="ttitle" href="#/t/${esc(t.id)}">${esc(t.title)}</a>
      ${extra || ''}
      <span class="qacts">${actions}</span>
    </div>`;

  const inflight = q.inFlight ? `
    <div class="qflight ${q.inFlight.stalled ? 'qstalled' : ''}">
      <span class="chip st-doing">进行中</span>
      <span class="tid">${esc(q.inFlight.id)}</span>
      <a class="ttitle" href="#/t/${esc(q.inFlight.id)}">${esc(q.inFlight.title)}</a>
      <span class="tmeta">在途 ${q.inFlight.hours}h${q.inFlight.stalled ? ' · <b class="err">滞留告警</b>' : ''}</span>
      <span class="qacts"><button class="mini2" data-act="recall" data-id="${esc(q.inFlight.id)}">收回</button></span>
    </div>` : '<p class="dim qempty">信箱空闲——队列有单会自动补位</p>';

  $('proj-body').innerHTML = `
    <div class="queue-layout">
      <div class="queue-main">
        <div class="qmaster">
          <button id="btn-master" class="${q.paused ? '' : 'primary'} small" title="总闸只暂停未开始的队列派发，正在处理的在途工单会继续执行到完成">${q.paused ? '▶ 恢复队列' : '⏸ 暂停队列（总闸）'}</button>
          <span class="tmeta">${q.paused ? '已暂停：未开始的队列不再派发 · 在途工单继续处理至完成' : '运行中 · 总闸只管未派发的队列，不中断在途 · 滞留超时自动拉闸'}</span>
          <div id="quota-chip" class="qquota">${QUOTA_HTML || quotaSkeleton()}</div>
        </div>
        ${q.quotaGated ? `<div class="qgate">⛔ <b>额度守门生效中</b>：${esc(q.quotaGateReason || 'codex 额度超过阈值')}<br>
          ${q.quotaGateResetAt ? `⏱ <b>预计 ${esc(fmtHM(q.quotaGateResetAt))} 自动放行</b>${q.queue.length ? `，届时派发队首 <b>${esc(q.queue[0].id)}</b> ${esc(q.queue[0].title)}` : '（队列为空，放行后无单可派）'}<br>` : ''}
          <span class="tmeta">监听器已按重置时刻定时放行（30 分钟心跳兜底），无需人工操作；急件可在工单详情页强制派发。</span></div>` : ''}
        <h3 class="qh">在途（信箱工位 · 仅一张）</h3>
        ${inflight}
        <h3 class="qh">待派队列（置顶 → 优先级 → 创建时间）${!q.quotaGated && !q.paused && q.inFlight && q.queue.length ? `<span class="tmeta"> · 在途回流后自动派发队首 ${esc(q.queue[0].id)}</span>` : ''}</h3>
        ${q.queue.length ? q.queue.map((t, i) => row(t, '', `
          <button class="mini2" data-act="pin" data-id="${esc(t.id)}" data-v="${t.pinned ? '' : '1'}">${t.pinned ? '取消置顶' : '↑置顶'}</button>
          <button class="mini2" data-act="hold" data-id="${esc(t.id)}">⏸搁置</button>
          <button class="mini2" data-act="unqueue" data-id="${esc(t.id)}">✕移出</button>`)).join('') : '<p class="dim qempty">队列为空——详情页勾「到期自动派发」或置顶即可进队</p>'}
        ${q.blocked.length ? `<h3 class="qh">派发受阻（条件齐了自动入队）</h3>` +
          q.blocked.map((t) => row(t, `<span class="tmeta err2">${esc(t.blockReason)}</span>`, '')).join('') : ''}
        ${q.held.length ? `<h3 class="qh">已搁置（退出队列）</h3>` +
          q.held.map((t) => row(t, '', `<button class="mini2" data-act="resume" data-id="${esc(t.id)}">▶恢复就绪</button>`)).join('') : ''}
      </div>
      <div class="queue-side">
        <h3 class="qh">实时活动（监听器日志）</h3>
        <div id="activity-box" class="actbox"><p class="dim">读取中…</p></div>
        <h3 class="qh">最近动向</h3>
        ${moves.length ? moves.map((l) => `<p class="qmove ${/滞留|不通过|失败|受阻/.test(l) ? 'err2' : ''}">${esc(l)}</p>`).join('') : '<p class="dim">（暂无本项目相关记录）</p>'}
      </div>
    </div>`;

  // 实时活动：驻留本页时 5s 轻轮询（本地文件读取，切走即停）
  async function refreshActivity() {
    const box = $('activity-box');
    if (!box) { clearInterval(ui.actTimer); return; }
    try {
      const a = await (await fetch('/api/activity?project=' + encodeURIComponent(code))).json();
      if (!box.isConnected) return;
      const head = a.running
        ? `<p class="actlive">⚙ Codex 正在执行 <b>${esc(a.inFlight || '')}</b><span class="actdots">…</span></p>`
        : (a.reviewing ? `<p class="actlive">🔎 Claude 评审中<span class="actdots">…</span></p>`
          : (a.inFlight ? `<p class="actlive">📮 ${esc(a.inFlight)} 在途（等待监听器/Codex 响应）</p>`
            : '<p class="dim">空闲——没有在途执行</p>'));
      const logs = a.watcherLogExists
        ? (a.watcherLog.length ? a.watcherLog.slice(-8).reverse().map((l) =>
            `<p class="qmove ${/FAIL/.test(l) ? 'err2' : ''}">${esc(l)}</p>`).join('') : '<p class="dim">（日志为空）</p>')
        : '<p class="dim">（监听器尚未启用：项目 tools/ 下无日志）</p>';
      box.innerHTML = head + logs;
    } catch { /* 静默，下轮再试 */ }
  }
  clearInterval(ui.actTimer);
  refreshActivity();
  ui.actTimer = setInterval(refreshActivity, 5000);

  // 额度条：驻留本页时 30s 轮询（服务端 60s 缓存）；只有内容真变了才原位替换，
  // 配合进度条 width 过渡动画，刷新表现为平滑滑动而非跳动
  async function refreshQuota() {
    const el = $('quota-chip');
    if (!el || !el.isConnected) { clearInterval(ui.quotaTimer); return; }
    try {
      const d = await (await fetch('/api/quota')).json();
      if (!el.isConnected) return;
      const html = quotaRowHtml('claude', d.claude) + quotaRowHtml('codex', d.codex);
      if (html !== QUOTA_HTML) {
        QUOTA_HTML = html;
        el.innerHTML = html;
      }
    } catch { /* 额度条缺席不影响队列，下轮再试 */ }
  }
  clearInterval(ui.quotaTimer);
  refreshQuota();
  ui.quotaTimer = setInterval(refreshQuota, 30000);

  $('btn-master').addEventListener('click', () => queueOp('/api/queue/pause', { project: code, paused: !q.paused }, code));
  $('proj-body').querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.id;
    const act = el.dataset.act;
    if (act === 'recall') { if (confirm(`收回 ${id}？信箱将重置为占位，工单回「就绪」。`)) queueOp('/api/recall', { id }, code); }
    else if (act === 'pin') queueSave([{ type: 'update', id, fields: { pinned: el.dataset.v ? true : null } }], code);
    else if (act === 'hold') queueSave([{ type: 'update', id, fields: { status: '搁置' } }], code);
    else if (act === 'resume') queueSave([{ type: 'update', id, fields: { status: '就绪' } }], code);
    else if (act === 'unqueue') queueSave([{ type: 'update', id, fields: { auto_dispatch: null, pinned: null } }], code);
  }));
}

// ---- 视图：新建工单 ----
function renderNew(code, parent) {
  setHeader('新建工单', `<a href="#/">项目</a> / <a href="#/p/${esc(code)}">${esc(code)}</a> / 新建工单`);
  $('view').innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="detail-form modal">
      <h2>新建工单</h2>
      <label>标题 <input id="f-title" /></label>
      <label>挂在哪里（逐级选择；不选 = 顶层总单）<div id="fn-parent-cascade" class="cascade"></div></label>
      <div class="row">
        <label>状态 <select id="f-status"><option>草稿</option><option>就绪</option></select></label>
        <label>优先级 <select id="f-priority"><option>P0</option><option>P1</option><option selected>P2</option><option>P3</option></select></label>
        <label>估时 <input id="f-estimate" placeholder="如 3d / 4h" /></label>
        <label>里程碑 <input id="f-milestone" placeholder="如 M1-xxx" /></label>
      </div>
      <div class="row">
        <label>开始 <input id="f-start" type="date" /></label>
        <label>截止 <input id="f-due" type="date" /></label>
        <label>执行者 <select id="f-assignee"><option value="">未定</option><option>codex</option><option>claude</option><option>human</option></select></label>
      </div>
      <label>正文（四段式：范围/不要做/接口契约/验收标准）<textarea id="f-body" rows="10" placeholder="## 范围（只做这些）&#10;&#10;## 不要做&#10;&#10;## 接口契约&#10;&#10;## 验收标准"></textarea></label>
      <label class="chk"><input type="checkbox" id="f-newauto" /> 到期自动派发（就绪 + 依赖完成 + start 到达时自动进队）</label>
      <div class="actions"><button id="btn-stage-new" class="primary">加入暂存</button>
      <a href="#/p/${esc(code)}"><button>取消</button></a>
      <span class="tmeta">加入暂存后编号按层级在「保存」时分配</span></div>
    </div>`;
  const getParentNew = setupCascade('fn-parent-cascade', code, parent || null, null);
  $('btn-stage-new').addEventListener('click', () => {
    const fields = {
      title: $('f-title').value.trim(), status: $('f-status').value,
      priority: $('f-priority').value, estimate: $('f-estimate').value.trim() || null,
      milestone: $('f-milestone').value.trim() || null,
      start: $('f-start').value || null, due: $('f-due').value || null,
      assignee: $('f-assignee').value || null,
      auto_dispatch: $('f-newauto').checked ? true : null,
    };
    if (!fields.title) { alert('标题必填'); return; }
    staged.creates.push({ project: code, parent: getParentNew() || undefined, fields, body: $('f-body').value });
    renderSaveBar();
    location.hash = `#/p/${code}`;
  });
}

// ---- 视图：工单详情 ----
const LIFE = ['草稿', '就绪', '进行中', '待评审', '待验收', '完成'];

// ---- 级联父单选择器：按层级逐级下钻（总单→系统单→功能单），替代平铺下拉 ----
function setupCascade(elId, code, currentParent, excludeId) {
  const box = $(elId);
  const all = INDEX.tickets.filter((t) => t.project === code);
  // 排除自己与全部子孙（防环）
  const excluded = new Set();
  if (excludeId) {
    (function mark(id) {
      excluded.add(id);
      const t = all.find((x) => x.id === id);
      if (t) t.childIds.forEach(mark);
    })(excludeId);
  }
  const kidsOf = (pid) => all.filter((t) => (t.parent || null) === pid && !excluded.has(t.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  // 当前父链路径
  let pathIds = [];
  if (currentParent) {
    let cur = currentParent;
    while (cur) { pathIds.unshift(cur); const t = all.find((x) => x.id === cur); cur = t ? t.parent : null; }
  }
  function render() {
    box.dataset.parent = pathIds[pathIds.length - 1] || '';
    let html = '';
    let pid = null;
    for (let lvl = 0; lvl <= pathIds.length && lvl < 3; lvl++) {
      const opts = kidsOf(pid);
      if (!opts.length) break;
      const chosen = pathIds[lvl] || '';
      html += `<select data-lvl="${lvl}">
        <option value="">${lvl === 0 ? '（顶层，作为总单）' : '（就挂在上一级）'}</option>
        ${opts.map((o) => `<option value="${esc(o.id)}" ${o.id === chosen ? 'selected' : ''}>${esc(o.id)} ${esc(o.title)}</option>`).join('')}
      </select>`;
      if (!chosen) break;
      pid = chosen;
    }
    box.innerHTML = html;
    box.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => {
      const lvl = parseInt(sel.dataset.lvl, 10);
      pathIds = pathIds.slice(0, lvl);
      if (sel.value) pathIds.push(sel.value);
      render();
    }));
  }
  render();
  return () => box.dataset.parent || null;
}

function lifeStepper(t) {
  const cur = LIFE.indexOf(t.status);
  const side = cur < 0; // 搁置/废弃
  const steps = LIFE.map((s, i) => {
    const cls = side ? 'lf-future' : (i < cur ? 'lf-done' : (i === cur ? 'lf-cur' : 'lf-future'));
    return `<div class="lf-step ${cls}"><span class="lf-dot"></span><span class="lf-name">${s}</span></div>`;
  }).join('<span class="lf-line"></span>');
  return `<div class="lifebar">${steps}${side ? `<span class="lf-side">当前：${esc(t.status)}（侧向出口，恢复后回到主线）</span>` : ''}</div>`;
}

async function renderDetail(id) {
  const res = await fetch('/api/ticket?id=' + encodeURIComponent(id));
  if (!res.ok) { $('view').innerHTML = '<p class="dim">工单不存在</p>'; return; }
  const t0 = await res.json();
  const t = eff(t0);
  const jr = await (await fetch('/api/journal')).json();
  const timeline = (jr.lines || []).filter((l) => l.includes(id)).slice(-10).reverse();
  if (!location.hash.includes(id)) return; // 用户已切走，丢弃迟到渲染
  const u = staged.updates.get(id);
  const body = u && u.body !== undefined ? u.body : t0.body;
  const projName = (INDEX.projects.find((x) => x.code === t.project) || {}).name || t.project;
  setHeader(`${id} ${t.title}`, `<a href="#/">项目</a> / <a href="#/p/${esc(t.project)}">${esc(projName)}</a> / 工单详情`);
  const stOpts = ['草稿', '就绪', '进行中', '待评审', '待验收', '完成', '搁置', '废弃']
    .map((s) => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('');
  $('view').innerHTML = `
    <div class="dhead">
      <a class="backpill" href="#/p/${esc(t.project)}">← 返回</a>
      <div><h2>${esc(id)} <span class="chip ${ST_CLS[t.status] || ''}">${esc(t.status)}</span>
      ${t.overdue ? '<span class="badge-over">逾期</span>' : ''}</h2>
      <span class="tmeta">进度 ${t.progress}% · ${esc(t.levelName || '第' + t.depth + '层')}${t.isLeaf ? '' : '（状态由子单推导）'}</span></div>
    </div>
    ${lifeStepper(t)}
    ${t.status === '待验收' ? `<div class="acceptbar">
      <span>这张单在等你验收——流水线上唯一必须人做的一步。</span>
      <button id="btn-accept" class="primary">✓ 验收通过 → 完成</button>
      <button id="btn-reject">✗ 不通过，打回评审</button>
    </div>` : ''}
    ${!t.isLeaf && pendingAcceptDescendants(id).length ? `<div class="acceptbar">
      <span>子单里还有 ${pendingAcceptDescendants(id).length} 张在等验收。</span>
      <button id="btn-accept-all" class="primary">✓ 一键验收全部子单</button>
    </div>` : ''}
    ${(t.errors || []).length ? `<p class="errbox">${esc(t.errors.join('；'))}</p>` : ''}
    <div class="detail-grid">
    <div class="detail-form">
      <label>标题 <input id="f-title" value="${esc(t.title)}" /></label>
      <div class="row">
        <label>状态 <select id="f-status" ${!t.isLeaf && !t.statusManual ? 'disabled title="父单状态自动推导；勾选手动接管后可改"' : ''}>${stOpts}</select></label>
        <label class="chk"><input type="checkbox" id="f-manual" ${t.statusManual ? 'checked' : ''} ${t.isLeaf ? 'disabled' : ''}/> 手动接管状态</label>
        <label>优先级 <select id="f-priority">${['P0', 'P1', 'P2', 'P3'].map((p) => `<option ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      </div>
      <div class="row">
        <label>父单（逐级选择）<div id="f-parent-cascade" class="cascade"></div></label>
        <label>依赖（逗号分隔 ID）<input id="f-deps" value="${esc((t.dependsOn || []).join(', '))}" /></label>
      </div>
      ${(() => {
        const fwd = (t.dependsOn || []).map((d) => {
          const x = INDEX.tickets.find((k) => k.id === d);
          return `<a class="depchip ${x && x.status === '完成' ? 'done' : ''}" href="#/t/${esc(d)}">→ 依赖 ${esc(d)}${x ? ' ' + esc(x.title) : '（不存在）'}${x && x.status === '完成' ? ' ✓' : x ? `（${esc(x.status)}）` : ''}</a>`;
        });
        const rev = INDEX.tickets.filter((x) => x.project === t.project && (x.dependsOn || []).includes(id))
          .map((x) => `<a class="depchip rev" href="#/t/${esc(x.id)}">← 被 ${esc(x.id)} ${esc(x.title)} 依赖</a>`);
        return fwd.length || rev.length ? `<div class="deplinks">${fwd.join('')}${rev.join('')}</div>` : '';
      })()}
      <div class="row">
        <label>里程碑 <input id="f-milestone" value="${esc(t.milestone || '')}" /></label>
        <label>估时 <input id="f-estimate" value="${esc(t.estimate || '')}" /></label>
        <label>开始 <input id="f-start" type="date" value="${esc(t.start || '')}" /></label>
        <label>截止 <input id="f-due" type="date" value="${esc(t.due || '')}" /></label>
        <label>执行者 <select id="f-assignee">${['', 'codex', 'claude', 'human'].map((a) => `<option value="${a}" ${String(t.assignee || '') === a ? 'selected' : ''}>${a || '未定'}</option>`).join('')}</select></label>
      </div>
      <div class="row">
        <label class="chk"><input type="checkbox" id="f-auto" ${t.autoDispatch ? 'checked' : ''} ${t.isLeaf ? '' : 'disabled'}/> 到期自动派发（就绪 + 依赖完成 + start 到达时进入派发队列）</label>
        ${t.fixes ? `<span class="tmeta">修复对象 ← <a href="#/t/${esc(t.fixes)}">${esc(t.fixes)}</a></span>` : ''}
      </div>
      <label>正文 <textarea id="f-body" rows="16">${esc(body)}</textarea></label>
      <div id="preview" class="doc" hidden>${t0.html}</div>
    </div>
    <aside class="detail-side">
      <div class="sidecard"><h3>操作</h3>
        <div class="oprow">
          <button id="btn-stage" class="primary">暂存修改</button>
          <button id="btn-preview">预览正文</button>
        </div>
        ${t.isLeaf ? `<button id="btn-dispatch" class="dispatch wide">派发 → ${esc(t.project)} 信箱</button>` : '<p class="tmeta">父单不可派发（管理容器）</p>'}
        <div id="dispatch-msg"></div>
      </div>
      <div class="sidecard"><h3>完成与评审</h3>
        <p class="tmeta">完成情况：${(t0.reports || []).length ? `已回流 ${t0.reports.length} 份报告` : '（尚无报告）'}</p>
        <label class="chk">评审结论
          <select id="f-review">
            <option value="" ${!t.review ? 'selected' : ''}>（未评审）</option>
            <option value="通过" ${t.review === '通过' ? 'selected' : ''}>通过</option>
            <option value="不通过" ${t.review === '不通过' ? 'selected' : ''}>不通过</option>
          </select>
        </label>
        ${t.review === '不通过' ? '<p class="err2">评审不通过——等待返工单闭环</p>' : ''}
        ${(t0.reports || []).map((f) => `<button class="rep-link" data-file="${esc(f)}">${esc(f)}</button>`).join('')}
        <div id="report-view" class="doc" hidden></div>
      </div>
      ${timeline.length ? `<div class="sidecard"><h3>事件时间线</h3>
        ${timeline.map((l) => `<p class="qmove ${/滞留|不通过|失败|收回/.test(l) ? 'err2' : ''}">${esc(l)}</p>`).join('')}
      </div>` : ''}
      <div class="sidecard danger-zone"><h3>危险区</h3>
        <button id="btn-discard-ticket" class="wide">废弃（软删，保留痕迹）</button>
        ${t.status === '草稿' && t.isLeaf ? '<button id="btn-delete-ticket" class="danger wide">删除（草稿专属，物理删除）</button>' : '<p class="tmeta">物理删除仅限无子单的草稿；已流转的用废弃</p>'}
      </div>
    </aside>
    </div>`;
  const getParent = setupCascade('f-parent-cascade', t.project, t.parent, id);
  $('btn-stage').addEventListener('click', () => {
    const fields = {
      title: $('f-title').value.trim(),
      priority: $('f-priority').value,
      parent: getParent(),
      depends_on: $('f-deps').value.split(',').map((s) => s.trim()).filter(Boolean),
      milestone: $('f-milestone').value.trim() || null,
      estimate: $('f-estimate').value.trim() || null,
      start: $('f-start').value || null,
      due: $('f-due').value || null,
      assignee: $('f-assignee').value || null,
      status_manual: $('f-manual').checked || null,
      auto_dispatch: $('f-auto') && $('f-auto').checked ? true : null,
      review: $('f-review') && $('f-review').value ? $('f-review').value : null,
    };
    if (!$('f-status').disabled) fields.status = $('f-status').value;
    const newBody = $('f-body').value;
    stageUpdate(id, fields, newBody !== t0.body ? newBody : undefined);
    location.hash = `#/p/${t.project}`;
  });
  $('btn-preview').addEventListener('click', () => { $('preview').hidden = !$('preview').hidden; });
  const bd = $('btn-dispatch');
  if (bd) bd.addEventListener('click', async () => {
    if (stagedCount()) { $('dispatch-msg').innerHTML = '<p class="errbox">有未保存变更，先保存或放弃后再派发（派发的是磁盘上的定稿）。</p>'; return; }
    if (!confirm(`确认把 ${id} 派发到 ${t.project} 项目信箱？将覆写 to_codex.md 并把状态置为「进行中」。`)) return;
    const post = (body) => fetch('/api/dispatch', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    let data = await post({ id });
    // 额度守门拦下时给一次「强派」机会（人工决策可越过自动阈值）
    if (!data.ok && data.quotaGate) {
      if (!confirm(`额度守门拦截：${(data.errors || []).join('；')}\n\n仍要强制派发吗？`)) return;
      data = await post({ id, force: true });
    }
    if (data.ok) { showToast('已派发 → 项目信箱 ✓'); await loadIndex(); renderDetail(id); }
    else $('dispatch-msg').innerHTML = `<p class="errbox">派发被拒绝：${esc((data.errors || [data.error]).join('；'))}</p>`;
  });
  document.querySelectorAll('.rep-link').forEach((el) =>
    el.addEventListener('click', async () => {
      const res = await fetch(`/api/report?id=${encodeURIComponent(id)}&file=${encodeURIComponent(el.dataset.file)}`);
      const data = await res.json();
      const v = $('report-view');
      v.innerHTML = data.html || `<p class="err">${esc(data.error || '读取失败')}</p>`;
      v.hidden = false;
    }));
  const baccAll = $('btn-accept-all');
  if (baccAll) baccAll.addEventListener('click', async () => {
    const ids = pendingAcceptDescendants(id);
    if (!ids.length) return;
    if (!confirm(`一键验收 ${id} 下全部 ${ids.length} 张待验收子单？\n${ids.join('、')}\n状态全部置「完成」。`)) return;
    const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: ids.map((tid) => ({ type: 'update', id: tid, fields: { status: '完成' } })) }) });
    const data = await res.json();
    if (!data.ok) alert('批量验收失败：' + (data.errors || [data.error]).join('；'));
    else showToast(`已验收 ${ids.length} 张子单 ✓`);
    await loadIndex(); renderDetail(id);
  });
  const bacc = $('btn-accept');
  if (bacc) bacc.addEventListener('click', async () => {
    await queueSave([{ type: 'update', id, fields: { status: '完成' } }], t.project);
    location.hash = '#/p/' + t.project;
  });
  const brej = $('btn-reject');
  if (brej) brej.addEventListener('click', async () => {
    if (!confirm(`打回 ${id}？状态回「待评审」并记评审不通过，等修复闭环。`)) return;
    await queueSave([{ type: 'update', id, fields: { status: '待评审', review: '不通过' } }], t.project);
    renderDetail(id);
  });
  $('btn-discard-ticket').addEventListener('click', async () => {
    if (!confirm(`废弃 ${id}？状态置为「废弃」，不参与任何统计，文件保留。`)) return;
    await queueSave([{ type: 'update', id, fields: { status: '废弃' } }], t.project);
    location.hash = '#/p/' + t.project;
  });
  const bdel = $('btn-delete-ticket');
  if (bdel) bdel.addEventListener('click', async () => {
    if (!confirm(`物理删除草稿 ${id}？文件将被移除（journal 会留一条记录）。`)) return;
    const r = await (await fetch('/api/ticket/delete', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
    if (!r.ok) { alert(r.error || '删除失败'); return; }
    await loadIndex();
    location.hash = '#/p/' + t.project;
  });
}

// ---- 视图：文档阅读器（只读说明书）----
async function renderDocs(sel) {
  setHeader('文档', '<a href="#/">项目</a> / 文档 · 系统说明书（只读）');
  const { docs } = await (await fetch('/api/docs')).json();
  if (!location.hash.startsWith('#/docs')) return; // 迟到渲染丢弃
  const groups = {};
  for (const d of docs) (groups[d.group] = groups[d.group] || []).push(d);
  const nav = Object.entries(groups).map(([g, list]) => `
    <div class="doc-group"><h4>${esc(g)}</h4>
      ${list.map((d) => `<button class="doc-item ${d.i === sel ? 'active' : ''}" data-i="${d.i}" ${d.exists ? '' : 'disabled title="文件不存在"'}>${esc(d.title)}</button>`).join('')}
    </div>`).join('');
  $('view').innerHTML = `
    <div class="docs-layout">
      <aside class="docs-nav">${nav}</aside>
      <div class="docs-body" id="docs-body"><p class="dim">← 选择一篇文档</p></div>
    </div>`;
  $('view').querySelectorAll('.doc-item:not([disabled])').forEach((el) =>
    el.addEventListener('click', () => { location.hash = '#/docs/' + el.dataset.i; }));
  if (sel != null && !Number.isNaN(sel)) {
    const data = await (await fetch('/api/doc?i=' + sel)).json();
    if (data.error) { $('docs-body').innerHTML = `<p class="err">${esc(data.error)}</p>`; return; }
    $('docs-body').innerHTML = `
      <div class="doc-head"><div>
        <h2>${esc(data.title)}</h2>
        <p class="tmeta">${esc(data.path)} · 修改 ${esc(data.mtime)} · 只读</p></div>
        <button id="btn-copydoc" class="primary small">复制原文（喂 AI 用）</button>
      </div><hr class="doc-hr"/>
      <div class="doc">${data.html}</div>`;
    $('btn-copydoc').addEventListener('click', async () => {
      await copyText(data.raw);
      $('btn-copydoc').textContent = '已复制 ✓';
      setTimeout(() => { $('btn-copydoc').textContent = '复制原文（喂 AI 用）'; }, 1500);
    });
  }
}

// ---- 全局搜索（顶栏）----
function initSearch() {
  const inp = $('gsearch-input');
  const box = $('gsearch-results');
  inp.addEventListener('input', () => {
    const kw = inp.value.trim().toLowerCase();
    if (!kw || !INDEX) { box.hidden = true; return; }
    const hits = INDEX.tickets.filter((t) =>
      `${t.id} ${t.title} ${t.milestone || ''}`.toLowerCase().includes(kw)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map((t) =>
      `<a href="#/t/${esc(t.id)}"><span class="chip ${ST_CLS[t.status] || ''}">${esc(t.status)}</span>
       <span class="tid">${esc(t.id)}</span> ${esc(t.title)}</a>`).join('')
      : '<p class="dim">无匹配工单</p>';
    box.hidden = false;
  });
  inp.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 200));
  box.addEventListener('click', () => { box.hidden = true; inp.value = ''; });
}

// ---- 视图：设置 ----
async function renderSettings() {
  setHeader('设置', '<a href="#/">项目</a> / 设置');
  const [g, env] = await Promise.all([
    (await fetch('/api/git-status')).json(),
    (await fetch('/api/env')).json().catch(() => null),
  ]);
  if (!location.hash.startsWith('#/settings')) return; // 用户已切走，丢弃迟到渲染
  const light = (c) => c && c.ok
    ? `<span style="color:#16a34a">●</span>`
    : `<span class="err2">●</span>`;
  const envRow = (label, c, fixBtn) => `
    <p class="qmove">${light(c)} ${label}
      <span class="tmeta">${esc((c && c.detail) || '探测失败')}</span>
      ${fixBtn && !(c && c.ok) ? fixBtn : ''}</p>`;
  const envHtml = env ? `
    ${envRow('git', env.git)}
    ${envRow('node', env.node)}
    ${envRow('codex CLI', env.codex)}
    ${envRow('codex 登录', env.codexLogin, '<button class="mini2 env-login" data-tool="codex">打开登录窗口</button>')}
    ${envRow('claude CLI', env.claude)}
    ${envRow('claude 登录', env.claudeLogin, '<button class="mini2 env-login" data-tool="claude">打开登录窗口</button>')}
    ${envRow('网络代理', env.proxy)}
    ${env.projects.map((p) => `
      <p class="qmove">${light({ ok: p.watcher.running })} 监听器 ${esc(p.code)}
        <span class="tmeta">${p.watcher.running ? 'PID ' + p.watcher.pid : (p.repoOk ? (p.mailboxOk ? '未运行' : '信箱协议缺失') : '仓库路径不存在')}</span>
        ${p.repoOk ? `<button class="mini2 w-toggle" data-code="${esc(p.code)}" data-act="${p.watcher.running ? 'stop' : 'start'}">${p.watcher.running ? '停止' : '启动'}</button>` : ''}</p>`).join('')}
    <div class="actions" style="margin:8px 0"><button id="env-refresh" class="mini2">重新检测</button><span id="env-msg" class="tmeta"></span></div>`
    : '<p class="dim">环境探测失败</p>';
  const projRows = INDEX.projects.map((p) => `
    <div class="qrow">
      <span class="pdot" style="background:${esc(p.color)}"></span>
      <b>${esc(p.code)}</b><span>${esc(p.name)}</span>
      <span class="tmeta">${esc(p.repo)}</span>
      <span class="qacts"><button class="mini2 proj-edit" data-code="${esc(p.code)}">编辑</button></span>
    </div>`).join('');
  $('view').innerHTML = `
    <div class="queue-layout">
      <div class="queue-main">
        <h3 class="qh">受管项目（保存即写配置 + 建信箱脚手架 + 拉起监听器）</h3>
        ${projRows}
        <div class="detail-form" style="margin-top:16px">
          <h2 id="pf-title">添加项目</h2>
          <div class="row">
            <label>代号（2-6位大写）<input id="pf-code" placeholder="XX" /></label>
            <label>名称 <input id="pf-name" placeholder="下一个游戏" /></label>
            <label>颜色 <input id="pf-color" type="color" value="#4F46E5" /></label>
          </div>
          <label>仓库路径 <input id="pf-repo" placeholder="D:/GitHub/XX" /></label>
          <div class="row">
            <label>工单信箱（相对仓库根）<input id="pf-mailbox" value="collab/to_codex.md" /></label>
            <label>报告信箱 <input id="pf-report" value="collab/from_codex.md" /></label>
          </div>
          <div class="actions"><button id="pf-save" class="primary">保存项目</button><span id="pf-msg" class="tmeta"></span></div>
        </div>
      </div>
      <div class="queue-side">
        <h3 class="qh">环境自检与监听器（服务启动时自动拉起监听器）</h3>
        ${envHtml}
        <h3 class="qh">Git 与远程（全部人工触发）</h3>
        ${g.available ? `
          <p class="qmove">分支 ${esc(g.branch)} · 未提交 ${g.dirty} · 领先 ${g.ahead} / 落后 ${g.behind}</p>
          <p class="qmove">${esc(g.remote || '（未配置远端）')}</p>
          <div class="actions" style="margin:12px 0">
            <button id="btn-pull" class="primary small">拉取（ff-only）</button>
            <button id="btn-push" class="small">提交并推送</button>
          </div>
          <p id="git-msg" class="qmove"></p>
          <p class="tmeta">拉取失败（冲突/分叉）不自动解决，请到终端处理</p>` : '<p class="dim">未检测到 git 仓库</p>'}
        <h3 class="qh">偏好（改配置文件生效，端口改动需重启）</h3>
        <p class="qmove">端口 4180 · 滞留阈值 48h · 深度上限 4 层</p>
        <p class="tmeta">直接编辑 hub.config.json 与此页等效（.md/.json 是唯一事实源）</p>
      </div>
    </div>`;
  document.querySelectorAll('.proj-edit').forEach((el) => el.addEventListener('click', () => {
    const p = INDEX.projects.find((x) => x.code === el.dataset.code);
    $('pf-title').textContent = '编辑项目 ' + p.code;
    $('pf-code').value = p.code; $('pf-code').disabled = true;
    $('pf-name').value = p.name; $('pf-repo').value = p.repo;
    $('pf-mailbox').value = p.mailbox; $('pf-report').value = p.report; $('pf-color').value = p.color;
  }));
  $('pf-save').addEventListener('click', async () => {
    const body = { code: $('pf-code').value.trim(), name: $('pf-name').value.trim(),
      repo: $('pf-repo').value.trim(), mailbox: $('pf-mailbox').value.trim(),
      report: $('pf-report').value.trim(), color: $('pf-color').value };
    const r = await (await fetch('/api/config/project', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    $('pf-msg').textContent = r.ok
      ? ('已保存 ✓ 信箱脚手架就绪，监听器' + (r.watcher && r.watcher.ok ? (r.watcher.already ? '已在运行' : '已拉起') : '拉起失败') + (r.restartNeeded ? '（回流监听重启后生效）' : ''))
      : (r.error || '失败');
    if (r.ok) { await loadIndex(); renderSettings(); }
  });
  document.querySelectorAll('.env-login').forEach((el) => el.addEventListener('click', async () => {
    const r = await (await fetch('/api/env/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: el.dataset.tool }) })).json();
    $('env-msg').textContent = r.message || '';
  }));
  document.querySelectorAll('.w-toggle').forEach((el) => el.addEventListener('click', async () => {
    const r = await (await fetch('/api/watcher/' + el.dataset.act, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: el.dataset.code }) })).json();
    $('env-msg').textContent = r.message || r.error || '';
    setTimeout(renderSettings, 800); // 启停后回读真实状态
  }));
  const er = $('env-refresh');
  if (er) er.addEventListener('click', () => renderSettings());
  const bp = $('btn-pull'); const bpu = $('btn-push');
  if (bp) bp.addEventListener('click', async () => {
    const r = await (await fetch('/api/git/pull', { method: 'POST' })).json();
    $('git-msg').innerHTML = r.ok ? '✓ ' + esc(r.message) : `<span class="err2">${esc(r.message)}</span>`;
  });
  if (bpu) bpu.addEventListener('click', async () => {
    if (!confirm('提交全部变更并推送到远端？')) return;
    const r = await (await fetch('/api/git/push', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    $('git-msg').innerHTML = r.ok ? '✓ ' + esc(r.message) : `<span class="err2">${esc(r.message)}</span>`;
  });
}

// ---- 路由 ----
async function route() {
  if (!INDEX) await loadIndex(); else await loadIndex();
  const h = location.hash;
  let m;
  if (!/^#\/(docs|settings)/.test(h)) ui.returnHash = h || '#/'; // 供 📖/⚙ 再点返回
  attachFloatScroll(null); // 切视图清理悬浮滑块（看板/甘特渲染时自行挂回）
  clearInterval(ui.actTimer); // 停掉活动面板轮询（队列页渲染时自行重启）
  clearInterval(ui.quotaTimer); // 停掉额度徽章轮询（同上）
  if ((m = h.match(/^#\/p\/([A-Z0-9]+)/))) renderProject(m[1]);
  else if ((m = h.match(/^#\/t\/([A-Z0-9]+(?:-\d{2}){1,4})/))) renderDetail(m[1]);
  else if ((m = h.match(/^#\/new\/([A-Z0-9]+)(?:\?parent=([A-Z0-9]+(?:-\d{2}){1,4}))?/))) renderNew(m[1], m[2]);
  else if ((m = h.match(/^#\/docs(?:\/(\d+))?/))) renderDocs(m[1] != null ? parseInt(m[1], 10) : null);
  else if (h.startsWith('#/settings')) renderSettings();
  else renderOverview();
  renderSaveBar(); // 路由切换后同步保存条，避免残留旧状态
  window.scrollTo(0, 0);
}

$('btn-save').addEventListener('click', saveStaged);
$('btn-discard').addEventListener('click', () => { if (confirm('放弃全部未保存变更？')) discardStaged(); });
// 📖 文档 / ⚙ 设置：点一次进入，再点一次回到来处
ui.returnHash = '#/';
document.querySelectorAll('a[href="#/docs"], a[href="#/settings"]').forEach((a) => {
  const target = a.getAttribute('href');
  a.addEventListener('click', (e) => {
    if (location.hash.startsWith(target)) { e.preventDefault(); location.hash = ui.returnHash; }
  });
});
window.addEventListener('hashchange', route);
// 三层刷新：手动按钮 / 窗口聚焦（节流 5s）/ 队列与保存操作后（各自内置）
// 自动刷新：3s 轮询变更令牌，数据动了才静默重渲染；替代手动刷新按钮。
// 安全护栏：详情/新建页不打扰、有暂存不打扰、正在输入或拖拽不打扰。
let lastPulse = null;
setInterval(async () => {
  try {
    const d = await (await fetch('/api/pulse')).json();
    if (!d.token) return;
    if (lastPulse === null) { lastPulse = d.token; return; }
    if (d.token === lastPulse) return;
    lastPulse = d.token;
    if (/^#\/(t|new)\//.test(location.hash)) return;
    if (stagedCount() > 0) return;
    const ae = document.activeElement;
    if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    if (document.querySelector('.dragging')) return;
    route();
  } catch { /* 服务瞬断则下轮再试 */ }
}, 3000);
let lastFocusRefresh = 0;
window.addEventListener('focus', () => {
  if (Date.now() - lastFocusRefresh > 5000 && !stagedCount()) { lastFocusRefresh = Date.now(); route(); }
});
// 注：不再用 beforeunload 拦截关闭——在 Electron 里 preventDefault 会让窗口彻底关不掉。
// 未保存提示交给顶部保存条，关窗即退出。
initSearch();
route();
