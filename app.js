// app.js — x-compass 主逻辑
// 6 个 Tab 切换 / 日期选择 / 加载协调 / 错误降级 / 渲染

import { parseSelectionReport } from './parsers/selection.js';
import { parseReviewReport } from './parsers/review.js';
import { parseDeepDiveReport } from './parsers/deepdive.js';
import { loadPremarketReport } from './parsers/premarket.js';
import { loadAuctionReport } from './parsers/auction.js';
import { loadIntradayReport, loadCloseReport } from './parsers/intraday.js';
import { esc } from './parsers/common.js';

const TABS = [
  { id: 'selection', label: '🟢 选股', icon: '🟢', loader: parseSelectionReport, fileKey: 'selection' },
  { id: 'review', label: '📊 复盘', icon: '📊', loader: parseReviewReport, fileKey: 'review' },
  { id: 'deepdive', label: '🔬 深度', icon: '🔬', loader: parseDeepDiveReport, fileKey: 'deepdive' },
  { id: 'premarket', label: '🌅 盘前', icon: '🌅', loader: loadPremarketReport, fileKey: 'premarket' },
  { id: 'auction', label: '⚡ 竞价', icon: '⚡', loader: loadAuctionReport, fileKey: 'auction' },
  { id: 'intraday', label: '📈 盘中', icon: '📈', loader: loadIntradayReport, fileKey: 'intraday' },
];

const STATE = {
  currentDate: '',
  loaded: {},          // { tabId: data | null | { _error: msg } }
  activeTab: 'selection',
};

// ========== 工具函数 ==========
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dirClass(d) { return d === 'up' ? 'up' : d === 'down' ? 'down' : 'flat'; }
function dirSymbol(d) { return d === 'up' ? '🔴' : d === 'down' ? '🟢' : '⚪'; }

// ========== 渲染：通用 ==========
function showLoading(tabId) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  c.innerHTML = `<div class="loading">
    <div class="skeleton" style="width:80%"></div>
    <div class="skeleton" style="width:60%"></div>
    <div class="skeleton" style="width:90%"></div>
    <div class="skeleton" style="width:50%"></div>
  </div>`;
}

function showEmpty(tabId, reason = null) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  c.innerHTML = `<div class="empty">
    <div class="icon">📭</div>
    <h3>该日期暂无报告</h3>
    <p>可能原因：</p>
    <p class="reason">• 非交易日<br>• AAna cron 未触发<br>• 报告还未生成（请稍后再试）${reason ? '<br>• ' + reason : ''}</p>
  </div>`;
}

function showError(tabId, msg) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  c.innerHTML = `<div class="error-state">
    <div class="icon">❌</div>
    <p>${esc(msg)}</p>
    <button class="retry-btn" onclick="window.xcompass.loadTab('${tabId}')">重试</button>
  </div>`;
}

