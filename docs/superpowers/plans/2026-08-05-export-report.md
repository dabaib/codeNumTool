# 导出报告功能（HTML/PDF）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为统计结果页新增导出按钮，将查询结果导出为 HTML 或 PDF 报告文件。

**架构：** 前端（renderer.js）收集 `queryResult` 数据 + ECharts 截图，组装独立 HTML 字符串；通过 preload 暴露的 `exportAPI.saveReport(html, format)` 调用主进程；主进程弹出原生保存对话框，HTML 直接写入，PDF 用隐藏 BrowserWindow + `printToPDF()` 渲染后写入。

**技术栈：** Electron（`ipcMain.handle` / `ipcRenderer.invoke` / `dialog.showSaveDialog` / `webContents.printToPDF`）、原生 JS、ECharts（`getDataURL()` 截图）。

**规格：** [docs/superpowers/specs/2026-08-05-export-report-design.md](../specs/2026-08-05-export-report-design.md)

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `preload.js` | 暴露 `window.exportAPI.saveReport(html, format)` | 修改（末尾追加） |
| `main.js` | 新增 `export-save-report` IPC handler（保存对话框 + 写文件 + PDF 渲染） | 修改（末尾追加） |
| `index.html:475-476` | 结果标题区加导出按钮 + 格式下拉 | 修改 |
| `styles.css` | `.results-header`、`.btn-export`、`.export-dropdown` 样式 | 修改（末尾追加） |
| `renderer.js` | 下拉切换、`buildReportHTML()`、`exportReport()` | 修改（末尾追加） |

依赖方向：renderer.js → preload.js（`exportAPI`）→ main.js（`export-save-report`）。无循环依赖。

---

## 任务 1：preload.js — 暴露 exportAPI

**文件：**
- 修改：`preload.js`（末尾追加）

- [ ] **步骤 1：追加 exportAPI 代码块**

在 `preload.js` 末尾（第 76 行 `gitMultiRepoAPI` 块之后）追加：

```javascript
// 导出报告 API
contextBridge.exposeInMainWorld('exportAPI', {
  saveReport: (html, format) =>
    ipcRenderer.invoke('export-save-report', { html, format })
});
```

- [ ] **步骤 2：语法检查**

运行：`node --check preload.js`
预期：无输出，退出码 0。

- [ ] **步骤 3：Commit**

```bash
git add preload.js
git commit -m "feat: 暴露导出报告 exportAPI"
```

---

## 任务 2：main.js — 新增 export-save-report IPC handler

**文件：**
- 修改：`main.js`（末尾追加）

主进程需使用已导入的 `BrowserWindow`、`dialog`、`fs`（fs-extra，支持 `writeFileSync`）。无需新增 import。

- [ ] **步骤 1：追加 IPC handler**

在 `main.js` 末尾（第 3601 行 `}` 之后）追加：

```javascript
// 导出报告 (HTML/PDF)
ipcMain.handle('export-save-report', async (event, { html, format }) => {
  const isPdf = format === 'pdf';
  const ext = isPdf ? 'pdf' : 'html';
  const filters = isPdf
    ? [{ name: 'PDF 文件', extensions: ['pdf'] }]
    : [{ name: 'HTML 文件', extensions: ['html', 'htm'] }];

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: isPdf ? '导出 PDF 报告' : '导出 HTML 报告',
    defaultPath: `代码统计报告_${new Date().toISOString().slice(0, 10)}.${ext}`,
    filters
  });
  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    if (isPdf) {
      // 用隐藏窗口渲染 HTML 后打印为 PDF
      const pdfWin = new BrowserWindow({
        show: false,
        width: 1200,
        height: 1600,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' }
      });
      pdfWin.destroy();
      await fs.writeFile(filePath, pdfBuffer);
    } else {
      await fs.writeFile(filePath, html, 'utf-8');
    }
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

- [ ] **步骤 2：语法检查**

运行：`node --check main.js`
预期：无输出，退出码 0。

- [ ] **步骤 3：Commit**

```bash
git add main.js
git commit -m "feat: 新增导出报告 IPC handler (HTML/PDF)"
```

---

## 任务 3：index.html — 结果标题区加导出按钮和下拉

**文件：**
- 修改：`index.html:475-476`

- [ ] **步骤 1：修改结果标题结构**

将：

```html
			<div class="card hidden" id="resultsCard">
				<h2>统计结果</h2>
