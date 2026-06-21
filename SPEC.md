# x-compass 重构规格说明（给 Claude Code）

## 项目背景

**x-compass** 是 AAna（A 股智能投研系统）报告的可视化浏览器。AAna 每天自动生成 6 类 Markdown 报告，托管在 GitHub: `wssaidong/AAna`（main 分支，路径 `reports/`）。

**现有实现的问题**：
- 816 行单文件 `index.html`（5 月版，已 5 周未更新）
- 只支持 4 种"日内阶段"报告（盘前/竞价/盘中/复盘）
- 完全不支持 3 种"日级报告"：**选股 / 复盘 / 深度分析**——这才是 AAna 主力输出
- 硬编码日期 `2026-05-15` 兜底（断网/数据缺失时不报错）
- 4 个解析器共用同一套脆弱正则（多次 bug fix）

**目标**：重写为 6 类报告统一浏览器，模块化、可维护、可部署到 Cloudflare Pages。

---

## 数据源（GitHub raw）

仓库：`https://raw.githubusercontent.com/wssaidong/AAna/main/reports/`

**6 类报告路径模板**：

```
1. 选股报告
   URL:  reports/YYYY-MM-DD-选股报告.md
   时间: 每日 17:01（v2.5）
   用途: 每日选股 Top10 + 强势股/活跃股/潜力股分组

2. 复盘报告
   URL:  reports/YYYY-MM-DD-复盘报告.md
   时间: 每日 17:00（autopilot cron 触发）
   用途: 持仓盈亏 + 早盘命中 + cron 异常审计 + 节后预案

3. 深度分析
   URL:  reports/YYYY-MM-DD-深度分析.md
   时间: 不定期
   用途: 单只股票深度研究

4. 盘前早盘
   URL:  reports/YYYY-MM-DD/盘前/YYYY-MM-DD_0830_早盘简报.md
   时间: 交易日 08:30
   用途: 早盘简报（指数/板块/Top5）

5. 竞价推送
   URL:  reports/YYYY-MM-DD/竞价/YYYY-MM-DD_0928_竞价推送.md
   时间: 交易日 09:28
   用途: 集合竞价数据

6. 盘中总结 + 尾盘分析（两文件合并视图）
   URL1: reports/YYYY-MM-DD/盘中/YYYY-MM-DD_1128_午盘总结.md
   URL2: reports/YYYY-MM-DD/盘中/YYYY-MM-DD_1445_尾盘分析.md
   时间: 交易日 11:28 + 14:45
   用途: 盘中行情 + 尾盘决策
```

**节假日处理**：AAna 在非交易日也常生成报告（标记为"节假日复盘"），URL 模板不变。x-compass 直接按日期拉取，不做交易日判断（这是 AAna 的责任）。

---

## 用户已确认的决策

| # | 决策点 | 选择 |
|:---:|:---|:---|
| 1 | 日期范围 | **最近 7 天**（7 天可覆盖端午等小长假空白） |
| 2 | 股票交互 | **不需要**（不跳转东方财富、不加 localStorage 收藏） |
| 3 | 更新策略 | **每次进页面 fetch 最新**（无 SW 缓存） |
| 4 | 部署方式 | **`wrangler pages deploy .`**（手动，本地构建） |

---

## 文件结构

```
~/code/x-compass/
├── index.html              # 主入口（极简骨架，引用 css/js）
├── styles.css              # 暗色主题（GitHub Primer 风格）
├── app.js                  # 主逻辑：日期选择、Tab 切换、加载协调
├── parsers/
│   ├── common.js           # 共享工具：parseChangeStr / parseTableLine
│   ├── selection.js        # 选股报告解析器
│   ├── review.js           # 复盘报告解析器
│   ├── deepdive.js         # 深度分析解析器
│   ├── premarket.js        # 盘前早盘解析器
│   ├── auction.js          # 竞价推送解析器
│   └── intraday.js         # 盘中总结 + 尾盘分析解析器
├── SPEC.md                 # 本文档
├── wrangler.toml           # Cloudflare Pages 配置（已存在，保留）
├── backup-20260621/        # 旧实现备份（已提交）
└── README.md               # 项目说明（新建）
```

**注意**：保持单页部署友好——所有 JS/CSS 是静态文件，Cloudflare Pages 直传 `pages_build_output_dir = "."`。

---

## 前端设计

