# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Guidelines

### Documentation Requirements

**重要：每次完成新功能或重要修改后，必须同步更新本文档：**

1. 新增 IPC Handler → 更新 "IPC Handlers Reference" 表格
2. 修改数据结构 → 更新 "Key Data Structures" 部分
3. 新增功能模块 → 添加功能说明章节
4. 修改依赖 → 更新 "Dependencies" 部分
5. 修改架构 → 更新 "Architecture" 部分

### Code Style

- 使用中文注释说明业务逻辑
- IPC handler 命名格式：`模块-动作` (如 `svn-get-diff`, `gitlab-api-login`)
- 前端函数使用驼峰命名 (如 `viewCommitDiff`, `renderDiffContent`)

## Project Overview

SVN/Git 代码提交统计工具 - 基于 Electron 的桌面应用，用于从 SVN 和 Git/GitLab 仓库统计分析代码提交记录。

## Commands

```bash
# 安装依赖
npm install

# 开发模式运行
npm start

# 构建生产版本（Windows NSIS 安装包）
npm run build
```

## Architecture

### Process Model (Electron)

- **主进程** (`main.js`): 通过子进程执行处理所有 VCS 操作
  - SVN 命令通过 `svn` CLI 和 GBK 编码转换（Windows）
  - Git 命令通过 `git` CLI 进行本地/SSH 仓库扫描
  - GitLab API 请求通过原生 `http`/`https` 模块
  - IPC handlers: `svn-login`, `svn-stats`, `gitlab-login`, `gitlab-stats`, `gitlab-api-*`, `gitlab-local-stats`, `test-ssh-connection`, `gitlab-ssh-stats`, `code-review`, `batch-code-review`, `export-save-report`
  - Prompt 组装: `getCodeReviewPrompt(dimensions)` / `getBatchCodeReviewPrompt(dimensions)` 根据选中的维度键动态构建 prompt

- **预加载脚本** (`preload.js`): 通过 context bridge 向渲染进程暴露 `window.svnAPI`、`window.gitlabAPI` 和 `window.codeReviewAPI`

- **渲染进程** (`renderer.js` + `index.html`): 使用原生 JS 和 ECharts 进行可视化 UI 逻辑

### Data Flow

1. 用户在登录卡片中配置项目/仓库
2. 主进程通过 CLI 命令或 API 调用验证连接
3. 用户选择查询模式（月/季度/自定义日期范围）然后触发统计查询
4. 统计查询按版本检索提交日志和 diff
5. 结果按项目/分支聚合，每天细分开
6. 通过 ECharts 渲染图表（折线图、柱状图、饼图）

### Key Data Structures

**Commit Record:**
```javascript
{
  project, revision, date, author, message,
  commitType,  // feat|fix|refactor|style|docs|test|chore|perf|ci|build|other
  added, deleted, net,
  status,      // normal|over|format
  fullHash,    // Full commit hash for Git modes (used for diff retrieval)
  projectUrl,  // Repository URL or path (used for diff retrieval)
  repoName,    // Git mode: repository name
  branch,      // Git mode: branch name
  source       // 'git' or 'svn' for mixed mode filtering
}
```

**Commit Status Detection:**
- `over`: 单次提交超过阈值（默认 500 行）
- `format`: 高变更量且 add/delete 比均衡（相似度 >=80%）

**ConnectionConfig Structure:**
```javascript
{
  vcs: 'svn' | 'git' | 'mixed',
  svn: {
    projects: [{ name, url, selected }],
    username: string,
    password: string
  },
  git: { repos: [] },
  threshold: number,
  formatThreshold: number
}
```

**GitRepo Structure:**
```javascript
{
  id, name, mode, url, path,
  branches: [],
  selectedBranches: Set
}
```

### Git/GitLab Modes

该工具支持多种 Git 访问方式：

1. **本地扫描** (`gitlab-local-stats`): 直接文件系统访问本地 `.git` 仓库
   - IPC: `select-local-repo`, `gitlab-local-stats`
   - 无需网络，从本地 .git 目录读取

2. **SSH 远程** (`test-ssh-connection`, `gitlab-ssh-stats`): 通过 SSH 克隆、扫描、然后清理临时目录
   - IPC: `test-ssh-connection`（验证连接并通过 `git ls-remote --heads` 获取分支）
   - IPC: `gitlab-ssh-stats`（克隆仓库到临时目录，扫描提交，清理）
   - 需要为 Git 服务器配置 SSH 密钥

3. **GitLab API** (`gitlab-api-stats`): REST API 和 Personal Access Token
   - IPC: `gitlab-api-login`, `gitlab-api-get-branches`, `gitlab-api-stats`
   - 需要具有 `read_api` 范围的 Personal Access Token

### Multi-Repo Mode

