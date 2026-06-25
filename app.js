// app.js — x-compass v3.0 (Tokyo Night Trading Terminal)
// 6 个 Tab 切换 / 日期选择 / 加载协调 / Bento Grid 渲染 / 错误降级

import { parseSelectionReport } from './parsers/selection.js';
import { parseReviewReport } from './parsers/review.js';
import { parseDeepDiveReport } from './parsers/deepdive.js';
import { loadPremarketReport } from './parsers/premarket.js';
import { loadAuctionReport } from './parsers/auction.js';
import { loadIntradayReport, loadCloseReport } from './parsers/intraday.js';
import { esc } from './parsers/common.js';

const TABS = [
  { id: 'selection', label: '🟢 选股', loader: parseSelectionReport },
  { id: 'review', label: '📊 复盘', loader: parseReviewReport },
  { id: 'deepdive', label: '🔬 深度', loader: parseDeepDiveReport },
  { id: 'premarket', label: '🌅 盘前', loader: loadPremarketReport },
  { id: 'auction', label: '⚡ 竞价', loader: loadAuctionReport },
  { id: 'intraday', label: '📈 盘中', loader: loadIntradayReport },
];

const STATE = {
  currentDate: '',
  loaded: {},
  activeTab: 'selection',
};

// ========== 工具函数 ==========
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dirClass(d) { return d === 'up' ? 'up' : d === 'down' ? 'down' : 'flat'; }
function dirSymbol(d) { return d === 'up' ? '▲' : d === 'down' ? '▼' : '─'; }

// ========== 通用渲染 ==========
function showLoading(tabId) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  c.innerHTML = `<div class="skeleton-grid">
    <div class="skeleton-card" style="grid-column: span 6;">
      <div class="skeleton-bar tall short"></div>
      <div class="skeleton-bar med"></div>
    </div>
    <div class="skeleton-card" style="grid-column: span 3;">
      <div class="skeleton-bar short"></div>
      <div class="skeleton-bar long"></div>
    </div>
    <div class="skeleton-card" style="grid-column: span 3;">
      <div class="skeleton-bar short"></div>
      <div class="skeleton-bar long"></div>
    </div>
    <div class="skeleton-card" style="grid-column: span 12;">
      <div class="skeleton-bar long"></div>
      <div class="skeleton-bar med"></div>
      <div class="skeleton-bar long"></div>
    </div>
  </div>`;
}

function showEmpty(tabId) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  c.innerHTML = `<div class="empty">
    <div class="icon">∅</div>
    <h3>该日期暂无报告</h3>
    <p>请尝试切换日期或检查 AAna cron 是否已触发</p>
    <p class="reason">可能原因：非交易日 · AAna cron 未触发 · 报告生成延迟</p>
  </div>`;
}

function showError(tabId, msg) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  c.innerHTML = `<div class="error-state">
    <div class="icon">⚠</div>
    <h3>加载失败</h3>
    <p>${esc(msg)}</p>
    <button class="retry-btn" onclick="window.xcompass.loadTab('${tabId}')">↻ 重试</button>
  </div>`;
}

