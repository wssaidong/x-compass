# x-compass

**AAna 报告浏览器** —— 6 类 A 股投研报告统一视图。

数据源：[wssaidong/AAna](https://github.com/wssaidong/AAna) 仓库 `reports/` 目录。

## 6 类报告

| Tab | 报告 | 生成时间 | 用途 |
|:---|:---|:---|:---|
| 🟢 选股 | `YYYY-MM-DD-选股报告.md` | 每日 17:01 | Top10 + 强势/活跃/潜力股 |
| 📊 复盘 | `YYYY-MM-DD-复盘报告.md` | 每日 17:00 | 持仓 + cron 审计 + 节后预案 |
| 🔬 深度 | `YYYY-MM-DD-深度分析.md` | 不定期 | 单只股票深度研究 |
| 🌅 盘前 | `盘前/YYYY-MM-DD_0830_早盘简报.md` | 08:30 | 早盘指数/板块/Top5 |
| ⚡ 竞价 | `竞价/YYYY-MM-DD_0928_竞价推送.md` | 09:28 | 集合竞价数据 |
| 📈 盘中 | `盘中/YYYY-MM-DD_1128_午盘总结.md` + `_1445_尾盘分析.md` | 11:28 + 14:45 | 盘中行情 + 尾盘决策 |

## 本地开发

```bash
cd ~/code/x-compass
python3 -m http.server 8765
# 访问 http://localhost:8765
```

## 部署

```bash
cd ~/code/x-compass
wrangler pages deploy . --project-name x-compass
```

部署到 Cloudflare Pages：`x-compass.pages.dev`

## 文件结构

```
x-compass/
├── index.html              # 主入口（极简骨架）
├── styles.css              # 暗色主题 + 响应式
├── app.js                  # 主逻辑：日期选择、Tab 切换、加载协调
├── parsers/
│   ├── common.js           # 共享工具
│   ├── selection.js        # 选股报告
│   ├── review.js           # 复盘报告
│   ├── deepdive.js         # 深度分析
│   ├── premarket.js        # 盘前早盘
│   ├── auction.js          # 竞价推送
│   └── intraday.js         # 盘中总结 + 尾盘分析
├── SPEC.md                 # 完整规格说明
├── wrangler.toml           # Cloudflare Pages 配置
└── backup-20260621/        # 旧实现备份（5月版）
```

## 限制

- **GitHub raw 限流**：60 次/小时/IP。x-compass 6 个 Tab 同日查询 = 6 次请求。
- **节假日**：AAna 在非交易日也可能生成"复盘"报告（含 cron 异常审计），属于正常输出。
- **5 月路径**：旧版报告路径 `reports/YYYY-MM-DD/{盘前,竞价,盘中,复盘}/...` 仍保留兼容。

## 单元测试

```bash
cd ~/code/x-compass
node -e "
import('./parsers/selection.js').then(async m => {
  const fs = await import('fs');
  const md = fs.readFileSync('/Users/cai/code/AAna/reports/2026-06-21-选股报告.md','utf8');
  console.log(JSON.stringify(m.parseSelectionReport(md, '2026-06-21')?.meta, null, 2));
});
"
```