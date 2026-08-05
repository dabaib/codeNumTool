# 导出报告功能 - 设计规格

## 概述

为统计结果页新增 HTML/PDF 双格式报告导出功能。用户查询统计数据后，可将完整结果导出为 HTML 或 PDF 文件。

## 触发入口

- 统计结果卡片标题栏（"统计结果" `<h2>`）右侧新增 **"📄 导出报告"** 按钮
- 仅在查询成功、`#resultsCard` 显示且有数据时可见
- 按钮点击后弹出格式选择：HTML / PDF

## 数据流

```
用户点击导出按钮 → 选择格式 (HTML | PDF)
  → renderer.js: 收集当前数据 + ECharts 图表截图(canvas.toDataURL)
  → 组装完整 HTML 文档字符串
  → window.exportAPI.saveReport(htmlContent, format)
  → preload.js: ipcRenderer.invoke('export-save-report', htmlContent, format)
  → main.js:
      - dialog.showSaveDialog() 弹出原生保存对话框
      - HTML: fs.writeFileSync() 直接写入文件
      - PDF: 创建隐藏 BrowserWindow 加载 HTML → webContents.printToPDF() → fs.writeFileSync()
```

## 报告内容结构

按顺序包含以下区块：

1. **报告标题** — 项目名称 + 时间范围（如 "代码统计报告 - 2026年7月"）
2. **汇总统计卡片** — 提交次数、新增行、删除行、净增行
3. **异常统计** — 超阈值提交数、格式化代码数、活跃天数
4. **各项目统计表** — 与当前页面 `#projectStatsTable` 数据一致
5. **图表区** — ECharts 截图（base64 PNG）：
   - 提交类型分布饼图
   - 每日提交次数柱状图
   - 每日代码变化趋势折线图
6. **提交记录明细表** — 当前筛选状态下的提交列表
7. **页脚** — 生成时间戳

## 文件改动

### `index.html`
- `#resultsCard` 的 `<h2>` 内新增导出按钮 + 格式下拉：
  ```html
  <div class="export-actions">
    <button id="exportBtn" class="btn btn-small btn-export">📄 导出报告</button>
    <div class="export-dropdown hidden" id="exportDropdown">
      <button data-format="html">HTML 格式 (.html)</button>
      <button data-format="pdf">PDF 格式 (.pdf)</button>
    </div>
  </div>
  ```

### `renderer.js`
- 新增 `exportReport()` 函数：
  - 获取当前 `queryResult` 数据
  - 获取三个 ECharts 实例（`lineChart`、`barChart`、`pieChart`），调用 `getDataURL()` 截图
  - 调用 `buildReportHTML()` 组装完整 HTML 文档
- 新增 `buildReportHTML(data, chartImages)` 函数：
  - 使用模板字符串拼接 HTML
  - 汇总数据、项目统计表、图表图片、提交明细表
  - 内嵌 CSS 样式确保独立可读
- 新增 `toggleExportDropdown()` 切换格式选择菜单
- 导出按钮事件绑定（在 `setupEventListeners()` 或类似位置）

### `preload.js`
- `contextBridge.exposeInMainWorld('exportAPI', { saveReport })`
- `saveReport: (html, format) => ipcRenderer.invoke('export-save-report', html, format)`

### `main.js`
- 新增 IPC handler `export-save-report`：
  ```javascript
  ipcMain.handle('export-save-report', async (event, htmlContent, format) => {
    const ext = format === 'pdf' ? 'pdf' : 'html';
    const filters = format === 'pdf'
      ? [{ name: 'PDF 文件', extensions: ['pdf'] }]
      : [{ name: 'HTML 文件', extensions: ['html', 'htm'] }];
    
    const { filePath } = await dialog.showSaveDialog({
      title: '导出报告',
      defaultPath: `代码统计报告.${ext}`,
      filters
    });
    
    if (!filePath) return { success: false, canceled: true };
    
    if (format === 'pdf') {
      // 创建隐藏窗口渲染 HTML → printToPDF
      const win = new BrowserWindow({ show: false, width: 1200, height: 800 });
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      const pdfBuffer = await win.webContents.printToPDF({ printBackground: true });
      fs.writeFileSync(filePath, pdfBuffer);
      win.close();
    } else {
      fs.writeFileSync(filePath, htmlContent, 'utf-8');
    }
    
    return { success: true, filePath };
  });
  ```

### `styles.css`
- `.export-actions` 容器样式（右浮动，与标题同行）
- `.btn-export` 按钮样式
- `.export-dropdown` 下拉菜单样式

## 报告 HTML 样式规范

导出的 HTML 报告内嵌完整 CSS，不依赖外部资源：
- 白色背景，深色文字（适合打印）
- 表格带边框和斑马纹
- 统计卡片使用 Flexbox 布局
- 图表图片居中展示，自适应宽度
- 字体使用系统默认（`-apple-system, BlinkMacSystemFont, "Segoe UI", ...`）
- 打印友好（`@media print` 优化分页）

## 边界与约束

- ECharts 实例必须在查询后已渲染，导出前检查实例是否存在
- PDF 导出依赖 Electron 内置能力，无需 `puppeteer` 等额外依赖
- 隐藏 BrowserWindow 在 PDF 生成后立即关闭，避免资源泄漏
- 不修改现有数据结构，仅读取已有 `queryResult`、`allCommits` 等变量

## 变更范围汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `index.html` | 修改 | 新增导出按钮 + 下拉菜单 HTML |
| `renderer.js` | 修改 | 新增 `exportReport()`、`buildReportHTML()`、下拉菜单逻辑 |
| `preload.js` | 修改 | 新增 `exportAPI` context bridge |
| `main.js` | 修改 | 新增 `export-save-report` IPC handler |
| `styles.css` | 修改 | 新增导出按钮和下拉菜单样式 |