// ========== 渲染：选股（Bento 不对称） ==========
function renderSelection(d) {
  if (!d) return showEmpty('selection');
  const meta = d.meta || {};
  const moodScoreStr = meta.moodScore || '';
  const moodNum = moodScoreStr.match(/\d+/)?.[0] || '—';
  const moodLabel = moodScoreStr.replace(/\d+[()（）]/g, '').trim() || '未知';
  const moodDir = moodScoreStr.includes('乐观') ? 'up' : moodScoreStr.includes('悲观') ? 'down' : 'flat';

  const shIndexRaw = meta.shIndex || '';
  const shParts = shIndexRaw.split(/\s+/);
  const shVal = shParts[0] || '—';
  const shChange = shParts.slice(1).join(' ') || '—';
  const shDir = shChange.includes('+') ? 'up' : shChange.includes('-') ? 'down' : 'flat';

  const positionMatch = (meta.position || '').match(/\d+%/);
  const position = positionMatch ? positionMatch[0] : (meta.position || '—');

  let html = `
    <div class="metric-hero">
      <div class="metric-card primary">
        <div class="metric-label">情绪评分 · Mood</div>
        <div class="metric-value huge ${moodDir}">${esc(moodNum)}</div>
        <div class="metric-sub">${esc(moodLabel)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">上证指数</div>
        <div class="metric-value ${shDir}">${esc(shVal)}</div>
        <div class="metric-sub">${esc(shChange)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">建议仓位</div>
        <div class="metric-value">${esc(position)}</div>
        <div class="metric-sub">v2.5 · ${esc((meta.generatedAt || '').slice(0, 16))}</div>
      </div>
    </div>
  `;

  // 热点主线（不等宽 Bento）
  if (d.hotspots?.length) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">🔥 热点主线</div>
        <div class="group-desc">板块 + 持续性 · 驱动逻辑</div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th class="center" style="width:80px">RANK</th><th>板块</th><th>核心逻辑</th><th class="center" style="width:140px">SUSTAINABILITY</th></tr></thead>
          <tbody>
            ${d.hotspots.map(h => `<tr>
              <td class="center"><strong style="color:var(--accent-yellow)">${esc(h.rank || '')}</strong></td>
              <td><strong>${esc(h.sector || '')}</strong></td>
              <td>${esc(h.logic || '')}</td>
              <td class="center"><span style="color:var(--accent-yellow)">${esc(h.sustainability || '')}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  if (d.topPicks?.length) {
    html += renderStockGroup('🏆 重点关注 Top 10', '综合评分排序 · 风险等级 + 趋势判断', d.topPicks, true);
  }

  if (d.strong?.length) html += renderStockGroup('🚀 强势股', '今日强势上涨 + 放量 | 止损 -5%', d.strong);
  if (d.active?.length) html += renderStockGroup('⚡ 活跃股', '量比放大 + 趋势良好 | 止损 -6%', d.active);
  if (d.potential?.length) html += renderStockGroup('💡 潜力股', '温和上涨 + 缩量整理 | 止损 -8%', d.potential);

  if (d.buyPoint?.note) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">🎯 最佳买点</div>
        <div class="group-desc">今日回调但未暴跌</div>
      </div>
      <p style="color:var(--text);line-height:1.7">${esc(d.buyPoint.note)}</p>
      ${d.buyPoint.highRisk?.length ? `<p style="margin-top:0.85rem;color:var(--accent-yellow);font-family:var(--font-mono);font-size:0.78rem">
        ⚠ 高风险警示 · ${d.buyPoint.highRisk.map(s => `${esc(s.name)}(<code>${esc(s.code)}</code>)`).join(' · ')}
      </p>` : ''}
    </div>`;
  }

  return html;
}

function renderStockGroup(title, desc, stocks, withRank = false) {
  return `<div class="bento-group">
    <div class="group-head">
      <div class="group-title">${esc(title)}</div>
      <div class="group-desc">${esc(desc)}</div>
    </div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          ${withRank ? '<th class="center" style="width:60px">RANK</th>' : ''}
          <th>STOCK</th>
          <th style="width:90px">CODE</th>
          <th class="num" style="width:80px">PRICE</th>
          <th class="num" style="width:100px">CHANGE</th>
          <th class="num" style="width:70px">TECH</th>
          <th class="num" style="width:70px">SCORE</th>
          <th>SIGNAL</th>
          <th>RISK</th>
          <th>TREND</th>
        </tr></thead>
        <tbody>
          ${stocks.map(s => `<tr>
            ${withRank ? `<td class="center"><strong style="color:var(--accent-yellow)">${esc(s.rank || '')}</strong></td>` : ''}
            <td><strong>${esc(s.emoji || '📊')}${esc(s.name || '')}</strong></td>
            <td><code>${esc(s.code || '')}</code></td>
            <td class="num">¥${esc(s.price || '')}</td>
            <td class="num ${dirClass(s.dir)}"><strong>${dirSymbol(s.dir)} ${esc(s.changePct?.toFixed(2) || '')}%</strong></td>
            <td class="num"><strong>${esc(s.techScore || '')}</strong></td>
            <td class="num"><strong style="color:var(--accent-cyan)">${esc(s.score || '')}</strong></td>
            <td style="font-size:0.78rem">${esc(s.signal || '')}</td>
            <td style="font-size:0.78rem">${esc(s.risk || '')}</td>
            <td style="font-size:0.78rem">${esc(s.trend || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ========== 渲染：复盘（Bento 不对称） ==========
function renderReview(d) {
  if (!d) return showEmpty('review');
  const m = d.meta || {};
  const statusBadge = m.isTradingDay
    ? `<span style="color:var(--accent-green)">● TRADING</span>`
    : `<span style="color:var(--accent-yellow)">● HOLIDAY</span>`;

  let html = `
    <div class="metric-hero">
      <div class="metric-card primary">
        <div class="metric-label">市场状态 · Market Status</div>
        <div class="metric-value" style="font-size:1.5rem">${statusBadge}</div>
        <div class="metric-sub">${esc(m.holidayName || '交易日')} · ${esc((m.generatedAt || '').slice(0, 16))}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">最后交易日</div>
        <div class="metric-value" style="font-size:1.5rem">${esc(m.lastTradeDay || '—')}</div>
        <div class="metric-sub">节前基线 · Pre-Holiday</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">节后开盘日</div>
        <div class="metric-value" style="font-size:1.5rem;color:var(--accent-blue)">${esc(m.nextTradeDay || '—')}</div>
        <div class="metric-sub">09:30 集合竞价</div>
      </div>
    </div>
  `;

  // 持仓统计（左侧大卡）
  if (d.holdings?.length) {
    const total = d.totalStats || {};
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">📈 v2.x 实盘累计</div>
        <div class="group-desc">${esc(total.soldTotal || 0)} 笔交易 · 累计 ${esc(total.totalPnl || '—')} · 胜率 <strong style="color:var(--accent-cyan)">${esc(total.winRate || '—')}</strong></div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>交易日</th>
            <th class="num" style="width:120px">卖出笔数</th>
            <th style="width:140px">胜率</th>
            <th class="num" style="width:120px">累计盈亏</th>
            <th>vs 回测 80.2%</th>
          </tr></thead>
          <tbody>
            ${d.holdings.map(h => `<tr>
              <td><strong>${esc(h.date || '')}</strong></td>
              <td class="num">${esc(String(h.soldCount ?? '—'))}</td>
              <td>${esc(h.winRate || '—')}</td>
              <td class="num" style="color:${(h.pnl || '').includes('-') ? 'var(--a-down)' : 'var(--a-up)'};font-weight:700">${esc(h.pnl || '—')}</td>
              <td>${esc(h.vsBaseline || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  if (d.cronAudit) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">🚨 cron 异常审计</div>
        <div class="group-desc">${d.cronAudit.length} 日 · 自动化任务执行记录</div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>日期</th><th>星期</th><th class="num">触发次数</th></tr></thead>
          <tbody>
            ${d.cronAudit.map(c => `<tr>
              <td><strong>${esc(c.date || '')}</strong></td>
              <td>${esc(c.weekday || '')}</td>
              <td class="num"><strong style="color:var(--accent-yellow)">${c.items?.length || 0}</strong></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  if (d.postHolidayPlan) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">🎯 节后开盘预案</div>
        <div class="group-desc">调休休市 / 节后开盘策略</div>
      </div>
      <div class="md-body" style="margin:0;padding:1.25rem 1.4rem">
        <pre style="white-space:pre-wrap;font-family:var(--font-body);color:var(--text);line-height:1.75">${esc(d.postHolidayPlan)}</pre>
      </div>
    </div>`;
  }

  return html;
}

// ========== 渲染：深度（Markdown 渲染） ==========
// ========== 轻量 Markdown 渲染器 ==========
// 覆盖 # h1-6 / 表格 / 列表 / **bold** / `code` / ```代码块``` / > quote / --- hr
// 设计：先 esc() 防 XSS，再按行扫描 + 块级匹配，最后做 inline 替换
// 边界：AAna 报告里的"标准 markdown + emoji + ⚠️ 引用块"
function renderInline(s) {
  // 行内元素：先 code（防 **/` 互相破坏），再 bold，最后 emoji 防误伤
  // 1) inline code: `text`
  s = s.replace(/`([^`\n]+)`/g, (_, c) => `<code>${c}</code>`);
  // 2) bold: **text** (中文报告里经常混用 *text* — 一并支持)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<strong>$2</strong>');
  return s;
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  // 块级扫描：每次 while 循环吃一段
  while (i < lines.length) {
    const line = lines[i];

    // 1) 代码块 ```...```
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 2) 表格：连续 | 开头 + | --- | 分隔 + | 结尾
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|/.test(lines[i + 1])) {
      const headerCells = line.split('|').slice(1, -1).map(c => c.trim());
      i += 2; // skip header + 分隔行
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()));
        i++;
      }
      let tbl = '<div class="tbl-wrap"><table class="tbl"><thead><tr>';
      for (const h of headerCells) tbl += `<th>${renderInline(esc(h))}</th>`;
      tbl += '</tr></thead><tbody>';
      for (const row of rows) {
        tbl += '<tr>';
        for (const cell of row) tbl += `<td>${renderInline(esc(cell || '—'))}</td>`;
        tbl += '</tr>';
      }
      tbl += '</tbody></table></div>';
      out.push(tbl);
      continue;
    }

    // 3) 标题 # ~ ######
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lvl = Math.min(hm[1].length, 6);
      out.push(`<h${lvl}>${renderInline(esc(hm[2]))}</h${lvl}>`);
      i++;
      continue;
    }

    // 4) 分隔线 ---
    if (/^---+$/.test(line.trim())) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // 5) 引用块 > (支持连续行合并)
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderInline(esc(buf.join('\n'))).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }

    // 6) 无序列表 - / * (支持嵌套缩进)
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>' + buf.map(b => `<li>${renderInline(esc(b))}</li>`).join('') + '</ul>');
      continue;
    }

    // 7) 有序列表 1. 2.
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push('<ol>' + buf.map(b => `<li>${renderInline(esc(b))}</li>`).join('') + '</ol>');
      continue;
    }

    // 8) 空行：段落分隔
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 9) 默认：合并连续非空行为一个段落
    const para = [];
    while (i < lines.length && lines[i].trim() !== ''
           && !/^#{1,6}\s/.test(lines[i])
           && !/^```/.test(lines[i])
           && !/^\s*\|/.test(lines[i])
           && !/^\s*>/.test(lines[i])
           && !/^\s*[-*]\s+/.test(lines[i])
           && !/^\s*\d+\.\s+/.test(lines[i])
           && !/^---+$/.test(lines[i].trim())) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      // 单行段落不要包 <p>（让 emoji + 短句不显得突兀）
      const text = para.join(' ');
      out.push(`<p>${renderInline(esc(text))}</p>`);
    }
  }
  return out.join('\n');
}

function renderDeepDive(d) {
  if (!d) return showEmpty('deepdive');
  const sections = d.rawSections || [];
  let html = `<div class="bento-group">
    <div class="group-head">
      <div class="group-title">🔬 ${esc(d.title || '深度分析')}</div>
      <div class="group-desc">生成时间 · ${esc(d.generatedAt || '—')}</div>
    </div>
  </div><div class="md-body">`;

  for (const sec of sections) {
    // 跳过 H1 标题（已被 bento-group 头部展示）
    if (sec.level === 1 && sec.heading === d.title) continue;
    if (sec.level === 1) html += `<h1>${renderInline(esc(sec.heading))}</h1>`;
    else if (sec.level === 2) html += `<h2>${renderInline(esc(sec.heading))}</h2>`;
    else if (sec.level === 3) html += `<h3>${renderInline(esc(sec.heading))}</h3>`;
    // 用完整 markdown 渲染器替换原来的"双换行→p"简陋逻辑
    html += renderMarkdown(sec.content);
  }
  html += `</div>`;
  return html;
}

// ========== 渲染：盘前/竞价/盘中（共用） ==========
function renderIntradayLike(d, tabId) {
  if (!d) return showEmpty(tabId);
  let html = '';

  if (d.timeline?.length) {
    html += `<div class="timeline">${d.timeline.map(t =>
      `<div class="timeline-item ${t.done ? 'done' : ''}"><span class="time">${esc(t.time)}</span><span>${esc(t.label)}</span></div>`
    ).join('')}</div>`;
  }

  if (d.indices?.length) {
    html += `<div class="metric-hero">${d.indices.slice(0, 4).map((i, idx) =>
      `<div class="metric-card ${idx === 0 ? 'primary' : ''}">
        <div class="metric-label">${esc(i.name)}</div>
        <div class="metric-value">${esc(i.val)}</div>
        <div class="metric-sub ${dirClass(i.dir)}" style="color:var(--a-${dirClass(i.dir)})">${dirSymbol(i.dir)} ${esc(i.changePct?.toFixed(2) || '')}%</div>
      </div>`
    ).join('')}</div>`;
  }

  if (d.mood) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">💭 市场情绪</div>
      </div>
      <p style="color:var(--text);line-height:1.7">${esc(d.mood)}</p>
    </div>`;
  }

  if (d.sectors?.length) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">🏷️ 板块涨幅榜</div>
        <div class="group-desc">Top ${Math.min(d.sectors.length, 8)}</div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>板块</th><th class="num" style="width:140px">涨跌幅</th><th>逻辑</th></tr></thead>
          <tbody>${d.sectors.slice(0, 8).map(s => `<tr>
            <td><strong>${esc(s.name)}</strong></td>
            <td class="num ${dirClass(s.dir)}" style="color:var(--a-${dirClass(s.dir)})"><strong>${dirSymbol(s.dir)} ${esc(s.changePct?.toFixed(2))}%</strong></td>
            <td>${esc(s.logic || '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  }

  const cols = (label, items) => items?.length ? `<div class="bento-group">
    <div class="group-head">
      <div class="group-title">${label === '涨幅榜' ? '🚀' : '📉'} ${label} Top 5</div>
    </div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>STOCK</th><th style="width:90px">CODE</th><th>板块</th><th class="num" style="width:120px">CHANGE</th></tr></thead>
        <tbody>${items.map(s => `<tr>
          <td><strong>${esc(s.emoji || '📊')}${esc(s.name)}</strong></td>
          <td><code>${esc(s.code)}</code></td>
          <td>${esc(s.sector || '')}</td>
          <td class="num ${dirClass(s.dir)}" style="color:var(--a-${dirClass(s.dir)})"><strong>${dirSymbol(s.dir)} ${esc(s.changePct?.toFixed(2))}%</strong></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </div>` : '';

  html += cols('涨幅榜', d.top5) + cols('跌幅榜', d.bot5);

  if (d.ops || d.recommendation) {
    html += `<div class="bento-group">
      <div class="group-head">
        <div class="group-title">💡 操作建议</div>
      </div>
      <p style="color:var(--text);line-height:1.7">${esc(d.ops || d.recommendation)}</p>
    </div>`;
  }

  return html;
}

// ========== 加载 + 渲染调度 ==========
async function loadTab(tabId) {
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;
  const cached = STATE.loaded[tabId];
  if (cached !== undefined) { renderTab(tabId, cached); return; }

  showLoading(tabId);
  try {
    const data = await tab.loader(STATE.currentDate);
    STATE.loaded[tabId] = data;
    renderTab(tabId, data);
  } catch (e) {
    console.error(`[x-compass] ${tabId} load error:`, e);
    STATE.loaded[tabId] = { _error: e.message };
    showError(tabId, e.message);
  }
}

function renderTab(tabId, data) {
  const c = document.getElementById(`content-${tabId}`);
  if (!c) return;
  if (!data) { showEmpty(tabId); return; }
  if (data._error) { showError(tabId, data._error); return; }

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
  STATE.loaded = {};
  document.getElementById('date-input').value = date;
  document.getElementById('last-loaded').innerHTML = '<span style="color:var(--accent-yellow)">◐ LOADING…</span>';
  loadAllTabs();
}

function loadAllTabs() {
  for (const tab of TABS) showLoading(tab.id);
  Promise.all(TABS.map(tab =>
    tab.loader(STATE.currentDate)
      .then(data => ({ tabId: tab.id, data }))
      .catch(e => ({ tabId: tab.id, data: { _error: e.message } }))
  )).then(results => {
    for (const { tabId, data } of results) {
      STATE.loaded[tabId] = data;
      renderTab(tabId, data);
    }
    document.getElementById('last-loaded').innerHTML = `<span style="color:var(--accent-green)">●</span> UPDATED · ${new Date().toLocaleTimeString('zh-CN')}`;
  });
}

// ========== 初始化 ==========
function init() {
  STATE.currentDate = todayISO();
  document.getElementById('date-input').value = STATE.currentDate;
  document.getElementById('date-input').addEventListener('change', e => { if (e.target.value) setDate(e.target.value); });
  document.getElementById('btn-today').addEventListener('click', () => setDate(todayISO()));
  document.getElementById('btn-prev').addEventListener('click', () => setDate(dateOffset(-1)));
  document.getElementById('btn-next').addEventListener('click', () => setDate(dateOffset(1)));
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  window.xcompass = { loadTab, setDate, switchTab };
  loadAllTabs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}