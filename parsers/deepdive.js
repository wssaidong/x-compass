// parsers/deepdive.js — 深度分析解析器（不定期，单只股票/主题深度研究）
// 报告结构：h1 标题 + meta 引用块 + 若干 ## 章节。最简单：保留原始结构供前端渲染 markdown。

import { fetchText, RAW_BASE } from './common.js';

// 纯函数：传入报告原文，按标题层级切成 rawSections（便于单元测试 + 前端逐节渲染）
export function parseDeepDive(md, date = '') {
  const lines = md.split('\n');
  const titleLine = lines.find(l => /^#\s+/.test(l));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '';

  const gm = md.match(/\*\*生成时间[：:]\*\*\s*([^|>\n]+)/);
  const generatedAt = gm ? gm[1].trim() : null;

  const rawSections = [];
  let cur = null;
  for (const line of lines) {
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      if (cur) rawSections.push({ level: cur.level, heading: cur.heading, content: cur.lines.join('\n').trim() });
      cur = { level: hm[1].length, heading: hm[2].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) rawSections.push({ level: cur.level, heading: cur.heading, content: cur.lines.join('\n').trim() });

  return { date, title, generatedAt, rawSections };
}

export async function parseDeepDiveReport(date) {
  const md = await fetchText(`${RAW_BASE}/${date}-深度分析.md`);
  if (!md) return null;
  return parseDeepDive(md, date);
}

// 自测：node parsers/deepdive.js [path/to/深度分析.md]
if (typeof process !== 'undefined' && /deepdive\.js$/.test(process.argv[1] || '')) {
  const fs = await import('node:fs');
  const file = process.argv[2] || `${process.env.HOME}/code/AAna/reports/2026-06-20-深度分析.md`;
  const r = parseDeepDive(fs.readFileSync(file, 'utf8'), '2026-06-20');
  console.log('[deepdive] title:', r.title);
  console.log('[deepdive] generatedAt:', r.generatedAt);
  console.log('[deepdive] sections:', r.rawSections.length);
  r.rawSections.forEach(s => console.log(`  h${s.level} ${s.heading} (${s.content.length} chars)`));
}
