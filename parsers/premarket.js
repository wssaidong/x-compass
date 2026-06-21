// parsers/premarket.js — 盘前早盘解析器（每日 08:30）
// 沿用 backup-20260621/index.html parsePremarket（已验证可工作）

import { fetchText, parseChangeStr, RAW_BASE } from './common.js';

export function parsePremarket(md, date = '') {
  var d = { date: date, indices: [], mood: '', sectors: [], top5: [], bot5: [], ops: '', timeline: [] };

  var lines = md.split('\n');
  var inIdxSection = false;
  lines.forEach(function (line) {
    if (inIdxSection && line.match(/^\|/)) {
      var cells = line.split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c; });
      if (cells.length >= 3) {
        var name = cells[0];
        var priceCell = cells[1].replace(/^¥/, '');
        var lastCell = cells[cells.length - 1];
        var emojiM = lastCell.match(/^([🟢🔴⚪])/);
        var ch = emojiM ? parseChangeStr(lastCell) : parseChangeStr(cells[cells.length - 2] + ' ' + lastCell);
        d.indices.push({ name: name, val: priceCell, dir: ch.dir, changePct: ch.val });
      }
    } else if (line.match(/指数表现/) || line.match(/大盘概览/)) inIdxSection = true;
    else if (inIdxSection && !line.match(/^\|/) && line.trim() && !line.match(/^[-*_]{3,}\s*$/)) inIdxSection = false;
  });

  var moodM = md.match(/\*\*早盘情绪:\*\*\s*([^\n]+)/);
  if (moodM) d.mood = moodM[1].trim();

  var inSectorTable = false;
  lines.forEach(function (line) {
    if (line.match(/板块排行/) || line.match(/板块.*涨幅.*逻辑/)) inSectorTable = true;
    else if (inSectorTable && line.match(/^\|/)) {
      var cells = line.split('|').map(function (c) { return c.trim(); }).filter(function (c) { return c; });
      if (cells.length >= 3 && !cells[0].match(/^[:-]/) && !cells[0].match(/^板块$/) && cells[0] !== '板块') {
        var nm = cells[0].replace(/[🥇🥈🥉]/g, '').trim();
        var ch = parseChangeStr(cells[1]);
        var logic = cells[cells.length - 1];
        if (nm && !nm.match(/板块|平均涨幅|逻辑/) && ch.val > 0) {
          d.sectors.push({ name: nm, changePct: ch.val, dir: ch.dir, logic: logic });
        }
      }
    } else if (inSectorTable && !line.match(/^\|/) && line.trim() === '') inSectorTable = false;
  });

  var topM = md.match(/\*\*涨幅榜 Top 5\*\*([\s\S]*?)(?=\*\*跌幅榜|$)/);
  if (topM) {
    var rowRe = /\| ?([🤖💻📊🔧🧠🔋]*)?(.+?) ?\| (\d{6}) \| (.+?) \| ([🟢🔴⚪])\s*([+-]?[\d.]+)% \|$/gm;
    var m;
    while ((m = rowRe.exec(topM[1])) !== null) {
      var ch = parseChangeStr(m[5] + ' ' + m[6] + '%');
      d.top5.push({ emoji: m[1] || '📊', name: m[2].trim(), code: m[3], sector: m[4], changePct: ch.val, dir: ch.dir });
    }
  }

  var botM = md.match(/\*\*跌幅榜 Top 5\*\*([\s\S]*?)(?=\*\*操作建议|$)/);
  if (botM) {
    var rowRe = /\| ?([🤖💻📊🔧🧠🔋]*)?(.+?) ?\| (\d{6}) \| (.+?) \| ([🟢🔴⚪])\s*([+-]?[\d.]+)% \|$/gm;
    var m;
    while ((m = rowRe.exec(botM[1])) !== null) {
      var ch = parseChangeStr(m[5] + ' ' + m[6] + '%');
      d.bot5.push({ emoji: m[1] || '📊', name: m[2].trim(), code: m[3], sector: m[4], changePct: ch.val, dir: ch.dir });
    }
  }

  var opsM = md.match(/\*\*操作建议:\*\*\s*([\s\S]*?)(?=\*\*下午时间线|$)/);
  if (opsM) d.ops = opsM[1].trim();

  d.timeline = [
    { time: '09:15', label: '集合竞价', done: false },
    { time: '09:30', label: '🔵 开盘', done: false },
    { time: '11:30', label: '午盘休市', done: false },
  ];

  return d;
}

export async function loadPremarketReport(date) {
  const url = `${RAW_BASE}/${date}/盘前/${date}_0830_早盘简报.md`;
  const md = await fetchText(url);
  if (!md) return null;
  return parsePremarket(md, date);
}