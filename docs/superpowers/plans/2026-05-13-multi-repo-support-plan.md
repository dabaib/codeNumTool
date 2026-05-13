# 多仓库混合查询功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 支持同时查询 SVN 和 Git 仓库，在同一页面展示混合统计结果

**架构：** 改为 `connectionConfig.enabledModes` 数组支持多模式，引入 `multi-stats` IPC handler 并行查询后合并结果，每条 commit 添加 `source: 'svn'|'git'` 标识来源

**技术栈：** Electron IPC, JavaScript, ECharts

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `renderer.js` | UI 配置和结果展示 |
| `main.js` | IPC handlers，多仓库查询逻辑 |
| `preload.js` | 暴露 `multi-stats` API |
| `index.html` | 登录配置区结构（双区块） |
| `styles.css` | 来源标签样式 |

---

## 任务清单

### 任务 1：重构 connectionConfig 数据结构

**文件：**
- 修改：`renderer.js:76-100`

- [ ] **步骤 1：将 vcs 改为 enabledModes 数组**

```javascript
let connectionConfig = {
  enabledModes: [], // ['svn', 'git']
  svn: {
    projects: [],
    username: '',
    password: ''
  },
  git: {
    repos: [] // 每个仓库独立配置
  },
  threshold: 500,
  formatThreshold: 200,
  // AI 配置保持不变
  aiApiUrl: '',
  aiModel: '',
  aiApiKey: ''
};
```

- [ ] **步骤 2：更新获取项目的 getProjects 函数**

```javascript
function getProjects() {
  const projects = [];
  if (connectionConfig.enabledModes.includes('svn')) {
    const rows = projectList.querySelectorAll('.project-row');
    rows.forEach(row => {
      const name = row.querySelector('.project-name').value.trim();
      const url = row.querySelector('.project-url').value.trim();
      if (name && url) {
        projects.push({ name, url, type: 'svn' });
      }
    });
  }
  return projects;
}
```

- [ ] **步骤 3：Commit**

```bash
git add renderer.js
git commit -m "refactor: 重构 connectionConfig 为多模式支持"
```

---

### 任务 2：修改 UI 为双区块可折叠配置

**文件：**
- 修改：`renderer.js:102-130`
- 修改：`index.html`（添加折叠区块结构）

- [ ] **步骤 1：修改 VCS 切换逻辑，不再互斥**

```javascript
// 修改 vcsToggleButtons 逻辑：切换 enabledModes
vcsToggleButtons.forEach(button => {
  button.addEventListener('click', () => {
    const vcs = button.dataset.vcs;
    if (connectionConfig.enabledModes.includes(vcs)) {
      // 已启用则移除（至少保留一个）
      if (connectionConfig.enabledModes.length > 1) {
        connectionConfig.enabledModes = connectionConfig.enabledModes.filter(m => m !== vcs);
        button.classList.remove('active');
      }
    } else {
      // 未启用则添加
      connectionConfig.enabledModes.push(vcs);
      button.classList.add('active');
    }
    // 更新对应配置区块可见性
    updateConfigVisibility();
  });
});

function updateConfigVisibility() {
  const showSvn = connectionConfig.enabledModes.includes('svn');
  const showGit = connectionConfig.enabledModes.includes('git');

  if (svnAuthConfig) svnAuthConfig.classList.toggle('hidden', !showSvn);
  if (svnProjectConfig) svnProjectConfig.classList.toggle('hidden', !showSvn);
  if (gitlabProjectConfig) gitlabProjectConfig.classList.toggle('hidden', !showGit);
}
```

- [ ] **步骤 2：修改 login 函数支持多模式连接验证**

