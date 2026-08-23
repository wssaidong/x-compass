// parsers/weekly.js — 每周复盘三维度周报解析器（Phase 9 · x-compass 第 7 tab）
// 数据源: reports/weekly_review-latest.md (AAna scripts/weekly_review.py 生成, 固定文件名)
// 结构: 4 个 section (星期/板块/持有期/周趋势), 每个是 markdown 表格。

import { fetchText, RAW_BASE, splitRow, isSeparator, stripEmojis, stripMd } from './common.js';

// 解析 "| 🔴 周一 | 6 | 16.7% | -1.31% |" 这类表格为对象数组
function parseTable(lines) {
  const rows = [];
  let header = null;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;
    if (!header) { header = cells.map(c => stripEmojis(stripMd(c))); continue; }
    rows.push(cells.map(c => c.trim()));
  }
  return { header: header || [], rows };
}

// 单元格 "| 🔴 周一 |" → { emoji: '🔴', label: '周一' }
function splitEmojiCell(cell) {
  const m = String(cell).match(/^\s*([\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}](?:\uFE0F)?)\s*(.+?)\s*$/u);
  if (m) return { emoji: m[1], label: stripMd(m[2]) };
  return { emoji: '', label: stripMd(String(cell)) };
}

// "16.7%" → 16.7 ; "-1.31%" → -1.31
function pct(v) {
  const m = String(v ?? '').match(/([+-]?[\d.]+)\s*%/);
  return m ? parseFloat(m[1]) : null;
}
function num(v) {
  const m = String(v ?? '').match(/[+-]?[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// emoji → 严重度 (用于条形图配色): 🟢强 🟡良 🟠弱 🔴差
function emojiLevel(e) {
  if (e === '🟢') return 'good';
  if (e === '🟡') return 'ok';
  if (e === '🟠') return 'weak';
  if (e === '🔴') return 'bad';
  return '';
}

export function parseWeeklyReview(md) {
  const lines = md.split('\n');
  const out = {
    title: '',
    generatedAt: '',
    window: '',
    dow: [],        // [{emoji,label,n,winRate,avgRet,level}]
    sector: [],     // 同上
    hold: [],       // [{emoji,label,days,n,winRate,avgRet,level}]
    trend: [],      // [{emoji,week,weekStart,n,winRate,avgRet,level}]
    notes: [],      // 关键发现文字 (核心发现/T+15 警告等)
  };

  const titleLine = lines.find(l => /^#\s+/.test(l));
  out.title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '每周复盘';

  const gm = md.match(/\*\*生成时间\*\*[:：]?\s*([^\n|]+)/);
  out.generatedAt = gm ? gm[1].trim() : '';
  const wm = md.match(/\*\*回看窗口\*\*[:：]?\s*([^\n]+)/);
  out.window = wm ? wm[1].trim() : '';

  // 按 section 切分
  const sections = {};
  let curKey = null;
  for (const line of lines) {
    const hm = line.match(/^##\s+(.*)$/);
    if (hm) {
      const h = hm[1];
      if (h.includes('星期')) curKey = 'dow';
      else if (h.includes('板块')) curKey = 'sector';
      else if (h.includes('持有')) curKey = 'hold';
      else if (h.includes('趋势')) curKey = 'trend';
      else curKey = null;
      if (curKey) sections[curKey] = [];
      continue;
    }
    if (curKey) sections[curKey].push(line);
    // 关键发现行 (加粗开头, 不在表格里)
    if (/^\*\*(核心发现|最佳|强势|弱势)/.test(line.trim())) {
      out.notes.push(stripMd(line.trim()));
    }
  }

  // 星期维度: | 🔴 周一 | 6 | 16.7% | -1.31% |
  if (sections.dow) {
    const { rows } = parseTable(sections.dow);
    for (const r of rows) {
      if (r.length < 4) continue;
      const { emoji, label } = splitEmojiCell(r[0]);
      out.dow.push({
        emoji, label,
        n: num(r[1]),
        winRate: pct(r[2]),
        avgRet: pct(r[3]),
        level: emojiLevel(emoji),
      });
    }
  }

  // 板块维度: | 🔴 机械 | 10 | 100.0% | +1.84% |
  if (sections.sector) {
    const { rows } = parseTable(sections.sector);
    for (const r of rows) {
      if (r.length < 4) continue;
      const { emoji, label } = splitEmojiCell(r[0]);
      out.sector.push({
        emoji, label,
        n: num(r[1]),
        winRate: pct(r[2]),
        avgRet: pct(r[3]),
        level: emojiLevel(emoji),
      });
    }
  }

  // 持有期: | 🔴 T+1 (次日) | 31 | 16.1% | -1.85% |
  if (sections.hold) {
    const { rows } = parseTable(sections.hold);
    for (const r of rows) {
      if (r.length < 4) continue;
      const { emoji, label } = splitEmojiCell(r[0]);
      out.hold.push({
        emoji, label,
        days: num(label),
        n: num(r[1]),
        winRate: pct(r[2]),
        avgRet: pct(r[3]),
        level: emojiLevel(emoji),
      });
    }
  }

  // 周趋势: | 🔴 2026-W27 | 2026-06-29 | 8 | 12.5% | -3.73% |
  if (sections.trend) {
    const { rows } = parseTable(sections.trend);
    for (const r of rows) {
      if (r.length < 5) continue;
      const { emoji, label } = splitEmojiCell(r[0]);
      out.trend.push({
        emoji, week: label,
        weekStart: r[1],
        n: num(r[2]),
        winRate: pct(r[3]),
        avgRet: pct(r[4]),
        level: emojiLevel(emoji),
      });
    }
  }

  return out;
}

export async function parseWeeklyReport() {
  // 固定 latest 文件名 — 不随日期变
  const md = await fetchText(`${RAW_BASE}/weekly_review-latest.md`);
  if (!md) return null;
  return parseWeeklyReview(md);
}

// 自测: node parsers/weekly.js [path/to/weekly_review-latest.md]
if (typeof process !== 'undefined' && /weekly\.js$/.test(process.argv[1] || '')) {
  const fs = await import('node:fs');
  const file = process.argv[2] || `${process.env.HOME}/code/AAna/reports/weekly_review-latest.md`;
  const md = fs.readFileSync(file, 'utf-8');
  const d = parseWeeklyReview(md);
  console.log(JSON.stringify({
    title: d.title,
    generatedAt: d.generatedAt,
    window: d.window,
    dow: d.dow.length, sector: d.sector.length,
    hold: d.hold.length, trend: d.trend.length,
    notes: d.notes.length,
    sectorSample: d.sector[0],
    holdSample: d.hold[0],
  }, null, 2));
}
