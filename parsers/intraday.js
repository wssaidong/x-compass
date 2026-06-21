// parsers/intraday.js — 盘中总结 + 尾盘分析解析器（11:28 / 14:45）
// 沿用 backup-20260621/index.html parseIntraday + parseClose（已验证可工作）

import { fetchText, parseChangeStr, RAW_BASE } from './common.js';

// 盘中总结（11:28）
export function parseIntraday(md, date = '') {
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

  var moodM = md.match(/\*\*午盘情绪:\*\*\s*([^\n]+)/) || md.match(/\*\*情绪:\*\*\s*([^\n]+)/);
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

  var botM = md.match(/\*\*跌幅榜 Top 5\*\*([\s\S]*?)(?=\*\*下午操作|$)/);
  if (botM) {
    var rowRe = /\| ?([🤖💻📊🔧🧠🔋]*)?(.+?) ?\| (\d{6}) \| (.+?) \| ([🟢🔴⚪])\s*([+-]?[\d.]+)% \|$/gm;
    var m;
    while ((m = rowRe.exec(botM[1])) !== null) {
      var ch = parseChangeStr(m[5] + ' ' + m[6] + '%');
      d.bot5.push({ emoji: m[1] || '📊', name: m[2].trim(), code: m[3], sector: m[4], changePct: ch.val, dir: ch.dir });
    }
  }

  var opsM = md.match(/\*\*注意事项:\*\*\s*([\s\S]*?)(?=\*\*下午时间线|$)/);
  if (opsM) d.ops = opsM[1].trim();

  d.timeline = [
    { time: '13:00', label: '下午开盘', done: false },
    { time: '14:40', label: '📊 尾盘分析', done: false },
    { time: '15:00', label: '🔵 收盘', done: false },
    { time: '21:30', label: '🌙 复盘开始', done: false },
  ];

  return d;
}

// 尾盘分析（14:45）
export function parseClose(md, date = '') {
  var d = { date: date, indices: [], timeline: [], recommendation: '' };

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
    } else if (line.match(/指数表现/) || line.match(/大盘概览/) || line.match(/收盘/)) inIdxSection = true;
    else if (inIdxSection && !line.match(/^\|/) && line.trim() && !line.match(/^[-*_]{3,}\s*$/)) inIdxSection = false;
  });

  var recM = md.match(/\*\*操作建议:\*\*\s*([\s\S]*?)$/);
  if (recM) d.recommendation = recM[1].trim();

  d.timeline = [
    { time: '14:45', label: '📊 当前', done: true },
    { time: '15:00', label: '🔵 收盘', done: false },
    { time: '21:30', label: '🌙 复盘', done: false },
  ];

  return d;
}

export async function loadIntradayReport(date) {
  const url = `${RAW_BASE}/${date}/盘中/${date}_1128_午盘总结.md`;
  const md = await fetchText(url);
  if (!md) return null;
  return parseIntraday(md, date);
}

export async function loadCloseReport(date) {
  const url = `${RAW_BASE}/${date}/盘中/${date}_1445_尾盘分析.md`;
  const md = await fetchText(url);
  if (!md) return null;
  return parseClose(md, date);
}