```javascript
async function doLogin() {
  // 获取配置
  const vcsType = vcsTypeInput.value;
  const threshold = parseInt(thresholdInput.value) || 3000;
  const formatThreshold = parseInt(formatThresholdInput.value) || 200;
  connectionConfig.threshold = threshold;
  connectionConfig.formatThreshold = formatThreshold;

  loginBtn.disabled = true;

  try {
    // SVN 登录验证
    if (connectionConfig.enabledModes.includes('svn')) {
      const projects = getSvnProjects();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      connectionConfig.svn.username = username;
      connectionConfig.svn.password = password;
      connectionConfig.svn.projects = projects;

      if (projects.length > 0) {
        showStatus(loginStatus, '正在连接 SVN 服务器...', 'loading');
        const result = await window.svnAPI.login(projects, username, password);
        if (result.success) {
          showStatus(loginStatus, 'SVN 连接成功', 'success');
        } else {
          showStatus(loginStatus, 'SVN 连接失败: ' + result.error, 'error');
        }
      }
    }

    // Git 登录验证（根据模式选择）
    if (connectionConfig.enabledModes.includes('git')) {
      // Git 连接验证逻辑...
    }

  } catch (error) {
    showStatus(loginStatus, '连接失败: ' + error.message, 'error');
  } finally {
    loginBtn.disabled = false;
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add renderer.js index.html
git commit -m "feat: UI 改为双区块可折叠配置，支持同时启用 SVN/Git"
```

---

### 任务 3：新增 multi-stats IPC handler

**文件：**
- 修改：`main.js`（新增 handler）
- 修改：`preload.js`（暴露 API）

- [ ] **步骤 1：在 main.js 末尾添加 multi-stats handler**

```javascript
// 多仓库混合查询
ipcMain.handle('multi-stats', async (event, config) => {
  const { svn, git, author, year, month, threshold, formatThreshold, startDate, endDate } = config;
  const results = { svn: null, git: null };

  const promises = [];

  // SVN 查询
  if (svn && svn.projects && svn.projects.length > 0) {
    promises.push((async () => {
      try {
        const result = await getSvnStats(svn.projects, svn.username, svn.password, author, year, month, threshold, formatThreshold, startDate, endDate);
        results.svn = result;
      } catch (e) {
        results.svn = { success: false, error: e.message };
      }
    })());
  }

  // Git 查询
  if (git && git.repos && git.repos.length > 0) {
    promises.push((async () => {
      try {
        const result = await getGitMultiReposStats(git.repos, author, year, month, threshold, formatThreshold, startDate, endDate);
        results.git = result;
      } catch (e) {
        results.git = { success: false, error: e.message };
      }
    })());
  }

  await Promise.all(promises);

  // 合并结果
  return mergeMultiRepoResults(results);
});

// 合并多仓库结果
function mergeMultiRepoResults(results) {
  const merged = {
    success: true,
    totalCommits: 0,
    totalAdded: 0,
    totalDeleted: 0,
    overThresholdCount: 0,
    formatCodeCount: 0,
    activeDays: new Set(),
    commitTypeStats: {},
    chartData: {},
    commits: [],
    projectStats: {},
    branchStats: {}
  };

  // 处理 SVN 结果
  if (results.svn && results.svn.success) {
    const svn = results.svn.data;
    for (const commit of svn.commits) {
      commit.source = 'svn';
      commit.project = '[SVN] ' + commit.project;
      merged.commits.push(commit);
    }
    merged.totalCommits += svn.totalCommits;
    merged.totalAdded += svn.totalAdded;
    merged.totalDeleted += svn.totalDeleted;
    merged.overThresholdCount += svn.overThresholdCount;
    merged.formatCodeCount += svn.formatCodeCount;
    for (const day of (svn.activeDays || [])) merged.activeDays.add(day);
    for (const [type, count] of Object.entries(svn.commitTypeStats || {})) {
      merged.commitTypeStats[type] = (merged.commitTypeStats[type] || 0) + count;
    }
    Object.assign(merged.projectStats, svn.projectStats || {});
    // 合并 chartData
    for (const day of svn.chartData || []) {
      const existing = merged.chartData[day.date];
      if (existing) {
        existing.added += day.added;
        existing.deleted += day.deleted;
        existing.commits += day.commits;
      } else {
        merged.chartData[day.date] = { ...day };
      }
    }
  }

  // 处理 Git 结果
  if (results.git && results.git.success) {
    const git = results.git.data;
    for (const commit of git.commits) {
      commit.source = 'git';
      commit.project = '[Git] ' + commit.project;
      merged.commits.push(commit);
    }
    merged.totalCommits += git.totalCommits;
    merged.totalAdded += git.totalAdded;
    merged.totalDeleted += git.totalDeleted;
    merged.overThresholdCount += git.overThresholdCount;
    merged.formatCodeCount += git.formatCodeCount;
    for (const day of (git.activeDays || [])) merged.activeDays.add(day);
    for (const [type, count] of Object.entries(git.commitTypeStats || {})) {
      merged.commitTypeStats[type] = (merged.commitTypeStats[type] || 0) + count;
    }
    Object.assign(merged.branchStats, git.branchStats || {});
    // 合并 chartData
    for (const day of git.chartData || []) {
      const existing = merged.chartData[day.date];
      if (existing) {
        existing.added += day.added;
        existing.deleted += day.deleted;
        existing.commits += day.commits;
      } else {
        merged.chartData[day.date] = { ...day };
      }
    }
  }

  merged.activeDays = Array.from(merged.activeDays);

  // 转换 chartData 为数组
  merged.chartData = Object.values(merged.chartData).sort((a, b) => a.date.localeCompare(b.date));

  return { success: true, data: merged };
}
```

