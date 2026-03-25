# 代码统计工具 (CodeNumTool)

## 项目概述

基于 Electron 的桌面应用程序，用于统计 SVN / Git / GitLab 仓库中指定用户的代码提交情况，并集成 AI 大模型代码审查能力。

## 技术栈

- **Electron**: 桌面应用框架
- **ECharts**: 图表可视化
- **iconv-lite**: 字符编码转换（处理 SVN 命令输出的中文 GBK 编码）
- **fs-extra**: 增强的文件操作（临时目录管理）
- **原生 HTML/CSS/JS**: 前端界面（仿 Element UI 风格手写组件）

## 项目结构

```
codeNumTool/
├── main.js          # Electron 主进程：VCS 命令、GitLab API、AI 审查
├── preload.js       # 预加载脚本：通过 contextBridge 暴露 API
├── renderer.js      # 渲染进程：前端交互逻辑
├── index.html       # 主界面 HTML
├── styles.css       # 样式文件（仿 Element UI 主题）
├── package.json     # 项目配置
└── node_modules/    # 依赖包
```

## 核心功能

### 1. 多仓库类型支持
- **SVN**：支持多项目同时统计
- **GitLab API**：通过 Personal Access Token 调用 REST API
- **本地 Git**：直接扫描本地仓库的 `.git` 目录
- **SSH 远程 Git**：克隆到临时目录统计后自动清理

### 2. 多种时间查询模式

通过页面顶部模式按钮切换，前端统一转换为 `{ startDate, endDate }` 传后端：

| 模式 | 说明 |
|------|------|
| 按月 | 自定义月份弹窗（仿 Element DatePicker，非原生控件）|
| 按季度 | 自定义季度弹窗（Q1～Q4），自动换算日期区间 |
| 自定义 | 自由选取起止日期（`input[type=date]`）|

### 3. 代码统计指标
- 新增行数、删除行数、净增行数
- 提交次数、活跃天数
- 提交类型分布（feat / fix / refactor / style / docs / test / chore / perf / ci / build）

### 4. 阈值检测
- **超阈值提交**：单次提交超过设定阈值（默认 500 行）
- **格式化代码**：变化量超过格式化阈值（默认 200 行）且新增/删除行数差异 ≤ 20%

### 5. 分支多选（Git 模式）
仿 Element UI 多选下拉框，支持标签展示、搜索过滤、折叠交互。

### 6. Diff 查看器
每条提交记录可点击查看完整代码差异：
- 文件列表 + 状态徽标（新增/删除/修改/重命名/二进制）
- 行号显示、新增（绿）/ 删除（红）高亮
- 超过 2000 行变更时提示警告

### 7. AI 代码审查

集成大模型 API 对提交的代码变更进行审查。

- **单条审查**：每行 🔍 按钮 / Diff 弹窗中「AI审查」按钮
- **批量审查**：勾选多条提交后点击「批量AI审查」

**8 个可配置审查维度（默认全选，持久化到 localStorage）：**

| 维度 key | 描述 |
|----------|------|
| `codeStyle` | 代码规范（命名、格式、注释）|
| `potentialBugs` | 潜在 Bug（空值、边界、异步、内存泄漏）|
| `security` | 安全问题（XSS、硬编码密钥、输入验证）|
| `performance` | 性能优化（频繁 DOM、重复计算、懒加载）|
| `bestPractices` | 最佳实践（复用、模块化、可维护性）|
| `testability` | 可测试性与架构设计（耦合、纯函数比例）|
| `frameworkFeatures` | 现代框架特性（Hooks 误用、多余重渲染）|
| `ux` | 用户体验与无障碍（错误UI、防抖、A11y）|

Prompt 根据勾选维度动态拼装，兼容 OpenAI / Ollama 接口格式。

### 8. 可视化
- 每日代码变化趋势折线图
- 每日提交次数柱状图（ECharts）

## API 接口

### preload.js 暴露的 API

