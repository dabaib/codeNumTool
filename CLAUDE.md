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

SVN/Git 代码提交统计工具 - An Electron desktop application for analyzing code commit statistics from SVN and Git/GitLab repositories.

## Commands

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for production (Windows NSIS installer)
npm run build
```

## Architecture

### Process Model (Electron)

- **Main Process** (`main.js`): Handles all VCS operations via child process execution
  - SVN commands via `svn` CLI with GBK encoding conversion (Windows)
  - Git commands via `git` CLI for local/SSH repository scanning
  - GitLab API requests via native `http`/`https` modules
  - IPC handlers: `svn-login`, `svn-stats`, `gitlab-login`, `gitlab-stats`, `gitlab-api-*`, `gitlab-local-stats`, `test-ssh-connection`, `gitlab-ssh-stats`, `code-review`, `batch-code-review`
  - Prompt assembly: `getCodeReviewPrompt(dimensions)` / `getBatchCodeReviewPrompt(dimensions)` dynamically builds prompt based on selected dimension keys

- **Preload Script** (`preload.js`): Exposes `window.svnAPI`, `window.gitlabAPI`, and `window.codeReviewAPI` to renderer via context bridge

- **Renderer Process** (`renderer.js` + `index.html`): UI logic using vanilla JS and ECharts for visualization

### Data Flow

1. User configures projects/repositories in login card
2. Main process validates connections via CLI commands or API calls
3. User selects query mode (month / quarter / custom date range) then triggers stats query
4. Statistics query retrieves commit logs and diffs per revision
5. Results aggregated by project/branch with daily breakdowns
6. Charts rendered via ECharts (line chart, bar chart, pie chart)

### Key Data Structures

**Commit Record:**
```javascript
{
  project, revision, date, author, message,
  commitType,  // feat|fix|refactor|style|docs|test|chore|perf|ci|build|other
  added, deleted, net,
  status,      // normal|over|format
  fullHash,    // Full commit hash for Git modes (used for diff retrieval)
  projectUrl   // Repository URL or path (used for diff retrieval)
}
```

**Commit Status Detection:**
- `over`: Single commit exceeds threshold (default 500 lines)
- `format`: High change volume with balanced add/delete ratio (>=80% similarity)

### Git/GitLab Modes

The tool supports multiple Git access methods:

1. **Local scan** (`gitlab-local-stats`): Direct file system access to local `.git` repos
   - IPC: `select-local-repo`, `gitlab-local-stats`
   - No network required, reads from local .git directory

2. **SSH remote** (`test-ssh-connection`, `gitlab-ssh-stats`): Clone via SSH, scan, then cleanup temp directory
   - IPC: `test-ssh-connection` (validates connection and fetches branches via `git ls-remote --heads`)
   - IPC: `gitlab-ssh-stats` (clones repo to temp dir, scans commits, cleans up)
   - Requires SSH key configured for the Git server

3. **GitLab API** (`gitlab-api-stats`): REST API with Personal Access Token
   - IPC: `gitlab-api-login`, `gitlab-api-get-branches`, `gitlab-api-stats`
   - Requires Personal Access Token with `read_api` scope

### Diff Viewer Feature

The commits table includes a "查看" (View) button for each commit to display code differences:

- **Modal dialog** shows file changes with syntax highlighting
- **File list** with status badges (新增/删除/修改/重命名/二进制)
- **Diff content** with line numbers, additions (green), deletions (red)
- **Statistics display** showing +additions/-deletions for each file and hunk
- **Large file warning** for commits with >2000 lines of changes
- **Keyboard support**: ESC to close modal

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

**Note:** SVN commands use GBK encoding (via `runSvnCommand`), Git commands use UTF-8 (via `runCommand`).

### IPC Handlers Reference

| Handler | Description |
|---------|-------------|
| `svn-login` | Validate SVN connection for multiple projects |
| `svn-stats` | Get commit statistics from SVN repositories |
| `svn-get-diff` | Get diff content for a specific SVN revision |
| `gitlab-login` | Validate Git SSH connection (legacy) |
| `gitlab-stats` | Get stats via SSH clone (legacy) |
| `get-local-git-user` | Get local git config user.name |
| `gitlab-get-branches` | Get branches via `git ls-remote` |
| `test-ssh-connection` | Test SSH connection and get repo info/branches |
| `gitlab-ssh-stats` | Get stats via SSH clone to temp directory |
| `git-ssh-get-diff` | Get diff for a commit via SSH clone (partial clone) |
| `select-local-repo` | Open directory picker for local repo |
| `gitlab-local-stats` | Get stats from local git repository |
| `git-local-get-diff` | Get diff for a commit from local git repository |
| `gitlab-api-login` | Validate GitLab API token |
| `gitlab-api-get-branches` | Get branches via GitLab API |
| `gitlab-api-stats` | Get stats via GitLab REST API |
| `gitlab-api-get-diff` | Get diff for a commit via GitLab REST API |
| `code-review` | Send diff to LLM API for code review (accepts `dimensions[]` to control prompt) |
| `batch-code-review` | Send multiple commits to LLM API for batch code review (accepts `dimensions[]`) |

### Query Modes

统计查询支持三种时间范围模式，通过页面顶部按钮切换：

| Mode | ID | Description |
|------|----|-------------|
| 按月 | `month` | 自定义月份弹窗选择器 (代替原生 `input[type=month]`) |
| 按季度 | `quarter` | 自定义季度弹窗选择器（Q1～Q4），自动换算 startDate/endDate |
| 自定义 | `custom` | 两个 `input[type=date]` 自由选取起止日期 |

前端将所有模式统一转换为 `{ startDate, endDate }` 字符串传递给后端，后端优先使用传入值。

**Custom Date Picker Components (`renderer.js`):**
- `renderMonthDropdown()` / `updateMonthDisplay()`: month picker panel rendering
- `renderQuarterDropdown()` / `updateQuarterDisplay()`: quarter picker panel rendering
- Picker panels auto-close on outside click via `document` click listener

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

## Dependencies

- `iconv-lite`: GBK to UTF-8 conversion for Windows SVN output
- `echarts`: Chart visualization
- `fs-extra`: Enhanced file operations for temp directory management

## Notes

- SVN CLI must be installed and available in PATH
- Git CLI required for Git modes
- Windows GBK encoding handled automatically for SVN command output
- Large repositories may be slow due to per-commit `svn diff` or `git show` execution
- SSH modes require proper SSH key configuration (`~/.ssh/id_rsa` or ssh-agent)
- Build requires Windows Developer Mode enabled OR run as Administrator (for symlink creation during electron-builder cache extraction)

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
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
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
