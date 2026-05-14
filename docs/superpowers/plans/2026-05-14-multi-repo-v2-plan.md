# 多仓库混合查询（修订版）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** VCS 单选互斥 + Git 多仓库配置 + 分支选择前置 + 结果页分支筛选

**架构：** 恢复 `connectionConfig.vcs` 单值，Git 多仓库每仓库独立分支选择器，结果页 Git 仓库可展开分支复选框

**技术栈：** Electron IPC, JavaScript, ECharts

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `renderer.js` | VCS 切换逻辑、Git 多仓库配置 UI、结果页分支筛选 |
| `main.js` | IPC handlers，git-multi-stats 支持多仓库多分支 |
| `preload.js` | 暴露 API |
| `index.html` | Git 多仓库卡片容器结构 |
| `styles.css` | Git 仓库卡片样式、分支筛选展开样式 |

---

## 任务清单

### 任务 1：修改 VCS 切换为单选互斥

**文件：**
- 修改：`renderer.js:275-295`（VCS 切换逻辑）

- [ ] **步骤 1：修改 VCS 切换逻辑**

```javascript
vcsToggleButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const vcs = button.dataset.vcs;
    if (connectionConfig.vcs === vcs) return; // 已选中则忽略

    connectionConfig.vcs = vcs;
    vcsToggleButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    if (vcs === 'svn') {
      svnAuthConfig.classList.remove('hidden');
      svnProjectConfig.classList.remove('hidden');
      gitlabProjectConfig.classList.add('hidden');
    } else {
      svnAuthConfig.classList.add('hidden');
      svnProjectConfig.classList.add('hidden');
      gitlabProjectConfig.classList.remove('hidden');
      // 自动获取 Git 用户名
      const result = await window.gitlabAPI.getLocalGitUser();
      if (result.success) authorInput.value = result.userName;
    }
  });
});
```

- [ ] **步骤 2：Commit**

```bash
git add renderer.js
git commit -m "refactor: VCS 切换恢复为单选互斥"
```

---

### 任务 2：重构 Git 多仓库配置 UI

**文件：**
- 修改：`renderer.js`（gitRepos 管理逻辑）
- 修改：`index.html`（添加 gitReposContainer）
- 修改：`styles.css`（添加卡片样式）

- [ ] **步骤 1：添加 Git 仓库容器 HTML**

在 `gitlabProjectConfig` 内部添加：
```html
<div id="gitReposContainer"></div>
<button type="button" id="addGitRepoBtn" class="btn-secondary">+ 添加 Git 仓库</button>
```

- [ ] **步骤 2：实现 gitRepos 管理逻辑**

```javascript
let gitRepos = []; // { id, name, mode, url, path, branches: [], selectedBranches: Set }

function addGitRepoCard() {
  const id = Date.now();
  gitRepos.push({
    id, name: '', mode: 'local', url: '', path: '',
    branches: [], selectedBranches: new Set()
  });
  renderGitRepoCards();
}

function removeGitRepo(id) {
  gitRepos = gitRepos.filter(r => r.id !== id);
  renderGitRepoCards();
}

function renderGitRepoCards() {
  const container = document.getElementById('gitReposContainer');
  container.innerHTML = gitRepos.map((repo, idx) => `
    <div class="git-repo-card" data-id="${repo.id}">
      <div class="card-header">
        <span>仓库 ${idx + 1}</span>
        <button onclick="removeGitRepo(${repo.id})">×</button>
      </div>
      <div class="card-body">
        <input class="repo-name" placeholder="仓库名称" value="${repo.name}">
        <select class="repo-mode">
          <option value="local" ${repo.mode === 'local' ? 'selected' : ''}>本地</option>
          <option value="ssh" ${repo.mode === 'ssh' ? 'selected' : ''}>SSH</option>
        </select>
        ${repo.mode === 'local'
          ? `<input class="repo-path" placeholder="仓库路径" value="${repo.path}">`
          : `<input class="repo-url" placeholder="SSH URL" value="${repo.url}">`
        }
        <div class="repo-branches-select"></div>
      </div>
    </div>
  `).join('');
}
```

- [ ] **步骤 3：添加 CSS 样式**

```css
.git-repo-card {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  margin-bottom: 10px;
}
.git-repo-card .card-header {
  background: #f5f7fa;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
}
.git-repo-card .card-body {
  padding: 12px;
}
```

- [ ] **步骤 4：Commit**

```bash
git add renderer.js index.html styles.css
git commit -m "feat: Git 多仓库配置 UI，每仓库独立配置卡片"
```

---

### 任务 3：登录后显示分支选择器

**文件：**
- 修改：`renderer.js`（loginBtn 逻辑、显示分支选择器）

- [ ] **步骤 1：修改 loginBtn 逻辑**

Git 模式下，登录验证后显示每个仓库的分支选择器：

```javascript
loginBtn.addEventListener('click', async () => {
  // ... 验证逻辑 ...

  if (connectionConfig.vcs === 'git') {
    // 获取每个仓库的分支
    for (const repo of gitRepos) {
      if (repo.mode === 'local') {
        const result = await window.gitlabAPI.getBranches({ repoPath: repo.path });
        if (result.success) {
          repo.branches = result.branches;
        }
      } else {
        const result = await window.gitlabAPI.testSshConnection({ repoUrl: repo.url });
        if (result.success) {
          repo.branches = result.branches;
        }
      }
    }
    // 显示分支选择器
    renderGitRepoBranchesSelect();
    // 显示查询配置区域（包含分支选择）
    showBranchSelectionArea();
  }
});

function showBranchSelectionArea() {
  // 显示已配置的 Git 仓库分支选择区域
  // 用户选择分支后，点击"查询"进入结果页
}
```

