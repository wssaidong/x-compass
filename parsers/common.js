// parsers/common.js — 6 个解析器共享的工具函数（零依赖，浏览器/node 通用）

export const RAW_BASE = 'https://raw.githubusercontent.com/wssaidong/AAna/main/reports';

// 拉取一份报告原文；404 / 网络错误统一返回 null（数据缺失语义）
export async function fetchText(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// 涨跌幅解析。A 股惯例：🔴=涨(up) 🟢=跌(down) ⚪=平(flat)；无 emoji 时按数值正负判定
export function parseChange(str) {
  if (str == null) return { raw: '', dir: 'flat', val: 0 };
  const s = String(str);
  const m = s.match(/([+-]?[\d.]+)\s*%/);
  const signed = m ? parseFloat(m[1]) : 0;
  let dir = 'flat';
  if (s.includes('🔴')) dir = 'up';
  else if (s.includes('🟢')) dir = 'down';
  else if (signed > 0) dir = 'up';
  else if (signed < 0) dir = 'down';
  return { raw: s, dir, val: Math.abs(signed) };
}

// 拆 markdown 表格行为单元格（去掉首尾的空 cell）
export function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
}

// 是否为表格分隔行 |:---:|---
export function isSeparator(cells) {
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
}

// 去掉 emoji 前缀（用于从 "📊福达股份" 提取 "福达股份"）
export function stripEmojis(s) {
  return String(s ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}‍]/gu, '')
    .trim();
}

// 去掉 markdown 强调标记 ** ` _ （用于 "**78**" → "78"）
export function stripMd(s) {
  return String(s ?? '').replace(/\*\*/g, '').replace(/`/g, '').replace(/(^|\s)_(?=\S)/g, '$1').trim();
}

// 方向 → CSS class（红涨绿跌）
export function dirClass(dir) {
  return dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat';
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 从 priceCell（如 "¥16.49" / "16.49"）提取数值字符串
export function stripPrice(s) {
  return String(s ?? '').replace(/^¥\s*/, '').trim();
}