```

替换为：

```html
			<div class="card hidden" id="resultsCard">
				<div class="results-header">
					<h2>统计结果</h2>
					<div class="export-actions">
						<button
							type="button"
							id="exportBtn"
							class="btn btn-small btn-export"
							title="导出当前统计结果为报告"
						>
							📄 导出报告
						</button>
						<div class="export-dropdown hidden" id="exportDropdown">
							<button type="button" class="export-option" data-format="html">
								📄 HTML 文件 (.html)
							</button>
							<button type="button" class="export-option" data-format="pdf">
								📕 PDF 文件 (.pdf)
							</button>
						</div>
					</div>
				</div>
```

保持其余部分不变。

- [ ] **步骤 2：检查 HTML 标签配对**

运行：`grep -n "results-header\|exportDropdown\|exportBtn" index.html`
预期：能看到新增的 `.results-header`、`exportBtn`、`exportDropdown` 三处。

- [ ] **步骤 3：Commit**

```bash
git add index.html
git commit -m "feat: 统计结果页新增导出报告按钮和格式下拉"
```

---

## 任务 4：styles.css — 导出按钮和下拉样式

**文件：**
- 修改：`styles.css`（末尾追加）

- [ ] **步骤 1：追加样式**

在 `styles.css` 末尾追加：

```css
/* ===== 导出报告 ===== */
.results-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
}
.results-header h2 {
	margin: 0;
}
.export-actions {
	position: relative;
}
.btn-export {
	background: #409eff;
	border-color: #409eff;
	color: #fff;
}
.btn-export:hover {
	background: #66b1ff;
	border-color: #66b1ff;
}
.export-dropdown {
	position: absolute;
	top: calc(100% + 4px);
	right: 0;
	z-index: 100;
	min-width: 180px;
	background: #fff;
	border: 1px solid #e4e7ed;
	border-radius: 6px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
	padding: 4px;
}
.export-dropdown .export-option {
	display: block;
	width: 100%;
	text-align: left;
	padding: 8px 12px;
	font-size: 13px;
	color: #606266;
	background: none;
	border: none;
	border-radius: 4px;
	cursor: pointer;
}
.export-dropdown .export-option:hover {
	background: #f0f7ff;
	color: #409eff;
}
```

- [ ] **步骤 2：Commit**

```bash
git add styles.css
git commit -m "feat: 导出报告按钮和下拉菜单样式"
```

---

## 任务 5：renderer.js — 导出逻辑

**文件：**
- 修改：`renderer.js`（末尾追加）

需读取的已有变量/函数：`queryResult`（line 544）、`filteredCommits`（line 545）、`lineChart`/`barChart`/`pieChart`（line 670/671/2651）、`connectionConfig`（line 87）、`escapeHtml()`（已有）、`showStatus()`（line 1366）。

- [ ] **步骤 1：追加导出相关函数**

在 `renderer.js` 末尾追加：

```javascript
// ====================== 导出报告 ======================
// 切换导出格式下拉菜单
function toggleExportDropdown() {
  const dropdown = document.getElementById('exportDropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('hidden');
}

// 组装独立 HTML 报告文档
function buildReportHTML() {
  if (!queryResult) return '';

  const r = queryResult;
  const vcs = connectionConfig.vcs || '';
  const vcsLabel = vcs === 'git' ? 'Git' : (vcs === 'mixed' ? 'SVN + Git 混合' : 'SVN');
  const now = new Date();
  const timeRange = getQueryTimeRangeText();

  // 图表截图（白色背景，2x 分辨率）
  const chartSvg = (chart) => (chart ? chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }) : '');

  // 汇总统计卡片
  const summaryCards = `
    <div class="summary-cards">
      <div class="summary-card"><div class="card-label">提交次数</div><div class="card-value">${r.totalCommits || 0}</div></div>
      <div class="summary-card added"><div class="card-label">新增行</div><div class="card-value">${r.totalAdded || 0}</div></div>
      <div class="summary-card deleted"><div class="card-label">删除行</div><div class="card-value">${r.totalDeleted || 0}</div></div>
      <div class="summary-card net"><div class="card-label">净增行</div><div class="card-value">${r.netLines !== undefined ? r.netLines : ((r.totalAdded || 0) - (r.totalDeleted || 0))}</div></div>
    </div>
    <div class="summary-cards small">
      <div class="summary-card warn"><div class="card-label">超阈值提交</div><div class="card-value">${r.overThresholdCount || 0}</div></div>
      <div class="summary-card info"><div class="card-label">格式化提交</div><div class="card-value">${r.formatCodeCount || 0}</div></div>
      <div class="summary-card info"><div class="card-label">活跃天数</div><div class="card-value">${Array.isArray(r.activeDays) ? r.activeDays.length : (r.activeDays || 0)}</div></div>
    </div>`;

  // 各项目统计表
  let projectRows = '';
  const projectSource = { ...(r.projectStats || {}), ...(r.branchStats || {}) };
  for (const [name, ps] of Object.entries(projectSource)) {
    projectRows += `<tr>
      <td>${escapeHtml(name)}</td>
      <td>${ps.totalCommits || 0}</td>
      <td>${ps.totalAdded || 0}</td>
      <td>${ps.totalDeleted || 0}</td>
      <td>${(ps.totalAdded || 0) - (ps.totalDeleted || 0)}</td>
      <td>${ps.commitTypeStats && ps.commitTypeStats.feat ? ps.commitTypeStats.feat : 0}</td>
      <td>${ps.commitTypeStats && ps.commitTypeStats.fix ? ps.commitTypeStats.fix : 0}</td>
      <td>${((ps.totalCommits || 0) - ((ps.commitTypeStats && ps.commitTypeStats.feat) || 0) - ((ps.commitTypeStats && ps.commitTypeStats.fix) || 0))}</td>
    </tr>`;
  }
  const projectSection = projectRows
    ? `<h3>各项目代码量统计</h3>
    <table class="report-table">
      <thead><tr><th>项目名称</th><th>提交次数</th><th>新增行</th><th>删除行</th><th>净增行</th><th>feat</th><th>fix</th><th>其他</th></tr></thead>
      <tbody>${projectRows}</tbody>
    </table>`
    : '';

  // 图表区
  const chartsSection = `
    <h3>统计图表</h3>
    <div class="chart-img">
      <h4>提交类型分布</h4><img src="${chartSvg(pieChart)}" alt="提交类型分布" />
    </div>
    <div class="chart-img">
      <h4>每日提交次数</h4><img src="${chartSvg(barChart)}" alt="每日提交次数" />
    </div>
    <div class="chart-img">
      <h4>每日代码变化趋势</h4><img src="${chartSvg(lineChart)}" alt="每日代码变化趋势" />
    </div>`;

  // 提交记录明细（当前筛选结果）
  const commits = filteredCommits.length ? filteredCommits : (r.commits || []);
  let commitRows = '';
  for (const c of commits) {
    const typeLabel = c.commitType || 'other';
    const statusMap = { normal: '正常', over: '超阈值', format: '格式化代码' };
    const branchLabel = c.branch ? (c.repoName ? `${c.repoName}/${c.branch}` : c.branch) : (c.project || '-');
    commitRows += `<tr>
      <td>${escapeHtml(branchLabel)}</td>
      <td>${escapeHtml(c.revision || c.fullHash || '')}</td>
      <td>${escapeHtml(c.date || '')}</td>
      <td>${escapeHtml(c.author || '')}</td>
      <td><span class="type-tag">${escapeHtml(typeLabel)}</span></td>
      <td class="msg">${escapeHtml(c.message || '')}</td>
      <td class="num added">+${c.added || 0}</td>
      <td class="num deleted">-${c.deleted || 0}</td>
      <td class="num">${c.net !== undefined ? c.net : ((c.added || 0) - (c.deleted || 0))}</td>
      <td>${statusMap[c.status] || '正常'}</td>
    </tr>`;
  }
  const commitsSection = `
    <h3>提交记录明细（${commits.length} 条）</h3>
    <table class="report-table commits">
      <thead><tr><th>项目/分支</th><th>版本号</th><th>日期</th><th>作者</th><th>类型</th><th>提交信息</th><th>新增</th><th>删除</th><th>净增</th><th>状态</th></tr></thead>
      <tbody>${commitRows}</tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>代码统计报告</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; color: #303133; background: #fff; padding: 32px; line-height: 1.6; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .subtitle { color: #909399; font-size: 13px; margin-bottom: 24px; }
  h3 { font-size: 16px; margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #409eff; }
  h4 { font-size: 14px; margin: 12px 0 6px; color: #606266; }
  .summary-cards { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .summary-cards.small .summary-card { flex: 1; min-width: 140px; }
  .summary-card { flex: 1; min-width: 160px; background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 8px; padding: 14px 16px; text-align: center; }
  .summary-card .card-label { font-size: 12px; color: #909399; }
  .summary-card .card-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .summary-card.added .card-value { color: #67c23a; }
  .summary-card.deleted .card-value { color: #f56c6c; }
  .summary-card.net .card-value { color: #409eff; }
  .summary-card.warn .card-value { color: #e6a23c; }
  .summary-card.info .card-value { color: #409eff; }
  .report-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
  .report-table th, .report-table td { border: 1px solid #e4e7ed; padding: 8px 10px; text-align: left; }
  .report-table th { background: #f5f7fa; font-weight: 600; white-space: nowrap; }
  .report-table tbody tr:nth-child(even) { background: #fafafa; }
  .report-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .report-table .num.added { color: #67c23a; }
  .report-table .num.deleted { color: #f56c6c; }
  .report-table .msg { max-width: 320px; word-break: break-all; }
  .type-tag { display: inline-block; background: #ecf5ff; color: #409eff; border-radius: 3px; padding: 1px 6px; font-size: 12px; }
  .chart-img { margin-bottom: 16px; text-align: center; }
  .chart-img img { max-width: 100%; border: 1px solid #e4e7ed; border-radius: 6px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e4e7ed; color: #909399; font-size: 12px; text-align: center; }
  @media print { body { padding: 16px; } .chart-img img { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>代码统计报告</h1>
  <div class="subtitle">数据来源：${escapeHtml(vcsLabel)} ｜ 统计周期：${escapeHtml(timeRange)} ｜ 生成时间：${now.toLocaleString('zh-CN')}</div>
  ${summaryCards}
  ${projectSection}
  ${chartsSection}
  ${commitsSection}
  <div class="footer">由代码统计工具自动生成</div>
</body>
</html>`;
}