// ========== 渲染：选股 ==========
function renderSelection(d) {
  if (!d) return showEmpty('selection');
  const meta = d.meta || {};
  const moodScore = (meta.moodScore || '?').match(/\d+/)?.[0] || '?';
  const moodDir = (meta.moodScore || '').includes('乐观') ? 'up' : (meta.moodScore || '').includes('悲观') ? 'down' : 'flat';

  let html = `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">情绪评分</div>
        <div class="metric-value ${moodDir}">${esc(moodScore)}</div>
        <div class="metric-sub">${esc((meta.moodScore || '').replace(/\d+[()]/g, '').trim() || '未知')}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">上证指数</div>
        <div class="metric-value">${esc((meta.shIndex || '').split(' ')[0] || '—')}</div>
        <div class="metric-sub">${esc((meta.shIndex || '').split(' ').slice(1).join(' ') || '—')}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">建议仓位</div>
        <div class="metric-value">${esc(meta.position?.match(/\d+%/)?.[0] || meta.position || '—')}</div>
        <div class="metric-sub">v2.5</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">生成时间</div>
        <div class="metric-value" style="font-size:0.85rem">${esc((meta.generatedAt || '').slice(0, 16) || '—')}</div>
        <div class="metric-sub">v2.5 autopilot</div>
      </div>
    </div>
  `;

  if (d.hotspots?.length) {
    html += `<div class="card">
      <div class="card-title"><span class="icon">🔥</span> 热点主线</div>
      <table class="tbl">
        <thead><tr><th>排名</th><th>板块</th><th>核心逻辑</th><th class="center">持续性</th></tr></thead>
        <tbody>
          ${d.hotspots.map(h => `<tr>
            <td class="center">${esc(h.rank || '')}</td>
            <td><strong>${esc(h.sector || '')}</strong></td>
            <td>${esc(h.logic || '')}</td>
            <td class="center">${esc(h.sustainability || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  if (d.topPicks?.length) {
    html += renderStockGroup('🏆 重点关注 Top 10', '综合评分排序', d.topPicks, true);
  }

  if (d.strong?.length) html += renderStockGroup('🚀 强势股', '今日强势上涨+放量 | 风险等级：高', d.strong);
  if (d.active?.length) html += renderStockGroup('⚡ 活跃股', '量比放大+趋势良好 | 风险等级：中高', d.active);
  if (d.potential?.length) html += renderStockGroup('💡 潜力股', '温和上涨+缩量整理 | 风险等级：中', d.potential);

  if (d.buyPoint?.note) {
    html += `<div class="card">
      <div class="card-title"><span class="icon">🎯</span> 最佳买点</div>
      <p>${esc(d.buyPoint.note)}</p>
      ${d.buyPoint.highRisk?.length ? `<p style="margin-top:0.5rem;color:var(--yellow)">⚠️ 高风险警示：${d.buyPoint.highRisk.map(s => `${esc(s.name)}(${esc(s.code)})`).join('、')}</p>` : ''}
    </div>`;
  }

  return html;
}

function renderStockGroup(title, desc, stocks, withRank = false) {
  return `<div class="group">
    <div class="group-title">${title}</div>
    <div class="group-desc">${esc(desc)}</div>
    <table class="tbl">
      <thead><tr>
        ${withRank ? '<th>排名</th>' : ''}
        <th>股票</th><th>代码</th><th class="num">价格</th><th class="num">涨跌幅</th>
        <th class="num">技术分</th><th class="num">综合分</th><th>信号</th><th>风险</th><th>趋势</th>
      </tr></thead>
      <tbody>
        ${stocks.map(s => `<tr>
          ${withRank ? `<td class="center"><strong>${esc(s.rank || '')}</strong></td>` : ''}
          <td><strong>${esc(s.emoji || '📊')}${esc(s.name || '')}</strong></td>
          <td><code>${esc(s.code || '')}</code></td>
          <td class="num">¥${esc(s.price || '')}</td>
          <td class="num ${dirClass(s.dir)}">${dirSymbol(s.dir)} ${esc(s.changePct?.toFixed(2) || '')}%</td>
          <td class="num"><strong>${esc(s.techScore || '')}</strong></td>
          <td class="num"><strong>${esc(s.score || '')}</strong></td>
          <td>${esc(s.signal || '')}</td>
          <td>${esc(s.risk || '')}</td>
          <td>${esc(s.trend || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ========== 渲染：复盘 ==========
function renderReview(d) {
  if (!d) return showEmpty('review');
  const m = d.meta || {};
  const statusBadge = m.isTradingDay
    ? `<span style="color:var(--green)">🟢 交易日</span>`
    : `<span style="color:var(--yellow)">🚫 节假日（${esc(m.holidayName || '休市')}）</span>`;

  let html = `
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">市场状态</div>
        <div class="metric-value" style="font-size:0.95rem">${statusBadge}</div>
        <div class="metric-sub">${esc(m.generatedAt || '').slice(0, 16)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">最后交易日</div>
        <div class="metric-value" style="font-size:0.95rem">${esc(m.lastTradeDay || '—')}</div>
        <div class="metric-sub">节前基线</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">节后开盘日</div>
        <div class="metric-value" style="font-size:0.95rem;color:var(--accent)">${esc(m.nextTradeDay || '—')}</div>
        <div class="metric-sub">09:30 集合竞价</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">v2.x 持仓</div>
        <div class="metric-value">${esc(d.totalStats?.soldTotal || '0')} 笔</div>
        <div class="metric-sub">胜率 ${esc(d.totalStats?.winRate || '—')}</div>
      </div>
    </div>
  `;

  if (d.holdings?.length) {
    html += `<div class="card">
      <div class="card-title"><span class="icon">📈</span> v2.x 实盘累计</div>
      <table class="tbl">
        <thead><tr><th>交易日</th><th class="num">卖出笔数</th><th>胜率</th><th class="num">累计盈亏</th><th>vs 回测</th></tr></thead>
        <tbody>
          ${d.holdings.map(h => `<tr>
            <td><strong>${esc(h.date || '')}</strong></td>
            <td class="num">${esc(String(h.soldCount ?? '—'))}</td>
            <td>${esc(h.winRate || '—')}</td>
            <td class="num" style="color:${(h.pnl || '').includes('-') ? 'var(--green)' : 'var(--red)'}"><strong>${esc(h.pnl || '—')}</strong></td>
            <td>${esc(h.vsBaseline || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p style="margin-top:0.85rem;color:var(--text2);font-size:0.82rem">
        💰 <strong>累计 ${esc(d.totalStats?.totalPnl || '—')}</strong> · ${d.totalStats?.soldTotal || 0} 笔 · 胜率 <strong>${esc(d.totalStats?.winRate || '—')}</strong>
      </p>
    </div>`;
  }

  if (d.cronAudit) {
    html += `<div class="card">
      <div class="card-title"><span class="icon">🚨</span> cron 异常审计（${d.cronAudit.length} 日）</div>
      <table class="tbl">
        <thead><tr><th>日期</th><th>星期</th><th>cron 触发次数</th></tr></thead>
        <tbody>
          ${d.cronAudit.map(c => `<tr>
            <td><strong>${esc(c.date || '')}</strong></td>
            <td>${esc(c.weekday || '')}</td>
            <td>${c.items?.length || 0} 次</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  if (d.postHolidayPlan) {
    html += `<div class="card">
      <div class="card-title"><span class="icon">🎯</span> 节后开盘预案</div>
      <pre style="white-space:pre-wrap;font-family:inherit;color:var(--text)">${esc(d.postHolidayPlan)}</pre>
    </div>`;
  }

  return html;
}

// ========== 渲染：深度（保留 markdown 原始结构） ==========
function renderDeepDive(d) {
  if (!d) return showEmpty('deepdive');
  const sections = d.rawSections || [];
  let html = `<div class="card">
    <div class="card-title"><span class="icon">🔬</span> ${esc(d.title || '深度分析')}</div>
    <div class="group-desc">生成时间：${esc(d.generatedAt || '—')}</div>
  </div><div class="md-body">`;

  for (const sec of sections) {
    if (sec.level === 1 && sec.heading === d.title) continue; // 跳过标题
    if (sec.level === 1) {
      html += `<h1>${esc(sec.heading)}</h1>`;
    } else if (sec.level === 2) {
      html += `<h2>${esc(sec.heading)}</h2>`;
    } else if (sec.level === 3) {
      html += `<h3>${esc(sec.heading)}</h3>`;
    }
    html += `<p>${esc(sec.content).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }
  html += `</div>`;
  return html;
}

// ========== 渲染：盘前/竞价/盘中（共用） ==========
function renderIntradayLike(d, tabId) {
  if (!d) return showEmpty(tabId);

  let html = '';

  // 时间线
  if (d.timeline?.length) {
    html += `<div class="timeline">${d.timeline.map(t =>
      `<div class="timeline-item ${t.done ? 'done' : ''}"><span class="time">${esc(t.time)}</span><span>${esc(t.label)}</span></div>`
    ).join('')}</div>`;
  }

  // 指数网格
  if (d.indices?.length) {
    html += `<div class="section-title"><span class="icon">📊</span> 指数</div><div class="metric-grid">${d.indices.slice(0, 4).map(i =>
      `<div class="metric-card">
        <div class="metric-label">${esc(i.name)}</div>
        <div class="metric-value">${esc(i.val)}</div>
        <div class="metric-sub ${dirClass(i.dir)}">${dirSymbol(i.dir)} ${esc(i.changePct?.toFixed(2) || '')}%</div>
      </div>`
    ).join('')}</div>`;
  }

  // 情绪
  if (d.mood) {
    html += `<div class="card"><div class="card-title"><span class="icon">💭</span> 市场情绪</div><p>${esc(d.mood)}</p></div>`;
  }

  // 板块
  if (d.sectors?.length) {
    html += `<div class="card">
      <div class="card-title"><span class="icon">🏷️</span> 板块涨幅榜</div>
      <table class="tbl"><thead><tr><th>板块</th><th class="num">涨跌幅</th><th>逻辑</th></tr></thead>
      <tbody>${d.sectors.slice(0, 8).map(s => `<tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td class="num ${dirClass(s.dir)}">${dirSymbol(s.dir)} ${esc(s.changePct?.toFixed(2))}%</td>
        <td>${esc(s.logic || '')}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // 涨幅榜 + 跌幅榜
  const cols = (label, items) => items?.length ? `<div class="card">
    <div class="card-title"><span class="icon">${label === '涨幅榜' ? '🚀' : '📉'}</span> ${label} Top 5</div>
    <table class="tbl"><thead><tr><th>股票</th><th>代码</th><th>板块</th><th class="num">涨跌幅</th></tr></thead>
    <tbody>${items.map(s => `<tr>
      <td><strong>${esc(s.emoji || '📊')}${esc(s.name)}</strong></td>
      <td><code>${esc(s.code)}</code></td>
      <td>${esc(s.sector || '')}</td>
      <td class="num ${dirClass(s.dir)}">${dirSymbol(s.dir)} ${esc(s.changePct?.toFixed(2))}%</td>
    </tr>`).join('')}</tbody></table></div>` : '';

  html += cols('涨幅榜', d.top5) + cols('跌幅榜', d.bot5);

  // 操作建议
  if (d.ops || d.recommendation) {
    html += `<div class="card"><div class="card-title"><span class="icon">💡</span> 操作建议</div><p>${esc(d.ops || d.recommendation)}</p></div>`;
  }

  return html;
}

// ========== 加载逻辑 ==========
async function loadTab(tabId) {
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;

  const cached = STATE.loaded[tabId];
  if (cached !== undefined) {
    renderTab(tabId, cached);
    return;
  }

  showLoading(tabId);
  try {
    const data = await tab.loader(STATE.currentDate);
    STATE.loaded[tabId] = data;
    renderTab(tabId, data);
  } catch (e) {
    console.error(`[x-compass] ${tabId} load error:`, e);
    STATE.loaded[tabId] = { _error: e.message };
    showError(tabId, `加载失败：${e.message}`);
  }
}

function renderTab(tabId, data) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;

  if (!data) {
    showEmpty(tabId);
    return;
  }

  if (data._error) {
    showError(tabId, data._error);
    return;
  }

  let html = '';
  if (tabId === 'selection') html = renderSelection(data);
  else if (tabId === 'review') html = renderReview(data);
  else if (tabId === 'deepdive') html = renderDeepDive(data);
  else html = renderIntradayLike(data, tabId);

  c.innerHTML = html || showEmpty(tabId);
}

// ========== Tab 切换 ==========
function switchTab(tabId) {
  STATE.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `content-${tabId}`));
  loadTab(tabId);
}

// ========== 日期切换 ==========
function setDate(date) {
  STATE.currentDate = date;
  STATE.loaded = {};  // 清除所有缓存
  document.getElementById('date-input').value = date;
  document.getElementById('last-loaded').textContent = `加载中…`;
  loadAllTabs();
}

function loadAllTabs() {
  for (const tab of TABS) {
    showLoading(tab.id);
  }
  Promise.all(TABS.map(tab => tab.loader(STATE.currentDate).then(data => ({ tabId: tab.id, data })).catch(e => ({ tabId: tab.id, data: { _error: e.message } }))))
    .then(results => {
      for (const { tabId, data } of results) {
        STATE.loaded[tabId] = data;
        renderTab(tabId, data);
      }
      document.getElementById('last-loaded').textContent = `最后加载：${new Date().toLocaleTimeString('zh-CN')}`;
    });
}

// ========== 初始化 ==========
function init() {
  STATE.currentDate = todayISO();

  // 日期选择器
  document.getElementById('date-input').value = STATE.currentDate;
  document.getElementById('date-input').addEventListener('change', e => {
    if (e.target.value) setDate(e.target.value);
  });
  document.getElementById('btn-today').addEventListener('click', () => setDate(todayISO()));
  document.getElementById('btn-prev').addEventListener('click', () => setDate(dateOffset(-1)));
  document.getElementById('btn-next').addEventListener('click', () => setDate(dateOffset(1)));

  // Tab 切换
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // 全局引用（retry 按钮用到）
  window.xcompass = { loadTab, setDate, switchTab };

  // 首次加载
  loadAllTabs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}