- [ ] **步骤 2：在 preload.js 添加 multi-stats API 暴露**

```javascript
contextBridge.exposeInMainWorld('multiRepoAPI', {
  getStats: (config) => ipcRenderer.invoke('multi-stats', config)
});
```

- [ ] **步骤 3：Commit**

```bash
git add main.js preload.js
git commit -m "feat: 新增 multi-stats IPC handler 支持多仓库混合查询"
```

---

### 任务 4：修改 renderer.js 查询逻辑调用 multi-stats

**文件：**
- 修改：`renderer.js:740-800`

- [ ] **步骤 1：重写 doQuery 函数调用 multi-stats**

```javascript
async function doQuery() {
  const author = authorInput.value.trim();
  if (!author) {
    showStatus(queryStatus, '请输入作者', 'error');
    return;
  }

  const yearMonth = yearMonthInput.value;
  let year, month;
  if (queryModeInput.value === 'month' && yearMonth) {
    [year, month] = yearMonth.split('-').map(Number);
  }

  const startDateStr = customStartDate.value;
  const endDateStr = customEndDate.value;
  const threshold = connectionConfig.threshold || 500;
  const formatThreshold = connectionConfig.formatThreshold || 200;

  queryBtn.disabled = true;
  showStatus(queryStatus, '正在查询统计数据，请稍候...', 'loading');

  try {
    let result;

    if (connectionConfig.enabledModes.length === 1) {
      // 单模式：使用原有 API
      if (connectionConfig.enabledModes[0] === 'svn') {
        result = await window.svnAPI.getStats(...);
      } else {
        result = await window.gitlabAPI.localGetStats(...);
      }
    } else {
      // 多模式：使用 multi-stats
      const config = {
        author,
        year,
        month,
        threshold,
        formatThreshold,
        startDate: startDateStr,
        endDate: endDateStr
      };

      // SVN 配置
      if (connectionConfig.enabledModes.includes('svn')) {
        config.svn = {
          projects: connectionConfig.svn.projects,
          username: connectionConfig.svn.username,
          password: connectionConfig.svn.password
        };
      }

      // Git 配置
      if (connectionConfig.enabledModes.includes('git')) {
        config.git = {
          repos: connectionConfig.git.repos.map(repo => ({
            mode: repo.mode,
            name: repo.name,
            url: repo.url,
            path: repo.path,
            branches: repo.branches,
            selectedBranches: Array.from(repo.selectedBranches || [])
          }))
        };
      }

      result = await window.multiRepoAPI.getStats(config);
    }

    if (result.success) {
      queryResult = result.data;
      selectedGroup = 'all';
      resultsCard.classList.remove('hidden');
      displayResults();
      showStatus(queryStatus, '查询完成！', 'success');
    } else {
      showStatus(queryStatus, '查询失败: ' + result.error, 'error');
    }
  } catch (error) {
    showStatus(queryStatus, '查询异常: ' + error.message, 'error');
  } finally {
    queryBtn.disabled = false;
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add renderer.js
git commit -m "feat: 支持调用 multi-stats 进行多仓库混合查询"
```