**Git Multi-Repo (`git-multi-stats`):**
支持多仓库多分支同时查询，所有仓库合并统计：
- 使用 `getLocalRepoStatsForMulti()` 和 `getSshRepoStatsForMulti()` 内部函数
- 每个仓库的 commits 带有 `repoId`、`repoName`、`branch` 字段便于前端筛选
- 返回 `repoBranchStats`（按仓库+分支索引）和 `branchStats`（扁平化 `repoName/branchName` 结构）

**Mixed Mode (`multi-stats`):**
SVN 和 Git 仓库混合查询，并行执行后合并结果：
- SVN 使用 `getSvnStats()`，Git 使用 `getGitMultiReposStats()`
- 合并时为 SVN commits 添加 `source: 'svn'` 和 `[SVN] ` 前缀
- Git commits 添加 `source: 'git'`
- 使用 `mergeMultiRepoResults()` 合并 `projectStats` 和 `branchStats`

### Diff Viewer Feature

提交记录表格每行都有"查看"按钮，用于显示代码差异：

- **模态对话框**显示文件变更，支持语法高亮
- **文件列表**带状态标签（新增/删除/修改/重命名/二进制）
- **Diff 内容**显示行号，新增（绿色），删除（红色）
- **统计显示**每个文件和 hunk 的 +additions/-deletions
- **大文件警告**对于超过 2000 行变更的提交
- **键盘支持**: ESC 关闭弹窗

**Diff Data Structure:**
```javascript
{
  files: [{
    oldPath, newPath,
    status,      // added|deleted|modified|renamed
    isBinary,    // true for binary files
    additions,   // total added lines in file
    deletions,   // total deleted lines in file
    hunks: [{
      oldStart, oldLines, newStart, newLines,
      context,   // function/class context from @@ line
      additions, // added lines in this hunk
      deletions, // deleted lines in this hunk
      changes: [{ type: 'add'|'del'|'normal', content }]
    }]
  }]
}
```

**注:** SVN 命令使用 GBK 编码（通过 `runSvnCommand`），Git 命令使用 UTF-8（通过 `runCommand`）。

### IPC Handlers Reference

| Handler | Description |
|---------|-------------|
| `svn-login` | 验证多个 SVN 项目的连接 |
| `svn-stats` | 获取 SVN 仓库的提交统计 |
| `svn-get-diff` | 获取指定 SVN 版本的 diff 内容 |
| `gitlab-login` | 验证 Git SSH 连接（旧版）|
| `gitlab-stats` | 通过 SSH 克隆获取统计（旧版）|
| `get-local-git-user` | 获取本地 git 配置的 user.name |
| `gitlab-get-branches` | 通过 `git ls-remote` 获取分支 |
| `test-ssh-connection` | 测试 SSH 连接并获取仓库信息和分支 |
| `gitlab-ssh-stats` | 通过 SSH 克隆到临时目录获取统计 |
| `git-ssh-get-diff` | 通过 SSH 克隆获取提交的 diff（部分克隆）|
| `select-local-repo` | 打开本地仓库目录选择器 |
| `gitlab-local-stats` | 从本地 git 仓库获取统计 |
| `git-local-get-diff` | 从本地 git 仓库获取提交的 diff |
| `gitlab-api-login` | 验证 GitLab API token |
| `gitlab-api-get-branches` | 通过 GitLab API 获取分支 |
| `gitlab-api-stats` | 通过 GitLab REST API 获取统计 |
| `gitlab-api-get-diff` | 通过 GitLab REST API 获取提交的 diff |
| `git-multi-stats` | 多仓库多分支 Git 统计（本地/SSH）|
| `multi-stats` | 混合 SVN+Git 多仓库统计 |
| `code-review` | 发送 diff 到 LLM API 进行代码审查（接受 `dimensions[]` 控制 prompt）|
| `batch-code-review` | 发送多个提交到 LLM API 进行批量代码审查（接受 `dimensions[]`）|
| `export-save-report` | 导出统计报告（HTML 直接写文件，PDF 用隐藏窗口 printToPDF 生成）|

### Query Modes

统计查询支持三种时间范围模式，通过页面顶部按钮切换：

| Mode | ID | Description |
|------|----|-------------|
| 按月 | `month` | 自定义月份弹窗选择器（代替原生 `input[type=month]`）|
| 按季度 | `quarter` | 自定义季度弹窗选择器（Q1～Q4），自动换算 startDate/endDate |
| 自定义 | `custom` | 两个 `input[type=date]` 自由选取起止日期 |

前端将所有模式统一转换为 `{ startDate, endDate }` 字符串传递给后端，后端优先使用传入值。

**Custom Date Picker Components (`renderer.js`):**
- `renderMonthDropdown()` / `updateMonthDisplay()`: 月份选择器面板渲染
- `renderQuarterDropdown()` / `updateQuarterDisplay()`: 季度选择器面板渲染
- 选择器面板通过 `document` 点击监听器自动关闭

### Export Report Feature

统计结果页标题栏提供"📄 导出报告"按钮，可将当前查询结果导出为 HTML 或 PDF 报告。