// 生成时间范围文案（与查询模式联动）
function getQueryTimeRangeText() {
  const mode = document.getElementById('queryMode');
  const modeVal = mode ? mode.value : 'month';
  if (modeVal === 'custom') {
    const s = document.getElementById('startDate');
    const e = document.getElementById('endDate');
    if (s && e && s.value && e.value) return `${s.value} 至 ${e.value}`;
  }
  if (modeVal === 'quarter') {
    const display = document.getElementById('quarterDisplay');
    if (display && display.value) return display.value;
  }
  const display = document.getElementById('monthDisplay');
  return (display && display.value) ? display.value : '';
}

// 导出报告主流程
async function exportReport(format) {
  if (!queryResult) {
    alert('暂无统计数据，请先完成查询');
    return;
  }
  toggleExportDropdown();
  const html = buildReportHTML();
  if (!html) {
    alert('报告生成失败');
    return;
  }
  const result = await window.exportAPI.saveReport(html, format);
  if (result && result.canceled) return;
  if (result && result.success) {
    alert(`报告已导出：${result.filePath}`);
  } else {
    alert(`导出失败：${result.error || '未知错误'}`);
  }
}

// 绑定导出按钮和下拉事件
document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = document.getElementById('exportBtn');
  const dropdown = document.getElementById('exportDropdown');
  if (!exportBtn || !dropdown) return;

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportDropdown();
  });

  dropdown.querySelectorAll('.export-option').forEach(option => {
    option.addEventListener('click', () => {
      exportReport(option.dataset.format);
    });
  });

  // 点击外部关闭下拉
  document.addEventListener('click', (event) => {
    const actions = document.querySelector('.export-actions');
    if (actions && !actions.contains(event.target)) {
      dropdown.classList.add('hidden');
    }
  });
});
```

- [ ] **步骤 2：确认 escapeHtml 已存在**

运行：`grep -n "function escapeHtml" renderer.js`
预期：能匹配到已存在的 `function escapeHtml` 定义。若未匹配，需在 `buildReportHTML()` 上方补一个：

```javascript
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

