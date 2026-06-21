// parsers/review.js — 复盘报告解析器（每日 17:00 autopilot cron 触发）
// 报告结构：顶部 meta(生成时间/市场状态/节前最后交易日/节后开盘日) → 收盘回顾 → v2.x 实盘累计(持仓表) → cron 异常审计(可选) → 节后预案(可选)

import { fetchText, splitRow, isSeparator, stripMd, RAW_BASE } from './common.js';

// 纯函数：传入报告原文，返回结构化数据（便于单元测试）
export function parseReview(md, date = '') {
  const lines = md.split('\n');
  const meta = parseReviewMeta(md, lines);

  const holdings = [];
  let totalStats = { soldTotal: null, winRate: null, totalPnl: null, days: null };
  let cronAudit = null;

  const tables = collectTables(lines);
  let holdingsFound = false;
  for (const t of tables) {
    if (!holdingsFound && isHoldingsTable(t.header)) {
      const r = parseHoldingsTable(t);
      holdings.push(...r.holdings);
      totalStats = r.totalStats;
      holdingsFound = true;
    } else if (cronAudit === null && isCronAuditTable(t.header)) {
      cronAudit = parseCronAuditTable(t);
    }
  }

  const postHolidayPlan = parsePostHolidayPlan(lines);
  return { date, meta, holdings, totalStats, cronAudit, postHolidayPlan };
}

// 顶部 meta：节假日复盘带 市场状态/节前最后交易日/节后开盘日；交易日复盘只有 生成时间/数据口径
function parseReviewMeta(md, lines) {
  const meta = {
    generatedAt: null,
    marketStatus: 'trading',
    isTradingDay: true,
    holidayName: null,
    lastTradeDay: null,
    nextTradeDay: null,
  };
  const gm = md.match(/\*\*生成时间[：:]\*\*\s*([^|>\n]+)/);
  if (gm) meta.generatedAt = gm[1].trim();

  const msLine = lines.find(l => /\*\*市场状态[：:]\*\*/.test(l));
  if (msLine) {
    const isHoliday = /🚫|节假日|休市/.test(msLine);
    meta.marketStatus = isHoliday ? 'holiday' : 'trading';
    meta.isTradingDay = !isHoliday;
    const msText = stripMd(msLine.replace(/^\s*>?\s*\*\*市场状态[：:]\*\*/, '')).trim();
    const hm = msText.match(/休市[（(]([^）)]*)[)）]/) || msText.match(/[（(]([^）)]+)[)）]/);
    meta.holidayName = hm ? hm[1].trim() : (msText.split(/[—\-–]/)[0].trim() || null);
  }

  const ltLine = lines.find(l => /\*\*节前最后交易日[：:]/.test(l));
  if (ltLine) {
    const dm = ltLine.match(/(\d{4}-\d{2}-\d{2})/);
    if (dm) meta.lastTradeDay = dm[1];
  }
  const ntLine = lines.find(l => /\*\*节后开盘日[：:]/.test(l));
  if (ntLine) {
    const dm = ntLine.match(/(\d{4}-\d{2}-\d{2})/);
    if (dm) meta.nextTradeDay = dm[1];
  }
  return meta;
}

// 把连续的 | 行聚合成 { header, rows }（分隔行 |:---:| 丢弃）
function collectTables(lines) {
  const tables = [];
  let cur = null;
  for (const line of lines) {
    if (/^\|/.test(line)) {
      const cells = splitRow(line);
      if (isSeparator(cells)) continue;
      if (!cur) cur = { header: null, rows: [] };
      if (!cur.header) cur.header = cells;
      else cur.rows.push(cells);
    } else if (cur) {
      tables.push(cur);
      cur = null;
    }
  }
  if (cur) tables.push(cur);
  return tables;
}

// 持仓累计表：表头含「胜率」+「盈亏」（卖出笔数列可有可无）
function isHoldingsTable(header) {
  const h = header.join(' ');
  return /胜率/.test(h) && /盈亏/.test(h);
}

// 按表头关键词动态映射列下标（兼容 6-21「卖出笔数」列与 6-18 无此列两种格式）
function mapHoldingsCols(header) {
  const map = { date: 0 };
  header.forEach((h, i) => {
    const hs = stripMd(h);
    if (/卖出.*笔数|笔数/.test(hs)) map.soldCount = i;
    else if (/胜率/.test(hs)) map.winRate = i;
    else if (/盈亏/.test(hs)) map.pnl = i;
    else if (/^vs|回测|基准/.test(hs)) map.vsBaseline = i;
    else if (/交易日|交易对|日期/.test(hs)) map.date = i;
  });
  return map;
}