### 顶部导航
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 x-compass · AAna 报告浏览器                              │
│ 日期: [◀ 2026-06-21 ▶]   [今天]   最后加载: 19:30:45        │
├─────────────────────────────────────────────────────────────┤
│ [🟢 选股] [📊 复盘] [🔬 深度] [🌅 盘前] [⚡ 竞价] [📈 盘中]│
└─────────────────────────────────────────────────────────────┘
```

### Tab 内容区（每个 Tab 独立加载、互不阻塞）

**🟢 选股 Tab 结构**：
- 顶部：情绪评分 / 上证指数 / 建议仓位（3 个 metric card）
- 热点主线表格（板块 + 持续性）
- 重点关注 Top 10 表格
- 强势股 / 活跃股 / 潜力股 3 个分组表格
- 最佳买点提示

**📊 复盘 Tab 结构**：
- 顶部：市场状态（交易日/节假日 + 关键日期）
- 持仓状态表（卖出笔数、胜率、累计盈亏）
- cron 异常审计表（if present）
- 节后预案（if present）

**🔬 深度 Tab 结构**：
- 报告标题 + 生成时间
- Markdown body 渲染（保留标题层级 + 表格 + 列表）

**🌅 盘前 / ⚡ 竞价 / 📈 盘中 Tab 结构**：
- 指数网格（4 列：上证 / 深证 / 创业板 / 科创50）
- 板块涨幅榜表格
- 涨跌榜 Top 5 / Bot 5
- 操作建议 / 时间线

### 通用 UI 规则

- **空数据状态**：每个 Tab 数据缺失时显示
  ```
  ┌──────────────────────────────┐
  │  📭 该日期暂无报告            │
  │                              │
  │  可能原因：                   │
  │  • 非交易日                   │
  │  • AAna cron 未触发           │
  │                              │
  │  [查看历史日期]               │
  └──────────────────────────────┘
  ```
- **加载中状态**：每个 Tab 显示骨架屏（skeleton），不要 spinner 转圈（避免视觉疲劳）
- **错误状态**：fetch 失败显示
  ```
  ❌ 加载失败
  [重试]
  ```

### 响应式断点

```css
/* 手机：< 640px - 单列布局 */
/* 平板：640-1024px - 2 列布局 */
/* 桌面：> 1024px - 4 列布局 */
```

### 主题色（保留现有暗色）

```css
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --card: #1c2128;
  --border: #30363d;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --orange: #f0883e;
  --text: #e6edf3;
  --text2: #8b949e;
}
```

---

## 解析器设计

每个 parser 暴露统一接口：

```js
// parsers/selection.js
export async function parseSelectionReport(date) {
  const md = await fetch(`https://raw.githubusercontent.com/wssaidong/AAna/main/reports/${date}-选股报告.md`)
    .then(r => r.ok ? r.text() : null)
    .catch(() => null);

  if (!md) return null; // 数据缺失

  return {
    date,
    meta: parseMeta(md),    // { generatedAt, moodScore, shIndex, position }
    hotspots: parseHotspots(md),  // [{ rank, sector, logic, sustainability }]
    topPicks: parseTopPicks(md),  // [{ rank, name, code, price, change, ... }]
    strong: parseGroup(md, '强势股'),
    active: parseGroup(md, '活跃股'),
    potential: parseGroup(md, '潜力股'),
    buyPoint: parseBuyPoint(md),
  };
}
```

**解析策略**：
- **行扫描为主，正则为辅**：每行检查是否进入某个 section（如"## 三、精选个股"），section 内逐行解析表格
- **emoji 容忍**：AAna 报告中常用 emoji 前缀（🔴🟡🟢⚪📈📉➡️）代表涨跌/趋势，保留并用于 UI 着色
- **失败优雅**：解析失败返回部分数据 + `_parseError: true` 标记，UI 显示警告条
- **不重复造正则**：参考 `backup-20260621/index.html` 中 `parseIntraday` 的 line-split 思路（已验证可工作）

### 各报告关键字段

**选股报告关键 section**（参考 `~/code/AAna/reports/2026-06-21-选股报告.md`）：
```
> **情绪评分：** 50（未知）| **上证指数：** ... | **建议仓位：** 50%
## 一、大盘概览           → 表格
## 二、热点主线           → 表格（板块 + 持续性）
## 三、精选个股           → 子分组
  ### 🏆 重点关注 Top 10
  ### 🚀 强势股
  ### ⚡ 活跃股
  ### 💡 潜力股