- [ ] **步骤 2：Commit**

```bash
git add renderer.js
git commit -m "feat: Git 登录后显示分支选择器"
```

---

### 任务 4：修改 git-multi-stats IPC handler

**文件：**
- 修改：`main.js`（git-multi-stats handler）

- [ ] **步骤 1：修改/新增 git-multi-stats handler**

```javascript
ipcMain.handle('git-multi-stats', async (event, config) => {
  const { repos, author, year, month, threshold, formatThreshold, startDate, endDate } = config;
  const allCommits = [];
  const branchStats = {};
  const commitTypeStats = {};
  const chartData = {};
  const activeDaysSet = new Set();

  for (const repo of repos) {
    const result = await getGitRepoStats(repo, author, year, month, threshold, formatThreshold, startDate, endDate);
    if (result.success) {
      // 合并结果
      for (const commit of result.data.commits) {
        commit.source = 'git';
        commit.project = repo.name;
        commit.repoId = repo.id;
        allCommits.push(commit);
      }
      // 合并 branchStats，key 为 repo.name
      branchStats[repo.name] = result.data.branchStats;
      // 合并其他统计...
    }
  }

  return { success: true, data: { commits: allCommits, branchStats, ... } };
});
```

- [ ] **步骤 2：Commit**

```bash
git add main.js
git commit -m "feat: git-multi-stats 支持多仓库多分支查询"
```

---

### 任务 5：结果页面 Git 仓库可展开分支筛选

**文件：**
- 修改：`renderer.js`（renderGroupingTabs、分支展开逻辑）
- 修改：`styles.css`（展开样式）

- [ ] **步骤 1：修改 renderGroupingTabs**

Git 仓库显示为可展开形式：

```javascript
function renderGroupingTabs() {
  // ... 原有逻辑 ...
  // Git 仓库项显示为可展开
  groupNames.forEach(name => {
    const isGitRepo = name.startsWith('[Git]');
    if (isGitRepo) {
      html += `
        <button class="project-tab expandable" data-group="${name}">
          ${name} ▼
        </button>
        <div class="branch-filter" data-for="${name}" style="display:none;">
          <div class="branch-checkboxes"></div>
        </div>
      `;
    } else {
      html += `<button class="project-tab ${selectedGroup === name ? 'active' : ''}" data-group="${name}">${name}</button>`;
    }
  });
}
```

- [ ] **步骤 2：绑定展开事件**

```javascript
projectTabs.querySelectorAll('.project-tab.expandable').forEach(tab => {
  tab.addEventListener('click', () => {
    const groupName = tab.dataset.group;
    const filterDiv = projectTabs.querySelector(`.branch-filter[data-for="${groupName}"]`);
    if (filterDiv.style.display === 'none') {
      filterDiv.style.display = 'block';
      tab.innerHTML = tab.innerHTML.replace('▼', '▲');
    } else {
      filterDiv.style.display = 'none';
      tab.innerHTML = tab.innerHTML.replace('▲', '▼');
    }
  });
});
```

- [ ] **步骤 3：添加分支复选框渲染**

```javascript
function renderBranchCheckboxes(groupName) {
  const groupStats = queryResult.branchStats[groupName];
  if (!groupStats) return '';

  const branches = Object.keys(groupStats.dailyStats || {});
  return branches.map(branch => `
    <label>
      <input type="checkbox" value="${branch}">
      ${branch}
    </label>
  `).join('');
}
```

- [ ] **步骤 4：Commit**

```bash
git add renderer.js styles.css
git commit -m "feat: 结果页 Git 仓库可展开分支筛选"
```

---

### 任务 6：分支筛选联动更新统计

**文件：**
- 修改：`renderer.js`（分支选择后重新计算统计）

- [ ] **步骤 1：添加分支筛选联动逻辑**

```javascript
function onBranchFilterChange(groupName, selectedBranches) {
  // 1. 更新 connectionConfig
  const repo = gitRepos.find(r => r.name === groupName);
  if (repo) {
    repo.selectedBranches = new Set(selectedBranches);
  }

  // 2. 筛选 commits
  const filtered = queryResult.commits.filter(c => {
    if (c.project !== groupName) return true;
    return selectedBranches.includes(c.branch);
  });

  // 3. 重新计算统计
  recalcStatsForGroup(groupName, filtered);

  // 4. 更新图表
  updateChartsWithFilteredData(groupName, filtered);
}
```

- [ ] **步骤 2：Commit**

```bash
git add renderer.js
git commit -m "feat: 分支筛选联动更新统计结果"
```

---

## 验收标准

- [ ] VCS 类型单选互斥
- [ ] Git 支持配置多个仓库
- [ ] 登录后每个 Git 仓库独立选择分支
- [ ] 结果页面 Git 仓库可展开分支筛选
- [ ] 分支筛选联动更新统计结果

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-14-multi-repo-v2-plan.md`。

**两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

选哪种方式？