**导出流程：**
- `renderer.js`: `exportReport(format)` → `buildReportHTML()` 组装自包含 HTML（内嵌 CSS + 三张 ECharts 截图 base64 PNG + 汇总/异常统计卡片 + 项目统计表 + 提交明细表 + 页脚时间戳）
- `preload.js`: `window.exportAPI.saveReport(html, format)`
- `main.js`: `export-save-report` handler → 原生保存对话框；HTML 直接写文件，PDF 用隐藏 `BrowserWindow` 加载 `data:` URL 后 `printToPDF()` 生成

**报告数据范围：**
- 汇总统计默认用全量数据；选中某项目/分支 tab 时优先用该分组统计（`summarySource` 从 `branchStats`/`projectStats` 提取），图表与提交明细始终反映当前分组/筛选结果
- 副标题标注"数据范围"（全部项目/分支 或 当前分组）

### AI Code Review Feature

集成 AI 代码审查功能，支持将提交的代码变更发送给本地部署的大模型进行审查。

**配置项（登录页面）：**
- API 地址：大模型 API 端点（如 `http://localhost:11434/v1/chat/completions`）
- 模型名称：要使用的模型（如 `qwen2.5:7b`）
- API Key：Authorization header（Bearer token 或留空）
- 审查维度：8 个可独立勾选的复选框，默认全选，配置持久化至 `localStorage`

**支持的审查维度 (`dimensions` 值):**

| 值 | 说明 |
|---|------|
| `codeStyle` | 代码规范（命名、格式、注释）|
| `potentialBugs` | 潜在 Bug（空值、边界、异步、内存泄漏）|
| `security` | 安全问题（XSS、硬编码密钥、输入验证）|
| `performance` | 性能优化（频繁 DOM、重复计算、懒加载）|
| `bestPractices` | 最佳实践（复用、模块化、可维护性）|
| `testability` | 可测试性与架构设计（耦合度、纯函数比例）|
| `frameworkFeatures` | 现代框架特性应用（Hooks 误用、多余重渲染）|
| `ux` | 用户体验与无障碍（错误UI、防抖、A11y）|

**审查入口：**
- 提交列表每行的 🔍 按钮（单条审查）
- Diff 弹窗头部的 "AI审查" 按钮
- 批量勾选提交后点击 "批量AI审查" 按钮

**API 格式：** 兼容 OpenAI Chat Completions API 和 Ollama 响应格式

**错误处理：** 自动检测并提示以下问题：
- API 返回 HTML 页面（地址错误）
- HTTP 非 200 状态码
- JSON 解析失败（显示响应内容预览）

### LocalStorage Caching

**缓存配置项：**
- `connectionConfig`: 完整连接配置（VCS类型、项目、账号等）
- `gitRepos`: Git 多仓库列表配置

**缓存恢复时机：**
- 页面加载时 `loadCachedConfig()` 自动恢复
- 登录页项目列表、Git仓库卡片、用户名密码均可从缓存恢复

**缓存清理：**
- 取消勾选"记住配置"时清除 localStorage

## Dependencies

- `iconv-lite`: Windows SVN 输出的 GBK 转 UTF-8
- `echarts`: 图表可视化
- `fs-extra`: 临时目录管理的增强文件操作

## Notes

- SVN CLI 必须安装并在 PATH 中可用
- Git 模式需要 Git CLI
- SVN 命令输出自动处理 Windows GBK 编码
- 大仓库可能因每个提交的 `svn diff` 或 `git show` 执行而变慢
- SSH 模式需要正确配置 SSH 密钥（`~/.ssh/id_rsa` 或 ssh-agent）
- 构建需要启用 Windows 开发人员模式或以管理员身份运行（用于 electron-builder 缓存提取期间的符号链接创建）

<!-- superpowers-zh:begin (do not edit between these markers) -->
# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架（20 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.claude/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文 review 沟通参考——话术模板、分级标注（必须修复/建议修改/仅供参考）、国内团队常见反模式应对。仅在用户显式 /chinese-code-review 时调用，不要根据上下文自动触发。
- **chinese-commit-conventions**: 中文 commit 与 changelog 配置参考——Conventional Commits 中文适配、commitlint/husky/commitizen 中文模板、conventional-changelog 中文配置。仅在用户显式 /chinese-commit-conventions 时调用，不要根据上下文自动触发。
- **chinese-documentation**: 中文文档排版参考——中英文空格、全半角标点、术语保留、链接格式、中文文案排版指北约定。仅在用户显式 /chinese-documentation 时调用，不要根据上下文自动触发。
- **chinese-git-workflow**: 国内 Git 平台配置参考——Gitee、Coding.net、极狐 GitLab、CNB 的 SSH/HTTPS/凭据/CI 接入差异与镜像同步配置。仅在用户显式 /chinese-git-workflow 时调用，不要根据上下文自动触发。
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾。
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发或执行实现计划之前使用——创建具有智能目录选择和安全验证的隔离 git 工作树
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
<!-- superpowers-zh:end -->