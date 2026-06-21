// parsers/selection.js — 选股报告解析器（每日 17:01 v2.5）
// 报告结构：顶部 meta(情绪/上证/仓位) → 大盘概览 → 热点主线 → 精选个股(Top10/强势/活跃/潜力) → 最佳买点

import { fetchText, parseChange, splitRow, isSeparator, stripEmojis, stripMd, stripPrice, RAW_BASE } from './common.js';

// 纯函数：传入报告原文，返回结构化数据（便于单元测试）
export function parseSelection(md, date = '') {
  const lines = md.split('\n');
  const meta = {};
  const gm = md.match(/\*\*生成时间[：:]\*\*\s*([^\n|>]+)/);
  if (gm) meta.generatedAt = gm[1].trim();
  const mm = md.match(/\*\*情绪评分[：:]\*\*\s*([^|]+)/);
  if (mm) meta.moodScore = mm[1].trim();
  const sh = md.match(/\*\*上证指数[：:]\*\*\s*([^|]+)/);
  if (sh) meta.shIndex = sh[1].trim();
  const pm = md.match(/\*\*建议仓位[：:]\*\*\s*([^\n]+)/);
  if (pm) meta.position = pm[1].trim();

  const hotspots = [], topPicks = [], strong = [], active = [], potential = [];
  const buyPoint = { note: '', highRisk: [] };
  let zone = '', sub = '';

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (/二[、.].*热点/.test(line)) { zone = 'hotspot'; sub = ''; }
      else if (/三[、.].*精选个股/.test(line)) { zone = 'selection'; sub = ''; }
      else if (/四[、.].*最佳买点/.test(line)) { zone = 'buy'; sub = ''; }
      else { zone = ''; sub = ''; }
      continue;
    }
    if (zone === 'selection' && /^###\s/.test(line)) {
      if (/Top\s*10|重点关注/.test(line)) sub = 'top10';
      else if (/强势股/.test(line)) sub = 'strong';
      else if (/活跃股/.test(line)) sub = 'active';
      else if (/潜力股/.test(line)) sub = 'potential';
      else sub = '';
      continue;
    }
    if (!/^\|/.test(line)) {
      if (zone === 'buy') {
        const im = line.match(/^[-*]\s*(.+?)[(（](\d{6})[)）]\s*(.+)/);
        if (im) buyPoint.highRisk.push({ name: stripEmojis(im[1]), code: im[2], note: im[3].trim() });
        else if (!buyPoint.note && line.trim() && !/^[#>|*_\-]/.test(line) && !/高风险警示|免责/.test(line)) {
          buyPoint.note = line.trim();
        }
      }
      continue;
    }
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;
    const g = i => cells[i] || '';
    if (zone === 'hotspot' && g(0) !== '排名' && cells.length >= 4) {
      hotspots.push({ rank: g(0), sector: stripEmojis(g(1)), logic: g(2), sustainability: g(3) });
    } else if (zone === 'selection' && sub === 'top10' && g(0) !== '排名') {
      const ch = parseChange(g(4));
      topPicks.push({ rank: g(0), name: stripEmojis(g(1)), code: g(2), price: stripPrice(g(3)),
        changePct: ch.val, dir: ch.dir, tech: stripMd(g(5)), score: stripMd(g(6)),
        signal: g(7), risk: g(8), trend: g(9) });
    } else if (zone === 'selection' && (sub === 'strong' || sub === 'active' || sub === 'potential') && g(0) !== '股票') {
      const ch = parseChange(g(3));
      const row = { name: stripEmojis(g(0)), code: g(1), price: stripPrice(g(2)),
        changePct: ch.val, dir: ch.dir, tech: stripMd(g(4)), score: stripMd(g(5)),
        rating: g(6), reason: g(7), trend: g(8) };
      if (sub === 'strong') strong.push(row);
      else if (sub === 'active') active.push(row);
      else potential.push(row);
    }
  }

  return { date, meta, hotspots, topPicks, strong, active, potential, buyPoint };
}

export async function parseSelectionReport(date) {
  const md = await fetchText(`${RAW_BASE}/${date}-选股报告.md`);
  if (!md) return null;
  return parseSelection(md, date);
}

// 自测：node parsers/selection.js [path/to/选股报告.md]
if (typeof process !== 'undefined' && /selection\.js$/.test(process.argv[1] || '')) {
  const fs = await import('node:fs');
  const file = process.argv[2] || `${process.env.HOME}/code/AAna/reports/2026-06-21-选股报告.md`;
  const r = parseSelection(fs.readFileSync(file, 'utf8'), '2026-06-21');
  console.log('[selection] meta:', JSON.stringify(r.meta));
  console.log('[selection] hotspots:', r.hotspots.length, 'topPicks:', r.topPicks.length);
  console.log('[selection] strong:', r.strong.length, 'active:', r.active.length, 'potential:', r.potential.length);
  console.log('[selection] buyPoint.note:', r.buyPoint.note, '| highRisk:', r.buyPoint.highRisk.length);
  console.log('[selection] sample topPick:', JSON.stringify(r.topPicks[0]));
}