```javascript
window.svnAPI.login(projects, username, password)
window.svnAPI.getStats(projects, username, password, author, year, month, threshold, formatThreshold, startDate, endDate)
window.svnAPI.getDiff({ projectUrl, revision, username, password })

window.gitlabAPI.gitlabLogin({ gitlabUrl, projects })
window.gitlabAPI.getBranches(projectUrl)
window.gitlabAPI.gitlabGetStats({ ...params, startDate, endDate })
window.gitlabAPI.apiLogin({ gitlabUrl, token, projectId })
window.gitlabAPI.apiGetBranches({ gitlabUrl, token, projectId })
window.gitlabAPI.apiGetStats({ ...params, startDate, endDate })
window.gitlabAPI.selectLocalRepo()
window.gitlabAPI.localGetStats({ ...params, startDate, endDate })
window.gitlabAPI.testSshConnection(repoUrl)
window.gitlabAPI.sshGetStats({ ...params, startDate, endDate })
window.gitlabAPI.localGetDiff({ repoPath, commitHash })
window.gitlabAPI.sshGetDiff({ repoUrl, commitHash })
window.gitlabAPI.apiGetDiff({ gitlabUrl, token, projectId, commitHash })

window.codeReviewAPI.review({ apiUrl, model, authorization, dimensions, diffData })
window.codeReviewAPI.batchReview({ apiUrl, model, authorization, dimensions, commits })
```

## 主要文件说明

### main.js
- `runSvnCommand(cmd)` / `runCommand(cmd)`: 执行 VCS 命令（含 GBK↔UTF-8 自动转码）
- `parseCommitType(message)`: 解析提交类型前缀
- `getCommitStatus(added, deleted, threshold, formatThreshold)`: 判断提交状态
- `getCodeReviewPrompt(dimensions[])`: 根据选中维度动态组装单次审查 Prompt
- `getBatchCodeReviewPrompt(dimensions[])`: 批量审查 Prompt
- `callLLMApi(apiUrl, model, authorization, prompt)`: HTTP 调用大模型 API
- `formatDiffForReview(diffData)`: 将 diff 数据格式化为可读文本
- IPC Handlers：所有 `svn-*`, `gitlab-*`, `git-*`, `code-review`, `batch-code-review`

### renderer.js
- 三种查询模式切换及自定义日期弹窗组件
- 仿 Element UI 的分支多选下拉组件（`branchCustomSelect`）
- 登录、查询、筛选、分页逻辑
- Diff 弹窗渲染
- AI 审查弹窗（单次 + 批量）
- ECharts 图表渲染
- AI 配置（含维度）读写 `localStorage`

### styles.css
- 仿 Element UI 全局配色（`#409eff`）、圆角、阴影
- 自定义日期弹窗 `.el-picker-panel`、月份表格 `.el-month-table`
- 自定义下拉组件样式
- 细长圆角全局滚动条
- 提交类型/状态标签、表格、分页样式

## 运行命令

```bash
npm install     # 安装依赖
npm start       # 开发运行
npm run build   # 打包 Windows NSIS 安装包
```

## 注意事项

1. **SVN 客户端依赖**：需要系统安装 SVN 命令行工具并配置 PATH
2. **Git 客户端依赖**：Git 模式需要安装 Git 并配置 SSH Key（SSH 模式）
3. **字符编码**：Windows 下 SVN 输出使用 GBK 编码，自动转换
4. **大仓库性能**：每次提交都执行 `svn diff` / `git show`，提交量大时查询较慢
5. **打包权限**：electron-builder 打包需要 Windows 开发者模式或以管理员身份运行

## 已完成功能 / 待优化项

**已完成：**
- [x] 按月 / 按季度 / 自定义日期范围查询
- [x] SVN / GitLab API / 本地 Git / SSH Git 多仓库支持
- [x] Diff 查看器
- [x] AI 代码审查（单条、批量、维度可配置）
- [x] 仿 Element UI 全局视觉改造
- [x] 分支多选下拉组件

**待优化：**
- [ ] 查询进度条
- [ ] 导出统计报告（Excel/PDF）
- [ ] 查询结果缓存
- [ ] 多用户对比统计