- [ ] **步骤 3：语法检查**

运行：`node --check renderer.js`
预期：无输出，退出码 0。

- [ ] **步骤 4：Commit**

```bash
git add renderer.js
git commit -m "feat: 实现导出报告逻辑（收集数据、图表截图、组装 HTML）"
```

---

## 任务 6：手动验证

**文件：** 无（运行验证）

- [ ] **步骤 1：启动应用做冒烟测试**

运行：`npm start`（开发模式）

手动操作：
1. 切换 VCS 到 SVN，配置项目/账号，查询一个月份的数据
2. 结果页出现"📄 导出报告"按钮
3. 点击按钮 → 下拉出现 HTML / PDF 两个选项
4. 选 HTML → 保存对话框出现 → 保存 → 弹窗提示导出成功
5. 用浏览器打开导出的 HTML，确认标题、汇总卡片、项目统计表、三张图表图片、提交明细表、页脚时间戳均完整
6. 再选 PDF → 保存 → 打开 PDF 确认排版正常
7. 点击页面其他区域，确认下拉菜单自动关闭

预期：以上 7 步全部正常。

- [ ] **步骤 2：记录验证结果**

若发现问题，按 systematic-debugging 流程排查修复后再验证。

---

## 自检结果

**规格覆盖度：**
- ✅ 触发入口（结果标题旁按钮）→ 任务 3
- ✅ 格式选择（HTML/PDF）→ 任务 3（下拉）+ 任务 1/2
- ✅ HTML 直接写入 → 任务 2
- ✅ PDF printToPDF → 任务 2
- ✅ 汇总/异常统计 → 任务 5（summaryCards）
- ✅ 各项目统计表 → 任务 5（projectSection）
- ✅ 图表截图 → 任务 5（chartSvg）
- ✅ 提交明细 → 任务 5（commitsSection）
- ✅ 时间戳 → 任务 5（footer + subtitle）

**占位符扫描：** 无 TODO/待定项；每个代码步骤都含完整代码。

**类型一致性：** `window.exportAPI.saveReport(html, format)` 三处一致（preload 定义 / main 接收 / renderer 调用）；IPC 名 `export-save-report` 三处一致；`queryResult`、`filteredCommits`、`lineChart`/`barChart`/`pieChart` 均与 renderer.js 已有声明一致。