## 四、🎯 最佳买点
```

**复盘报告关键 section**（参考 `2026-06-21-复盘报告.md`）：
```
> **市场状态：** 🚫 节假日休市 / 🟢 交易日
> **节后开盘日：** 2026-06-23 周二 09:30
## 一、<状态>回顾
## 二、v2.x 实盘最新累计        → 持仓表
## 三、🚨 cron 异常审计         → 可选
## 四、节后开盘预案             → 可选
```

**盘前/竞价/盘中** 复用旧实现思路，重点修复 5 周前的 bug。

---

## 关键技术约束

1. **零依赖**：不引入任何 npm 包（保持 wrangler deploy 即用）
2. **ES modules**：使用 `<script type="module">` + `import`，现代浏览器原生支持
3. **CORS**：raw.githubusercontent.com 已开放 CORS，无需 proxy
4. **日期格式**：所有 URL 用 `YYYY-MM-DD`，JavaScript 用 ISO 字符串避免时区问题
5. **错误隔离**：一个 Tab 解析失败不影响其他 Tab
6. **无 localStorage**（用户决策 2）
7. **无 Service Worker**（用户决策 3）

---

## 验证步骤

代码写完后，Claude Code 应执行以下验证并报告：

1. **静态检查**：
   ```bash
   cd ~/code/x-compass
   ls -la *.html *.js *.css parsers/*.js
   node -e "const fs=require('fs'); ['index.html','app.js','styles.css',...parsers/*.js].forEach(f => { if(!fs.existsSync(f)) throw f+' missing'; });"
   ```

2. **本地起服务**：
   ```bash
   cd ~/code/x-compass && python3 -m http.server 8765 &
   sleep 2
   curl -sS http://localhost:8765/ | head -20
   ```

3. **解析器单元测试**（拿真实报告验证）：
   ```bash
   cd ~/code/x-compass
   node -e "
   import('./parsers/selection.js').then(async m => {
     const data = await m.parseSelectionReport('2026-06-21');
     console.log(JSON.stringify(data?.meta, null, 2));
     console.log('topPicks count:', data?.topPicks?.length);
   });
   "
   ```

4. **lint**（可选）：
   ```bash
   # 用浏览器 console 检查运行时错误
   # 或 eslint 如果已装
   ```

---

## 实施步骤建议

Claude Code 应按此顺序执行（每步独立 commit）：

1. **step 1**: 创建 `parsers/common.js`（共享工具函数）
2. **step 2**: 创建 `parsers/selection.js`（选股解析器，含 unit test）
3. **step 3**: 创建 `parsers/review.js`（复盘解析器）
4. **step 4**: 创建 `parsers/deepdive.js`（深度分析解析器，最简单：直接渲染 markdown）
5. **step 5**: 创建 `parsers/premarket.js`、`auction.js`、`intraday.js`（沿用旧思路）
6. **step 6**: 创建 `styles.css`（暗色主题 + 响应式）
7. **step 7**: 创建 `app.js`（主逻辑：日期选择 + Tab 切换 + 加载协调）
8. **step 8**: 重写 `index.html`（极简骨架，引用 css/js）
9. **step 9**: 创建 `README.md`
10. **step 10**: 跑验证步骤，修复任何错误

每步完成后 `git add` + `git commit`，commit message 用中文简洁说明。

---

## 交付物清单

Claude Code 完成后应确认：

- [ ] `index.html` ≤ 100 行（只引用 css/js，不内联）
- [ ] `styles.css` 包含所有主题色 + 响应式断点
- [ ] `app.js` ≤ 400 行（不含 parsers）
- [ ] 6 个 parser 文件，每个 ≤ 200 行
- [ ] 所有 parser 能成功解析 `2026-06-21` 当天的 6 类报告（除非该报告不存在）
- [ ] 本地 `python3 -m http.server` 起服务后，浏览器 console 无 JS 错误
- [ ] git log 显示每个 step 一个 commit
- [ ] 没有引入任何 npm 依赖
- [ ] 没有用到 localStorage / Service Worker

---

## 部署说明（Claude Code 不需要做）

部署由用户手动执行：

```bash
cd ~/code/x-compass
wrangler pages deploy . --project-name x-compass --commit-dirty=true
# timeout 永远 300s 起步（用户偏好）
```

部署后用户用 `curl https://x-compass.pages.dev` 验证（首次 20-30s CDN 冷启动，< 3s 第二次）。

---

## 已知风险

1. **GitHub raw 限流**：60 次/小时/IP，无 auth。x-compass 6 个 Tab × 7 天 = 42 个请求/次访问，可能触发限流。**应对**：第一次 fetch 失败时显示"GitHub 限流，5 分钟后重试"。
2. **AAna 报告路径可能变化**：5 月的旧路径是 `reports/YYYY-MM-DD/{竞价,盘前,盘中,复盘}/...`，现在加了 `reports/YYYY-MM-DD-选股报告.md`。解析器必须能容忍两种格式或给出明确错误。
3. **节假日 + cron 异常**：AAna 复盘报告常包含"🚫 节假日休市"和"cron 异常审计"章节，解析器不能把这些当成错误。

---

**最后**：Claude Code 写代码时如发现 SPEC.md 与 AAna 实际报告格式不符，**优先按实际报告格式来**，并在交付报告中明确说明偏差。