function parseHoldingsTable(t) {
  const map = mapHoldingsCols(t.header);
  const holdings = [];
  const totalStats = { soldTotal: null, winRate: null, totalPnl: null, days: null };
  for (const cells of t.rows) {
    const first = stripMd(cells[map.date] || '');
    if (/累计/.test(first)) {
      fillTotalStats(totalStats, cells, map);
    } else {
      holdings.push(parseHoldingRow(cells, map));
    }
  }
  return { holdings, totalStats };
}

function parseHoldingRow(cells, map) {
  const g = i => stripMd(cells[i] || '');
  return {
    date: g(map.date),
    soldCount: map.soldCount != null ? g(map.soldCount) : '',
    winRate: g(map.winRate),
    pnl: g(map.pnl),
    vsBaseline: map.vsBaseline != null ? g(map.vsBaseline) : '',
  };
}

// 合计行：首格「N 日累计」→ days；卖出笔数格「27 笔」→ soldTotal，无此列时从胜率「14/27」取分母
function fillTotalStats(totalStats, cells, map) {
  const first = stripMd(cells[map.date] || '');
  const dm = first.match(/(\d+)\s*日/);
  if (dm) totalStats.days = parseInt(dm[1], 10);
  if (map.soldCount != null) {
    const sc = stripMd(cells[map.soldCount] || '');
    const sm = sc.match(/(\d+)/);
    if (sm) totalStats.soldTotal = parseInt(sm[1], 10);
  } else {
    const wr = stripMd(cells[map.winRate] || '');
    const wm = wr.match(/(\d+)\s*[\/／]\s*(\d+)/);
    if (wm) totalStats.soldTotal = parseInt(wm[2], 10);
  }
  totalStats.winRate = stripMd(cells[map.winRate] || '');
  totalStats.totalPnl = stripMd(cells[map.pnl] || '');
}

// cron 审计表：表头「日期」「星期」+ 至少一列脚本名（.py / Agent）
function isCronAuditTable(header) {
  const h = header.map(stripMd);
  if (h.length < 3 || !/日期/.test(h[0])) return false;
  const hasWeekday = h.some(x => /星期|周[一二三四五六日天]/.test(x));
  const hasScript = h.slice(2).some(x => /\.py|Agent|cron/i.test(x));
  return hasWeekday && hasScript;
}

function parseCronAuditTable(t) {
  const scriptNames = t.header.slice(2).map(stripMd);
  return t.rows.map(cells => {
    const g = i => stripMd(cells[i] || '');
    const items = scriptNames
      .map((name, idx) => {
        const cell = g(idx + 2);
        return { name, status: extractStatus(cell), note: cell };
      })
      .filter(it => it.note);
    return { date: g(0), weekday: g(1), items };
  });
}

function extractStatus(cell) {
  if (/✅|🟢|✓/.test(cell)) return 'pass';
  if (/🔴|❌|✗/.test(cell)) return 'fail';
  if (/⚠️|🟡/.test(cell)) return 'warn';
  if (/➖|—|–/.test(cell)) return 'skip';
  return 'unknown';
}

// 节后开盘预案：二级标题 ## 中含「节后…开盘…预案」的整节正文；交易日无此节 → null
function parsePostHolidayPlan(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) && /节后.*开盘.*预案|节后.*预案|开盘预案/.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const buf = [];
  for (let i = start; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    buf.push(lines[i]);
  }
  const content = buf.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return content || null;
}

export async function parseReviewReport(date) {
  const md = await fetchText(`${RAW_BASE}/${date}-复盘报告.md`);
  if (!md) return null;
  return parseReview(md, date);
}

// 自测：node parsers/review.js [path/to/复盘报告.md]
if (typeof process !== 'undefined' && /review\.js$/.test(process.argv[1] || '')) {
  const fs = await import('node:fs');
  const file = process.argv[2] || `${process.env.HOME}/code/AAna/reports/2026-06-21-复盘报告.md`;
  const r = parseReview(fs.readFileSync(file, 'utf8'), '2026-06-21');
  console.log('[review] meta:', JSON.stringify(r.meta));
  console.log('[review] holdings:', r.holdings.length, '| totalStats:', JSON.stringify(r.totalStats));
  console.log('[review] cronAudit:', r.cronAudit ? `${r.cronAudit.length} days` : 'null');
  console.log('[review] postHolidayPlan:', r.postHolidayPlan ? `${r.postHolidayPlan.length} chars` : 'null');
  console.log('[review] sample holding:', JSON.stringify(r.holdings[0]));
  console.log('[review] sample cronAudit day:', r.cronAudit ? JSON.stringify(r.cronAudit[0]) : 'null');
}