---

### 任务 5：修改结果展示添加来源标签

**文件：**
- 修改：`renderer.js:1020-1060`（表格渲染）
- 修改：`renderer.js:876-900`（分组选项卡）
- 修改：`styles.css`（标签样式）

- [ ] **步骤 1：在提交表格添加来源列**

```javascript
// 在 renderCommitsTable 中，commit.message td 后添加来源标签
const sourceTag = commit.source === 'svn'
  ? '<span class="source-tag svn">[SVN]</span>'
  : '<span class="source-tag git">[Git]</span>';
```

- [ ] **步骤 2：修改分组选项卡显示来源标签**

```javascript
function renderGroupingTabs() {
  const isGit = connectionConfig.vcs === 'git';
  // ... 原有逻辑 ...
  // groupNames.forEach 中的 tab 按钮文本加上来源标签
  const prefix = isGit ? '[Git] ' : '[SVN] ';
  html += `<button class="project-tab ${selectedGroup === name ? 'active' : ''}" data-group="${name}">${prefix}${name}</button>`;
}
```

- [ ] **步骤 3：添加 CSS 样式**

```css
.source-tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  margin-right: 4px;
}
.source-tag.svn { background: #d4edda; color: #155724; }
.source-tag.git { background: #cce5ff; color: #004085; }
```

- [ ] **步骤 4：Commit**

```bash
git add renderer.js styles.css
git commit -m "feat: 结果展示添加来源标签区分 SVN/Git"
```

---

### 任务 6：修改 Git 多项目分支选择器

**文件：**
- 修改：`renderer.js`（Git 多仓库配置 UI）
- 修改：`index.html`（多仓库卡片结构）

- [ ] **步骤 1：重构 Git 仓库配置为多项目卡片列表**

```javascript
// gitRepos 列表容器
let gitRepos = []; // { id, name, mode, url, path, branches, selectedBranches }

// 添加 Git 仓库
function addGitRepoCard() {
  const id = Date.now();
  const repo = { id, name: '', mode: 'local', url: '', path: '', branches: [], selectedBranches: new Set(['main', 'master']) };
  gitRepos.push(repo);
  renderGitRepoCards();
}

function renderGitRepoCards() {
  const container = document.getElementById('gitReposContainer');
  container.innerHTML = gitRepos.map((repo, index) => `
    <div class="git-repo-card" data-id="${repo.id}">
      <div class="repo-header">
        <span>仓库 ${index + 1}</span>
        <button class="btn-remove" onclick="removeGitRepo(${repo.id})">×</button>
      </div>
      <div class="repo-body">
        <input class="repo-name-input" placeholder="仓库名称" value="${repo.name}">
        <select class="repo-mode-select">
          <option value="local" ${repo.mode === 'local' ? 'selected' : ''}>本地</option>
          <option value="ssh" ${repo.mode === 'ssh' ? 'selected' : ''}>SSH</option>
        </select>
        ${repo.mode === 'local'
          ? `<input class="repo-path-input" placeholder="仓库路径" value="${repo.path}">`
          : `<input class="repo-url-input" placeholder="SSH URL" value="${repo.url}">`
        }
        <div class="repo-branches-container"></div>
      </div>
    </div>
  `).join('');
}
```

- [ ] **步骤 2：Commit**

```bash
git add renderer.js index.html
git commit -m "feat: Git 多项目分支选择器，每仓库独立配置"
```

---

## 验收标准

- [ ] 可以同时配置 SVN 项目和 Git 仓库
- [ ] 每个 Git 仓库可以独立选择分支
- [ ] 查询结果同时包含 SVN 和 Git 提交
- [ ] 分组选项卡正确显示来源标签
- [ ] 提交表格正确显示来源标签
- [ ] 图表正确聚合两个数据源
- [ ] 统计卡片正确汇总两个数据源

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-13-multi-repo-support-plan.md`。

**两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

选哪种方式？