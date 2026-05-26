window.onerror = function(msg, url, lineNo, columnNo, error) {
    require('fs').appendFileSync('renderer-error.log', ['\n', new Date(), msg, url, lineNo, columnNo, error ? error.stack : ''].join('|'));
    return false;
  };
// DOM元素
const loginCard = document.getElementById('loginCard');
const statsCard = document.getElementById('statsCard');
const resultsCard = document.getElementById('resultsCard');

const vcsToggleButtons = document.querySelectorAll('.vcs-btn');
const vcsTypeInput = document.getElementById('vcsType');
const svnAuthConfig = document.getElementById('svnAuthConfig');
const svnProjectConfig = document.getElementById('svnProjectConfig');
const gitlabProjectConfig = document.getElementById('gitlabProjectConfig');

// GitLab 子模式相关 DOM 元素（简化为仅本地模式）
const gitlabLocalConfig = document.getElementById('gitlabLocalConfig');
const gitlabSshConfig = document.getElementById('gitlabSshConfig');
const gitlabModeButtons = document.querySelectorAll('.gitlab-mode-btn');

// SSH 模式元素
const sshRepoUrl = document.getElementById('sshRepoUrl');
const testSshBtn = document.getElementById('testSshBtn');
const sshTestStatus = document.getElementById('sshTestStatus');
const sshRepoInfo = document.getElementById('sshRepoInfo');

// 本地扫描模式元素
const localRepoPath = document.getElementById('localRepoPath');
const selectRepoBtn = document.getElementById('selectRepoBtn');
const localRepoInfo = document.getElementById('localRepoInfo');

const projectList = document.getElementById('projectList');
const addProjectBtn = document.getElementById('addProjectBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const thresholdInput = document.getElementById('threshold');
const formatThresholdInput = document.getElementById('formatThreshold');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');

const authorInput = document.getElementById('author');
const branchInput = document.getElementById('branch');
const branchSearchInput = document.getElementById('branchSearch');
const branchGroup = document.getElementById('branchGroup');
const yearMonthInput = document.getElementById('yearMonth');
const queryModeBtns = document.querySelectorAll('.query-mode-btn');
const queryModeInput = document.getElementById('queryMode');
const monthQueryGroup = document.getElementById('monthQueryGroup');
const quarterQueryGroup = document.getElementById('quarterQueryGroup');
const customQueryGroup = document.getElementById('customQueryGroup');
const quarterYearStr = document.getElementById('quarterYearStr');
const quarterQuarterStr = document.getElementById('quarterQuarterStr');
const customStartDate = document.getElementById('customStartDate');
const customEndDate = document.getElementById('customEndDate');
const queryBtn = document.getElementById('queryBtn');
const changeConnBtn = document.getElementById('changeConnBtn');
const queryStatus = document.getElementById('queryStatus');

const totalCommitsEl = document.getElementById('totalCommits');
const totalAddedEl = document.getElementById('totalAdded');
const totalDeletedEl = document.getElementById('totalDeleted');
const netLinesEl = document.getElementById('netLines');
const overThresholdCountEl = document.getElementById('overThresholdCount');
const formatCodeCountEl = document.getElementById('formatCodeCount');

const projectTabs = document.getElementById('projectTabs');
const commitsBody = document.getElementById('commitsBody');
const pagination = document.getElementById('pagination');

const filterType = document.getElementById('filterType');
const filterStatus = document.getElementById('filterStatus');
const filterKeyword = document.getElementById('filterKeyword');
const filterBtn = document.getElementById('filterBtn');
const resetFilterBtn = document.getElementById('resetFilterBtn');

let connectionConfig = {
  vcs: 'svn', // 'svn' | 'git' 单值
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

  // AI 代码审查配置
  aiApiUrl: '',
  aiModel: '',
  aiApiKey: ''
};

// Git 多仓库列表
let gitRepos = []; // { id, name, mode, url, path, branches, selectedBranches }

// 添加 Git 仓库卡片
document.addEventListener('DOMContentLoaded', () => {
  const addGitRepoBtn = document.getElementById('addGitRepoBtn');
  if (addGitRepoBtn) {
    addGitRepoBtn.addEventListener('click', () => {
      addGitRepoCard();
    });
  }
  // 默认添加一个空卡片
  addGitRepoCard();
});

function addGitRepoCard() {
  const id = Date.now();
  const repo = {
    id,
    name: '',
    mode: 'local',
    url: '',
    path: '',
    branches: [],
    selectedBranches: new Set(['main', 'master'])
  };
  gitRepos.push(repo);
  renderGitRepoCards();
}

function removeGitRepo(id) {
  gitRepos = gitRepos.filter(r => r.id !== id);
  renderGitRepoCards();
}

function renderGitRepoCards() {
  const container = document.getElementById('gitReposContainer');
  if (!container) return;

  container.innerHTML = gitRepos.map((repo, index) => `
    <div class="git-repo-card" data-id="${repo.id}">
      <div class="repo-header">
        <span>仓库 ${index + 1}: ${repo.name || '未命名'}</span>
        <button type="button" class="btn-remove" onclick="removeGitRepo(${repo.id})">×</button>
      </div>
      <div class="repo-body">
        <div class="form-group repo-name-mode-row">
          <input class="repo-name-input" placeholder="仓库名称" value="${repo.name}"
            onchange="updateGitRepoName(${repo.id}, this.value)">
          <select class="repo-mode-select" onchange="updateGitRepoMode(${repo.id}, this.value)">
            <option value="local" ${repo.mode === 'local' ? 'selected' : ''}>本地仓库</option>
            <option value="ssh" ${repo.mode === 'ssh' ? 'selected' : ''}>SSH 远程</option>
          </select>
        </div>
        ${repo.mode === 'local' ? `
          <div class="form-group">
            <div class="local-repo-selector">
              <input type="text" class="repo-path-input" readonly placeholder="点击选择本地 Git 仓库目录" value="${repo.path}">
              <button type="button" class="btn btn-small" onclick="selectLocalRepoForCard(${repo.id})">选择目录</button>
            </div>
          </div>
        ` : `
          <div class="form-group">
            <input type="text" class="repo-url-input" placeholder="git@gitlab.example.com:group/project.git" value="${repo.url}"
              onchange="updateGitRepoUrl(${repo.id}, this.value)">
          </div>
          <div class="form-group">
            <button type="button" class="btn btn-small" onclick="testSshConnectionForCard(${repo.id})">测试连接</button>
            <span class="branch-status" id="sshStatus-${repo.id}"></span>
          </div>
        `}
        <div class="repo-branches-container">
          <div class="branch-status" id="branchStatus-${repo.id}">
            ${repo.branches.length > 0 ? `已加载 ${repo.branches.length} 个分支` : '请选择仓库以加载分支'}
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // 更新全局分支列表（合并所有仓库的分支）
  updateAllBranchesFromRepos();
}

function updateGitRepoName(id, name) {
  const repo = gitRepos.find(r => r.id === id);
  if (repo) {
    repo.name = name;
    renderGitRepoCards();
  }
}

function updateGitRepoMode(id, mode) {
  const repo = gitRepos.find(r => r.id === id);
  if (repo) {
    repo.mode = mode;
    renderGitRepoCards();
  }
}

function updateGitRepoUrl(id, url) {
  const repo = gitRepos.find(r => r.id === id);
  if (repo) {
    repo.url = url;
  }
}

async function selectLocalRepoForCard(id) {
  const repo = gitRepos.find(r => r.id === id);
  if (!repo) return;

  try {
    const result = await window.gitlabAPI.selectLocalRepo();
    if (result.canceled) return;

    if (result.success) {
      repo.path = result.repoPath;
      repo.name = result.repoName;
      repo.branches = result.branches || [];
      // 默认选中
      repo.selectedBranches = new Set();
      if (repo.branches.includes('main')) repo.selectedBranches.add('main');
      else if (repo.branches.includes('master')) repo.selectedBranches.add('master');
      else if (repo.branches.length > 0) repo.selectedBranches.add(repo.branches[0]);

      renderGitRepoCards();

      // 自动获取本地 git 用户名
      const userResult = await window.gitlabAPI.getLocalGitUser();
      if (userResult.success) {
        authorInput.value = userResult.userName;
      }
    }
  } catch (error) {
    console.error('选择本地仓库失败:', error);
  }
}

async function testSshConnectionForCard(id) {
  const repo = gitRepos.find(r => r.id === id);
  if (!repo || !repo.url) {
    document.getElementById(`sshStatus-${id}`).textContent = '请输入 SSH 地址';
    return;
  }

  const statusEl = document.getElementById(`sshStatus-${id}`);
  statusEl.textContent = '测试中...';

  try {
    const result = await window.gitlabAPI.testSshConnection(repo.url);
    if (result.success) {
      repo.name = result.repoName;
      repo.branches = result.branches || [];
      repo.selectedBranches = new Set();
      if (repo.branches.includes('main')) repo.selectedBranches.add('main');
      else if (repo.branches.includes('master')) repo.selectedBranches.add('master');
      else if (repo.branches.length > 0) repo.selectedBranches.add(repo.branches[0]);

      statusEl.textContent = `连接成功: ${result.repoName}`;
      renderGitRepoCards();
    } else {
      statusEl.textContent = `连接失败: ${result.error}`;
    }
  } catch (error) {
    statusEl.textContent = `测试出错: ${error.message}`;
  }
}

function updateAllBranchesFromRepos() {
  // 合并所有仓库的分支用于全局分支选择（如果需要）
  const allBranchSet = new Set();
  gitRepos.forEach(repo => {
    repo.branches.forEach(b => allBranchSet.add(b));
  });
  allBranches = Array.from(allBranchSet);
}

// 确保 repo.selectedBranches 是 Set
function ensureSelectedBranchesSet(repo) {
  if (!repo.selectedBranches) {
    repo.selectedBranches = new Set();
  } else if (Array.isArray(repo.selectedBranches)) {
    repo.selectedBranches = new Set(repo.selectedBranches);
  } else if (!(repo.selectedBranches instanceof Set)) {
    // 如果是其他类型（对象等），转换为 Set
    repo.selectedBranches = new Set();
  }
  return repo;
}

// 渲染多仓库分支选择器（登录后显示在 statsCard 中）
function renderGitRepoBranchesSelect() {
  const container = document.getElementById('gitRepoBranchesSelect');
  if (!container) return;

  // 确保所有仓库的 selectedBranches 是 Set
  gitRepos.forEach(repo => ensureSelectedBranchesSet(repo));

  // 只有 Git 模式（包含混合模式）且有有效仓库时才显示
  if ((connectionConfig.vcs !== 'git' && connectionConfig.vcs !== 'mixed') || gitRepos.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = gitRepos.map((repo, idx) => {
    const repoLabel = repo.name || `仓库 ${idx + 1}`;
    const repoPathDisplay = repo.mode === 'local' ? repo.path : repo.url;
    const repoModeLabel = repo.mode === 'local' ? '本地' : 'SSH';

    // 确保这个 repo 的 selectedBranches 是 Set
    ensureSelectedBranchesSet(repo);

    return `
    <div class="git-repo-branch-row" data-repo-id="${repo.id}">
      <div class="repo-branch-header">
        <span class="repo-branch-name">📦 ${repoLabel}</span>
        <span class="repo-branch-mode">(${repoModeLabel})</span>
        <span class="repo-branch-path" title="${escapeHtml(repoPathDisplay)}">${escapeHtml(repoPathDisplay)}</span>
      </div>
      <div class="repo-branches-select">
        ${repo.branches.map(branch => `
          <label class="branch-checkbox-label">
            <input type="checkbox" value="${branch}"
              ${repo.selectedBranches.has(branch) ? 'checked' : ''}
              onchange="updateRepoSelectedBranch(${repo.id}, '${branch}', this.checked)">
            <span>${branch}</span>
          </label>
        `).join('')}
        ${repo.branches.length === 0 ? '<span class="no-branches">暂无分支，请先配置仓库</span>' : ''}
      </div>
    </div>
  `}).join('');
}

// 更新某仓库选中的分支
function updateRepoSelectedBranch(repoId, branch, checked) {
  const repo = gitRepos.find(r => r.id === repoId);
  if (!repo) return;
  ensureSelectedBranchesSet(repo);
  if (checked) {
    repo.selectedBranches.add(branch);
  } else {
    repo.selectedBranches.delete(branch);
  }
  // 同时更新 connectionConfig.git.repos 中的分支列表
  if (connectionConfig.git && connectionConfig.git.repos) {
    const configRepo = connectionConfig.git.repos.find(cr =>
      (repo.mode === 'local' && cr.repoPath === repo.path) ||
      (repo.mode === 'ssh' && cr.repoUrl === repo.url)
    );
    if (configRepo) {
      configRepo.branches = Array.from(repo.selectedBranches);
    }
  }
}

// 渲染 SVN 项目选择器（SVN 和混合模式下显示）
function renderSvnProjectSelect() {
  const container = document.getElementById('svnProjectSelect');
  if (!container) return;

  // 只有 SVN 模式或混合模式且有项目时才显示
  if ((connectionConfig.vcs !== 'svn' && connectionConfig.vcs !== 'mixed') ||
      !connectionConfig.svn.projects || connectionConfig.svn.projects.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  // SVN 项目默认全部选中
  container.innerHTML = connectionConfig.svn.projects.map(project => `
    <label class="branch-checkbox-label">
      <input type="checkbox" value="${project.name}"
        ${project.selected !== false ? 'checked' : ''}
        onchange="updateSvnSelectedProject('${project.name}', this.checked)">
      <span>${project.name}</span>
    </label>
  `).join('');
}

// 更新 SVN 项目选中状态
function updateSvnSelectedProject(projectName, checked) {
  const project = connectionConfig.svn.projects.find(p => p.name === projectName);
  if (project) {
    project.selected = checked;
  }
}

// 获取选中的 SVN 项目列表
function getSelectedSvnProjects() {
  if (!connectionConfig.svn.projects) return [];
  return connectionConfig.svn.projects.filter(p => p.selected !== false);
}

// VCS切换（单选互斥）
vcsToggleButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const vcs = button.dataset.vcs;

    // 更新状态
    connectionConfig.vcs = vcs;
    vcsTypeInput.value = vcs;
    vcsToggleButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    if (vcs === 'svn') {
      svnAuthConfig.classList.remove('hidden');
      svnProjectConfig.classList.remove('hidden');
      gitlabProjectConfig.classList.add('hidden');
    } else if (vcs === 'git') {
      svnAuthConfig.classList.add('hidden');
      svnProjectConfig.classList.add('hidden');
      gitlabProjectConfig.classList.remove('hidden');
      // 自动获取 Git 用户名
      const result = await window.gitlabAPI.getLocalGitUser();
      if (result.success) authorInput.value = result.userName;
    } else if (vcs === 'mixed') {
      // 混合模式：显示 SVN 和 Git 配置
      svnAuthConfig.classList.remove('hidden');
      svnProjectConfig.classList.remove('hidden');
      gitlabProjectConfig.classList.remove('hidden');
      // 自动获取 Git 用户名
      const result = await window.gitlabAPI.getLocalGitUser();
      if (result.success) authorInput.value = result.userName;
    }
  });
});

// 加载缓存的配置
function loadCachedConfig() {
  const cachedConfig = localStorage.getItem('connectionConfig');
  if (cachedConfig) {
    try {
      const config = JSON.parse(cachedConfig);
      // 合并到 connectionConfig
      Object.assign(connectionConfig, config);
      // 设置缓存勾选状态
      const cacheCheckbox = document.getElementById('cacheConfig');
      if (cacheCheckbox) cacheCheckbox.checked = true;

      // 加载 gitRepos
      const cachedGitRepos = localStorage.getItem('gitRepos');
      if (cachedGitRepos) {
        try {
          gitRepos = JSON.parse(cachedGitRepos);
          // 恢复 selectedBranches 为 Set
          gitRepos.forEach(repo => {
            if (repo.selectedBranches && Array.isArray(repo.selectedBranches)) {
              repo.selectedBranches = new Set(repo.selectedBranches);
            }
          });
        } catch (e) {
          console.error('加载缓存 Git 仓库失败:', e);
        }
      }
      return true;
    } catch (e) {
      console.error('加载缓存配置失败:', e);
    }
  }
  return false;
}

// 初始化：根据默认 vcs 值显示对应配置
function initVcsDisplay() {
  const vcs = connectionConfig.vcs;
  if (vcs === 'svn') {
    vcsToggleButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector('.vcs-btn[data-vcs="svn"]').classList.add('active');
    svnAuthConfig.classList.remove('hidden');
    svnProjectConfig.classList.remove('hidden');
    gitlabProjectConfig.classList.add('hidden');
  } else if (vcs === 'git') {
    vcsToggleButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector('.vcs-btn[data-vcs="git"]').classList.add('active');
    svnAuthConfig.classList.add('hidden');
    svnProjectConfig.classList.add('hidden');
    gitlabProjectConfig.classList.remove('hidden');
  } else if (vcs === 'mixed') {
    vcsToggleButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector('.vcs-btn[data-vcs="mixed"]').classList.add('active');
    svnAuthConfig.classList.remove('hidden');
    svnProjectConfig.classList.remove('hidden');
    gitlabProjectConfig.classList.remove('hidden');
  }
}

// 页面加载时加载缓存配置
loadCachedConfig();
initVcsDisplay();

// Git 多仓库列表（已移除旧的单仓库模式事件监听）
let queryResult = null;
let filteredCommits = [];
let currentPage = 1;
const pageSize = 20;
let selectedGroup = 'all';

// 存储选中的提交索引
let selectedCommitIndices = new Set();

// 全选复选框
const selectAllCommitsCheckbox = document.getElementById('selectAllCommits');
const selectedCountEl = document.getElementById('selectedCount');

// 存储所有分支（用于搜索过滤）
let allBranches = [];
let selectedBranchesSet = new Set(['main', 'master']); // 默认选择

const branchCustomSelect = document.getElementById('branchCustomSelect');
const branchSelectTags = document.getElementById('branchSelectTags');
const branchSelectDropdown = document.getElementById('branchSelectDropdown');
const branchOptionsList = document.getElementById('branchOptionsList');
const branchSelectCaret = document.getElementById('branchSelectCaret');

// 修改点击空白收起下拉框
document.addEventListener('click', (e) => {
  if (branchCustomSelect && !branchCustomSelect.contains(e.target)) {
    if (branchSelectDropdown) branchSelectDropdown.style.display = 'none';
    if (branchSelectTags) branchSelectTags.classList.remove('is-focus');
    if (branchSelectCaret) branchSelectCaret.classList.remove('is-reverse');
  }
});

if (branchSelectTags) {
  branchSelectTags.addEventListener('click', () => {
    const isHidden = branchSelectDropdown.style.display === 'none';
    branchSelectDropdown.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      branchSelectTags.classList.add('is-focus');
      branchSelectCaret.classList.add('is-reverse');
      if (branchSearchInput) branchSearchInput.focus();
    } else {
      branchSelectTags.classList.remove('is-focus');
      branchSelectCaret.classList.remove('is-reverse');
    }
  });
}

if (branchSearchInput) {
  branchSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    renderBranchOptions(searchTerm);
  });
}

function updateBranchTags() {
  // 同步原生select对象
  if (branchInput) {
    branchInput.innerHTML = '';
    selectedBranchesSet.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.selected = true;
      branchInput.appendChild(opt);
    });
  }

  // 更新UI显示
  if (branchSelectTags) {
    branchSelectTags.innerHTML = '';
    if (selectedBranchesSet.size === 0) {
      branchSelectTags.innerHTML = '<span class="placeholder" style="color: #c0c4cc; font-size: 14px; padding-left: 8px;">请选择分支</span>';
    } else {
      selectedBranchesSet.forEach(b => {
        const tag = document.createElement('span');
        tag.className = 'el-tag';
        tag.innerHTML = b + ' <i class="el-tag__close">×</i>';
        tag.querySelector('.el-tag__close').addEventListener('click', (e) => {
          e.stopPropagation();
          selectedBranchesSet.delete(b);
          updateBranchTags();
          renderBranchOptions(branchSearchInput ? branchSearchInput.value : '');
        });
        branchSelectTags.appendChild(tag);
      });
    }
  }
}

function renderBranchOptions(searchTerm = '') {
  if (!branchOptionsList) return;
  branchOptionsList.innerHTML = '';
  const filtered = searchTerm ? allBranches.filter(b => b.toLowerCase().includes(searchTerm)) : allBranches;
  
  filtered.forEach(branchName => {
    const item = document.createElement('div');
    const isSelected = selectedBranchesSet.has(branchName);
    item.className = 'el-select-dropdown__item ' + (isSelected ? 'selected' : '');
    item.textContent = branchName;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isSelected) {
        selectedBranchesSet.delete(branchName);
      } else {
        selectedBranchesSet.add(branchName);
      }
      updateBranchTags();
      renderBranchOptions(searchTerm);
    });
    branchOptionsList.appendChild(item);
  });
}

function populateBranchOptions(branches) {
  allBranches = branches || [];
  selectedBranchesSet.clear();
  // 默认选中
  if (allBranches.includes('main')) selectedBranchesSet.add('main');
  else if (allBranches.includes('master')) selectedBranchesSet.add('master');
  else if (allBranches.length > 0) selectedBranchesSet.add(allBranches[0]);
  
  if (branchSearchInput) branchSearchInput.value = '';
  updateBranchTags();
  renderBranchOptions('');
}

// 图表实例
let lineChart = null;
let barChart = null;

// 初始化查询模式切换
queryModeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    queryModeBtns.forEach(b => b.classList.remove('active', 'btn-primary'));
    btn.classList.add('active', 'btn-primary');
    const mode = btn.dataset.mode;
    queryModeInput.value = mode;
    
    monthQueryGroup.classList.add('hidden');
    quarterQueryGroup.classList.add('hidden');
    customQueryGroup.classList.add('hidden');
    
    if (mode === 'month') {
      monthQueryGroup.classList.remove('hidden');
    } else if (mode === 'quarter') {
      quarterQueryGroup.classList.remove('hidden');
    } else {
      customQueryGroup.classList.remove('hidden');
    }
  });
});


// ========================== 自定义日期弹窗逻辑 ==========================
const customMonthPicker = document.getElementById('customMonthPicker');
const monthDisplay = document.getElementById('monthDisplay');
const monthDropdown = document.getElementById('monthDropdown');
const monthYearLabel = document.getElementById('monthYearLabel');
const monthPrevYear = document.getElementById('monthPrevYear');
const monthNextYear = document.getElementById('monthNextYear');
const monthTableBody = document.getElementById('monthTableBody');
const yearMonthHidden = document.getElementById('yearMonth');

const customQuarterPicker = document.getElementById('customQuarterPicker');
const quarterDisplay = document.getElementById('quarterDisplay');
const quarterDropdown = document.getElementById('quarterDropdown');
const quarterYearLabel = document.getElementById('quarterYearLabel');
const quarterPrevYear = document.getElementById('quarterPrevYear');
const quarterNextYear = document.getElementById('quarterNextYear');
const quarterTableBody = document.getElementById('quarterTableBody');
const quarterYearStrHidden = document.getElementById('quarterYearStr');
const quarterQuarterStrHidden = document.getElementById('quarterQuarterStr');

let selectedMonthYear = new Date().getFullYear();
let selectedMonthVal = new Date().getMonth() + 1; 
let viewMonthYear = selectedMonthYear;

let selectedQuarterYear = new Date().getFullYear();
let selectedQuarterVal = Math.floor(new Date().getMonth() / 3) + 1; 
let viewQuarterYear = selectedQuarterYear;

document.addEventListener('click', (e) => {
  if (customMonthPicker && !customMonthPicker.contains(e.target)) {
    if (monthDropdown) monthDropdown.classList.add('hidden');
  }
  if (customQuarterPicker && !customQuarterPicker.contains(e.target)) {
    if (quarterDropdown) quarterDropdown.classList.add('hidden');
  }
});

function renderMonthDropdown() {
  if (!monthYearLabel) return;
  monthYearLabel.textContent = `${viewMonthYear} 年`;
  monthTableBody.innerHTML = '';
  let html = '';
  let m = 1;
  for (let i = 0; i < 3; i++) {
    html += '<tr>';
    for (let j = 0; j < 4; j++) {
      const isSelected = (viewMonthYear === selectedMonthYear && m === selectedMonthVal);
      html += `<td data-month="${m}" class="${isSelected ? 'current' : ''}"><div class="cell">${m}月</div></td>`;
      m++;
    }
    html += '</tr>';
  }
  monthTableBody.innerHTML = html;
  monthTableBody.querySelectorAll('td').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedMonthVal = parseInt(td.dataset.month);
      selectedMonthYear = viewMonthYear;
      updateMonthDisplay();
      monthDropdown.classList.add('hidden');
    });
  });
}

function updateMonthDisplay() {
  if(!yearMonthHidden) return;
  const val = `${selectedMonthYear}-${String(selectedMonthVal).padStart(2, '0')}`;
  yearMonthHidden.value = val;
  monthDisplay.value = val;
}

if (monthDisplay) {
  monthDisplay.addEventListener('click', () => {
    monthDropdown.classList.toggle('hidden');
    viewMonthYear = selectedMonthYear;
    renderMonthDropdown();
  });
  monthPrevYear.addEventListener('click', (e) => { e.stopPropagation(); viewMonthYear--; renderMonthDropdown(); });
  monthNextYear.addEventListener('click', (e) => { e.stopPropagation(); viewMonthYear++; renderMonthDropdown(); });
  updateMonthDisplay();
  renderMonthDropdown();
}

function renderQuarterDropdown() {
  if (!quarterYearLabel) return;
  quarterYearLabel.textContent = `${viewQuarterYear} 年`;
  quarterTableBody.innerHTML = '';
  let html = '<tr>';
  for (let q = 1; q <= 4; q++) {
    const isSelected = (viewQuarterYear === selectedQuarterYear && q === selectedQuarterVal);
    html += `<td data-quarter="${q}" class="${isSelected ? 'current' : ''}"><div class="cell">Q${q}</div></td>`;
  }
  html += '</tr>';
  quarterTableBody.innerHTML = html;
  quarterTableBody.querySelectorAll('td').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedQuarterVal = parseInt(td.dataset.quarter);
      selectedQuarterYear = viewQuarterYear;
      updateQuarterDisplay();
      quarterDropdown.classList.add('hidden');
    });
  });
}

function updateQuarterDisplay() {
  if(!quarterYearStrHidden) return;
  quarterYearStrHidden.value = selectedQuarterYear;
  quarterQuarterStrHidden.value = selectedQuarterVal;
  quarterDisplay.value = `${selectedQuarterYear}年 Q${selectedQuarterVal}`;
}

if (quarterDisplay) {
  quarterDisplay.addEventListener('click', () => {
    quarterDropdown.classList.toggle('hidden');
    viewQuarterYear = selectedQuarterYear;
    renderQuarterDropdown();
  });
  quarterPrevYear.addEventListener('click', (e) => { e.stopPropagation(); viewQuarterYear--; renderQuarterDropdown(); });
  quarterNextYear.addEventListener('click', (e) => { e.stopPropagation(); viewQuarterYear++; renderQuarterDropdown(); });
  updateQuarterDisplay();
  renderQuarterDropdown();
}
// ========================================================================

// 初始化自定义日期格式为最近一周
const now = new Date();
const lastWeek = new Date(now);
lastWeek.setDate(now.getDate() - 7);
customEndDate.value = now.toISOString().substring(0, 10);
customStartDate.value = lastWeek.toISOString().substring(0, 10);

// 项目索引计数器
let projectIndex = 1;

// 添加项目行
addProjectBtn.addEventListener('click', () => {
  addProjectRow();
});

function addProjectRow() {
  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.index = projectIndex++;
  row.innerHTML = `
    <input type="text" class="project-name" placeholder="项目名称">
    <input type="text" class="project-url" placeholder="SVN地址">
    <button type="button" class="btn-icon btn-remove" title="删除">×</button>
  `;
  projectList.appendChild(row);

  // 绑定删除事件
  row.querySelector('.btn-remove').addEventListener('click', () => {
    if (projectList.children.length > 1) {
      row.remove();
    }
  });
}

// 绑定第一行的删除按钮
document.querySelector('.project-row .btn-remove').addEventListener('click', (e) => {
  if (projectList.children.length > 1) {
    e.target.closest('.project-row').remove();
  }
});

// 获取所有项目配置
function getProjects() {
  const projects = [];
  if (connectionConfig.vcs === 'svn' || connectionConfig.vcs === 'mixed') {
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

// 登录按钮点击事件
loginBtn.addEventListener('click', async () => {
  const threshold = parseInt(thresholdInput.value) || 3000;
  const formatThreshold = parseInt(formatThresholdInput.value) || 200;

  connectionConfig.threshold = threshold;
  connectionConfig.formatThreshold = formatThreshold;

  loginBtn.disabled = true;

  try {
    const vcs = connectionConfig.vcs;
    const results = {};

    // SVN 登录验证
    if (vcs === 'svn') {
      const projects = getProjects();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (projects.length === 0) {
        showStatus(loginStatus, '请至少填写一个 SVN 项目', 'error');
        loginBtn.disabled = false;
        return;
      }
      if (!username || !password) {
        showStatus(loginStatus, '请填写 SVN 用户名和密码', 'error');
        loginBtn.disabled = false;
        return;
      }

      showStatus(loginStatus, '正在连接 SVN 服务器...', 'loading');
      connectionConfig.username = username;
      connectionConfig.password = password;

      const result = await window.svnAPI.login(projects, username, password);
      if (result.success) {
        const successProjects = result.results.filter(r => r.success);
        connectionConfig.svn.projects = successProjects.map(r => ({ name: r.name, url: r.url, selected: true }));
        connectionConfig.svn.username = username;
        showStatus(loginStatus, result.message, 'success');
        results.svn = { success: true, message: result.message };
      } else {
        showStatus(loginStatus, `SVN 连接失败: ${result.error || '所有项目连接失败'}`, 'error');
        results.svn = { success: false, error: result.error };
      }
    }

    // Git 登录验证（多仓库模式）
    if (vcs === 'git' || vcs === 'mixed') {
      // 检查是否至少配置了一个有效的 Git 仓库
      const validRepos = gitRepos.filter(r => {
        if (r.mode === 'local') return r.path && r.branches.length > 0;
        if (r.mode === 'ssh') return r.url && r.branches.length > 0;
        return false;
      });

      if (vcs === 'mixed' && validRepos.length === 0) {
        showStatus(loginStatus, '混合模式需要至少配置一个有效的 Git 仓库', 'error');
        loginBtn.disabled = false;
        return;
      }

      if (vcs === 'git' && validRepos.length === 0) {
        showStatus(loginStatus, '请至少配置一个有效的 Git 仓库（本地需选择目录并加载分支，SSH 需测试连接成功）', 'error');
        loginBtn.disabled = false;
        return;
      }

      // 更新 connectionConfig.git.repos
      // 如果 selectedBranches 为空，保留空数组（不在这里默认选中分支）
      connectionConfig.git.repos = validRepos.map(r => ({
        type: r.mode,
        repoName: r.name || (r.mode === 'local' ? 'Local Repo' : 'SSH Repo'),
        repoPath: r.path,
        repoUrl: r.url,
        branches: Array.from(r.selectedBranches)
      }));

      if (vcs === 'git') {
        showStatus(loginStatus, `已就绪 ${validRepos.length} 个 Git 仓库`, 'success');
      }
      if (vcs === 'mixed') {
        showStatus(loginStatus, `SVN 已就绪，Git 已就绪 ${validRepos.length} 个仓库`, 'success');
      }
      results.git = { success: true };
    }

    // 混合模式 SVN 验证
    if (vcs === 'mixed') {
      const projects = getProjects();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (projects.length === 0) {
        showStatus(loginStatus, '混合模式需要至少配置一个 SVN 项目', 'error');
        loginBtn.disabled = false;
        return;
      }
      if (!username || !password) {
        showStatus(loginStatus, '请填写 SVN 用户名和密码', 'error');
        loginBtn.disabled = false;
        return;
      }

      showStatus(loginStatus, '正在连接 SVN 服务器...', 'loading');
      connectionConfig.username = username;
      connectionConfig.password = password;
      connectionConfig.svn = connectionConfig.svn || {};
      connectionConfig.svn.username = username;
      connectionConfig.svn.password = password;

      const result = await window.svnAPI.login(projects, username, password);
      if (result.success) {
        const successProjects = result.results.filter(r => r.success);
        connectionConfig.svn.projects = successProjects.map(r => ({ name: r.name, url: r.url, selected: true }));
        showStatus(loginStatus, result.message, 'success');
        results.svn = { success: true, message: result.message };
      } else {
        showStatus(loginStatus, `SVN 连接失败: ${result.error || '所有项目连接失败'}`, 'error');
        results.svn = { success: false, error: result.error };
      }
    }

    // 检查是否成功
    const mixedSuccess = vcs === 'mixed' && results.svn && results.svn.success && results.git && results.git.success;
    const singleSuccess = vcs !== 'mixed' && results[vcs] && results[vcs].success;

    if (singleSuccess || mixedSuccess) {
      // 混合模式显示汇总信息
      if (vcs === 'mixed') {
        const svnCount = connectionConfig.svn.projects ? connectionConfig.svn.projects.length : 0;
        const gitCount = connectionConfig.git.repos ? connectionConfig.git.repos.length : 0;
        showStatus(loginStatus, `SVN 连接成功，Git 连接成功，共计 ${svnCount + gitCount} 个项目`, 'success');
      }

      // 保存配置到 localStorage
      if (document.getElementById('cacheConfig').checked) {
        localStorage.setItem('connectionConfig', JSON.stringify(connectionConfig));
        localStorage.setItem('gitRepos', JSON.stringify(gitRepos));
      } else {
        localStorage.removeItem('connectionConfig');
        localStorage.removeItem('gitRepos');
      }

      setTimeout(async () => {
        loginCard.classList.add('hidden');
        statsCard.classList.remove('hidden');
        // SVN 模式：显示 SVN 查询区块和项目选择器
        if (vcs === 'svn') {
          if (branchGroup) branchGroup.classList.add('hidden');
          authorInput.value = connectionConfig.username;
          // SVN 区块显示
          document.getElementById('svnAuthorGroup').classList.remove('hidden');
          // SVN 提交者输入显示
          document.getElementById('svnAuthorInputs').classList.remove('hidden');
          document.getElementById('svnAuthor').value = connectionConfig.svn.username || '';
          // Git 区块隐藏
          document.getElementById('gitAuthorGroup').classList.add('hidden');
          document.getElementById('gitAuthorRow').classList.add('hidden');
          document.getElementById('gitSectionHeaderRow').classList.add('hidden');
          document.getElementById('gitAuthorGroup').querySelector('label').textContent = '提交者账号:';
          authorInput.placeholder = 'SVN提交者用户名';
          // 隐藏 Git 多仓库分支选择器
          const gitRepoBranchesEl = document.getElementById('gitRepoBranchesSelect');
          if (gitRepoBranchesEl) gitRepoBranchesEl.classList.add('hidden');
          // 隐藏 SVN 项目选择器（结果页项目标签会展示每个项目）
          const svnProjectSelectEl = document.getElementById('svnProjectSelect');
          if (svnProjectSelectEl) svnProjectSelectEl.classList.add('hidden');
        } else if (vcs === 'git') {
          // Git 模式：显示分支选择，获取 Git 用户名
          // SVN 区块隐藏
          const svnAuthorGroupEl = document.getElementById('svnAuthorGroup');
          const gitAuthorGroupEl = document.getElementById('gitAuthorGroup');
          const gitAuthorRowEl = document.getElementById('gitAuthorRow');
          const gitSectionHeaderRowEl = document.getElementById('gitSectionHeaderRow');

          if (svnAuthorGroupEl) svnAuthorGroupEl.classList.add('hidden');
          // Git 区块显示
          if (gitAuthorGroupEl) gitAuthorGroupEl.classList.remove('hidden');
          if (gitAuthorRowEl) gitAuthorRowEl.classList.remove('hidden');
          if (gitSectionHeaderRowEl) gitSectionHeaderRowEl.classList.remove('hidden');

          if (gitAuthorGroupEl) {
            const label = gitAuthorGroupEl.querySelector('label');
            if (label) label.textContent = '提交者账号:';
          }
          authorInput.placeholder = 'Git提交者用户名';
          // 显示多仓库分支选择器
          renderGitRepoBranchesSelect();
          try {
            const gitUserResult = await window.gitlabAPI.getLocalGitUser();
            if (gitUserResult.success && gitUserResult.userName) {
              authorInput.value = gitUserResult.userName;
            }
          } catch (e) {
            console.error('获取 Git 用户名失败:', e);
          }
        } else if (vcs === 'mixed') {
          // 混合模式：显示 SVN 和 Git 两个区块
          if (branchGroup) branchGroup.classList.add('hidden');
          // SVN 区块显示
          document.getElementById('svnAuthorGroup').classList.remove('hidden');
          document.getElementById('svnAuthorInputs').classList.remove('hidden');
          document.getElementById('svnAuthor').value = connectionConfig.svn.username || '';
          // Git 区块显示
          document.getElementById('gitAuthorRow').classList.remove('hidden');
          document.getElementById('gitAuthorGroup').classList.remove('hidden');
          document.getElementById('gitSectionHeaderRow').classList.remove('hidden');
          document.getElementById('gitAuthorGroup').querySelector('label').textContent = 'Git 提交者:';
          authorInput.placeholder = 'Git提交者用户名';
          // 隐藏 SVN 项目选择器（结果页项目标签会展示每个项目）
          const svnProjectSelectEl = document.getElementById('svnProjectSelect');
          if (svnProjectSelectEl) svnProjectSelectEl.classList.add('hidden');
          // 显示 Git 多仓库分支选择器（默认不勾选）
          gitRepos.forEach(repo => {
            ensureSelectedBranchesSet(repo);
            repo.selectedBranches.clear();
          });
          renderGitRepoBranchesSelect();
          // 获取 Git 用户名
          try {
            const gitUserResult = await window.gitlabAPI.getLocalGitUser();
            if (gitUserResult.success && gitUserResult.userName) {
              authorInput.value = gitUserResult.userName;
            }
          } catch (e) {
            console.error('获取 Git 用户名失败:', e);
          }
        }
      }, 1000);
    }
  } catch (error) {
    showStatus(loginStatus, `连接出错: ${error.message}`, 'error');
  } finally {
    loginBtn.disabled = false;
  }
});

// 更换连接按钮
changeConnBtn.addEventListener('click', () => {
  statsCard.classList.add('hidden');
  resultsCard.classList.add('hidden');
  loginCard.classList.remove('hidden');
  loginStatus.textContent = '';
  loginStatus.className = 'status';
});

// 查询按钮点击事件
queryBtn.addEventListener('click', async () => {
  let author;
  if (connectionConfig.vcs === 'svn') {
    author = document.getElementById('svnAuthor').value.trim();
  } else {
    author = authorInput.value.trim();
  }
  console.log('[DEBUG] queryBtn click - vcs:', connectionConfig.vcs, 'author:', author);

  let year, month;
  let startDateStr = '';
  let endDateStr = '';
  const mode = queryModeInput.value;

  // 混合模式需要验证两个作者输入
  if (connectionConfig.vcs === 'mixed') {
    const svnAuthor = document.getElementById('svnAuthor').value.trim();
    if (!svnAuthor) {
      showStatus(queryStatus, '请填写 SVN 提交者账号', 'error');
      return;
    }
    if (!author) {
      showStatus(queryStatus, '请填写 Git 提交者账号', 'error');
      return;
    }
  } else {
    if (!author) {
      showStatus(queryStatus, '请填写提交者账号', 'error');
      return;
    }
  }

  if (mode === 'month') {
    const yearMonth = yearMonthInput.value;
    if (!yearMonth) {
      showStatus(queryStatus, '请选择月份', 'error');
      return;
    }
    const [y, m] = yearMonth.split('-').map(Number);
    year = y; month = m;
    const lastDay = new Date(year, month, 0).getDate();
    startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (mode === 'quarter') {
    const y = parseInt(quarterYearStr.value);
    const q = parseInt(quarterQuarterStr.value);
    year = y; 
    month = q * 3; // fallback 随意指定月份保持签名正常
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const lastDay = new Date(y, endMonth, 0).getDate();
    startDateStr = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    endDateStr = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    // custom
    startDateStr = customStartDate.value;
    endDateStr = customEndDate.value;
    if (!startDateStr || !endDateStr) {
      showStatus(queryStatus, '请选择完整的日期查询范围', 'error');
      return;
    }
    if (new Date(startDateStr) > new Date(endDateStr)) {
      showStatus(queryStatus, '开始日期不能大于结束日期', 'error');
      return;
    }
    const d = new Date(startDateStr);
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }

  queryBtn.disabled = true;
  showStatus(queryStatus, '正在查询统计数据，请稍候...', 'loading');

  try {
    let result;

    if (connectionConfig.vcs === 'svn') {
      // SVN 查询（只查询选中的项目）
      result = await window.svnAPI.getStats(
        getSelectedSvnProjects(),
        connectionConfig.svn.username,
        connectionConfig.svn.password,
        author,
        year,
        month,
        connectionConfig.threshold,
        connectionConfig.formatThreshold,
        startDateStr,
        endDateStr
      );
    } else if (connectionConfig.vcs === 'git') {
      // Git 模式（使用多仓库配置）
      result = await window.multiRepoAPI.getStats({
        author,
        year,
        month,
        threshold: connectionConfig.threshold,
        formatThreshold: connectionConfig.formatThreshold,
        startDate: startDateStr,
        endDate: endDateStr,
        git: connectionConfig.git
      });
    } else if (connectionConfig.vcs === 'mixed') {
      // 混合模式：先获取 SVN 结果，再获取 Git 结果，然后合并
      const svnAuthor = document.getElementById('svnAuthor').value.trim();
      const gitAuthor = authorInput.value.trim();
      const [svnResult, gitResult] = await Promise.all([
        window.svnAPI.getStats(
          getSelectedSvnProjects(),
          connectionConfig.svn.username,
          connectionConfig.svn.password,
          svnAuthor,
          year,
          month,
          connectionConfig.threshold,
          connectionConfig.formatThreshold,
          startDateStr,
          endDateStr
        ),
        window.multiRepoAPI.getStats({
          author: gitAuthor,
          year,
          month,
          threshold: connectionConfig.threshold,
          formatThreshold: connectionConfig.formatThreshold,
          startDate: startDateStr,
          endDate: endDateStr,
          git: connectionConfig.git
        })
      ]);

      if (svnResult.success && gitResult.success) {
        // 合并 SVN 和 Git 的结果
        result = {
          success: true,
          data: mergeQueryResults(svnResult.data, gitResult.data)
        };
      } else if (svnResult.success) {
        // 只有 SVN 成功 - 给所有 commits 添加 source 标记
        result = {
          success: true,
          data: {
            ...svnResult.data,
            commits: (svnResult.data.commits || []).map(c => ({ ...c, source: 'svn' }))
          }
        };
      } else if (gitResult.success) {
        // 只有 Git 成功 - 给所有 commits 添加 source 标记
        result = {
          success: true,
          data: {
            ...gitResult.data,
            commits: (gitResult.data.commits || []).map(c => ({ ...c, source: 'git' }))
          }
        };
      } else {
        result = { success: false, error: 'SVN 和 Git 查询均失败' };
      }
    }

    if (result.success) {
      showStatus(queryStatus, '查询完成！', 'success');
      queryResult = result.data;
      selectedGroup = 'all';
      resultsCard.classList.remove('hidden');
      setTimeout(() => {
        displayResults();
      }, 0);
    } else {
      showStatus(queryStatus, `查询失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(queryStatus, `查询出错: ${error.message}`, 'error');
  } finally {
    queryBtn.disabled = false;
  }
});

// 合并 SVN 和 Git 的查询结果
function mergeQueryResults(svnData, gitData) {
  const merged = {
    totalCommits: (svnData.totalCommits || 0) + (gitData.totalCommits || 0),
    totalAdded: (svnData.totalAdded || 0) + (gitData.totalAdded || 0),
    totalDeleted: (svnData.totalDeleted || 0) + (gitData.totalDeleted || 0),
    overThresholdCount: (svnData.overThresholdCount || 0) + (gitData.overThresholdCount || 0),
    formatCodeCount: (svnData.formatCodeCount || 0) + (gitData.formatCodeCount || 0),
    activeDays: [],
    commitTypeStats: {},
    chartData: [],
    commits: [],
    projectStats: {},
    branchStats: {}
  };

  // 合并活跃天数（去重）- 安全处理非数组情况
  const svnActiveDays = Array.isArray(svnData.activeDays) ? svnData.activeDays : [];
  const gitActiveDays = Array.isArray(gitData.activeDays) ? gitData.activeDays : [];
  const activeDaysSet = new Set([...svnActiveDays, ...gitActiveDays]);
  merged.activeDays = Array.from(activeDaysSet);

  // 合并提交类型统计
  const typeKeys = new Set([...Object.keys(svnData.commitTypeStats || {}), ...Object.keys(gitData.commitTypeStats || {})]);
  typeKeys.forEach(type => {
    merged.commitTypeStats[type] = (svnData.commitTypeStats?.[type] || 0) + (gitData.commitTypeStats?.[type] || 0);
  });

  // 合并图表数据（按日期合并）
  const chartMap = {};
  [...(svnData.chartData || []), ...(gitData.chartData || [])].forEach(day => {
    if (!chartMap[day.date]) {
      chartMap[day.date] = { date: day.date, added: 0, deleted: 0, commits: 0 };
    }
    chartMap[day.date].added += day.added;
    chartMap[day.date].deleted += day.deleted;
    chartMap[day.date].commits += day.commits;
  });
  merged.chartData = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date));

  // 合并提交记录
  const svnCommits = (svnData.commits || []).map(c => ({ ...c, source: 'svn' }));
  const gitCommits = (gitData.commits || []).map(c => ({ ...c, source: 'git' }));
  merged.commits = [...svnCommits, ...gitCommits];
  // 按日期排序
  merged.commits.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 合并项目统计（SVN 用 projectStats）
  Object.assign(merged.projectStats, svnData.projectStats || {});

  // 合并分支统计（Git 用 branchStats）
  // 对于混合模式，同时保留 SVN 和 Git 的统计数据用于显示
  Object.keys(gitData.branchStats || {}).forEach(branchKey => {
    merged.branchStats[branchKey] = gitData.branchStats[branchKey];
  });

  return merged;
}

// 显示状态信息
function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;
}

// 显示统计结果
function displayResults() {
  renderGroupingTabs();
  updateStats();
  renderBreakdownTable();
  updateCharts();
  applyFilter();
}

// 根据选中的分组更新图表
function updateCharts() {
  if (!queryResult) return;

  let chartData;
  let commitTypeStats;

  if (selectedGroup === 'all') {
    chartData = queryResult.chartData;
    commitTypeStats = queryResult.commitTypeStats;
  } else {
    chartData = [];
    commitTypeStats = {};
    // 从 branchStats/projectStats 中提取选中分组的数据
    const isGit = connectionConfig.vcs === 'git';
    const isMixed = connectionConfig.vcs === 'mixed';
    let statsSource;
    let groupStats;

    if (selectedGroup !== 'all') {
      // 单模式：使用原有逻辑
      if (isMixed) {
        // 混合模式根据 selectedGroup 判断使用哪个统计源
        if (selectedGroup.startsWith('[SVN] ')) {
          // SVN 项目：直接查找 projectStats
          statsSource = queryResult.projectStats;
          groupStats = statsSource ? statsSource[selectedGroup.replace('[SVN] ', '')] : null;
        } else if (selectedGroup.includes('/')) {
          // Git 分支级别 tab：格式为 "repoName/branchName"，直接查找 branchStats
          const branchKey = selectedGroup;
          groupStats = queryResult.branchStats ? queryResult.branchStats[branchKey] : null;
          if (!groupStats) {
            renderLineChart([]);
            renderBarChart([]);
            renderPieChart({});
            return;
          }
          // 构建 chartData
          const allDates = Object.keys(groupStats.dailyStats || {}).sort();
          for (const dateStr of allDates) {
            const dayStats = groupStats.dailyStats[dateStr];
            chartData.push({
              date: dateStr,
              added: dayStats.added,
              deleted: dayStats.deleted,
              commits: dayStats.commits
            });
          }
          // 构建 commitTypeStats
          commitTypeStats = {};
          // selectedGroup 格式为 "repoName/branchName"，其中 branchName 可能包含斜杠
          const slashIndex = selectedGroup.indexOf('/');
          const repoName = slashIndex > 0 ? selectedGroup.substring(0, slashIndex) : selectedGroup;
          const branchName = slashIndex > 0 ? selectedGroup.substring(slashIndex + 1) : '';
          for (const commit of queryResult.commits) {
            if (commit.repoName === repoName && commit.branch === branchName) {
              const type = commit.commitType || 'other';
              commitTypeStats[type] = (commitTypeStats[type] || 0) + 1;
            }
          }
          renderLineChart(chartData);
          renderBarChart(chartData);
          renderPieChart(commitTypeStats);
          return;
        } else {
          groupStats = null;
        }
      } else if (isGit) {
        // Git 模式：直接使用 selectedGroup 作为 branchKey 查找
        statsSource = isGit ? queryResult.branchStats : queryResult.projectStats;
        groupStats = statsSource ? statsSource[selectedGroup] : null;
      } else {
        // SVN 模式：直接使用 selectedGroup 作为 projectKey 查找
        statsSource = queryResult.projectStats;
        groupStats = statsSource ? statsSource[selectedGroup] : null;
      }
    }

    // 如果 chartData 已经有值（仓库级别 tab 已设置），跳过 chartData 构建
    // 同时跳过 commitTypeStats 构建因为已经计算过了
    if (chartData.length > 0) {
      // chartData 已有值，直接返回（不覆盖 commitTypeStats）
      renderLineChart(chartData);
      renderBarChart(chartData);
      renderPieChart(commitTypeStats);
      return;
    }

    if (!groupStats) {
      // 即使没有数据也要渲染空图表
      renderLineChart([]);
      renderBarChart([]);
      renderPieChart({});
      return;
    }

    // 重构 chartData：从 groupStats.dailyStats 构建

    // 重构 chartData：从 groupStats.dailyStats 构建
    const allDates = Object.keys(groupStats.dailyStats || {}).sort();
    for (const dateStr of allDates) {
      const dayStats = groupStats.dailyStats[dateStr];
      chartData.push({
        date: dateStr,
        added: dayStats.added,
        deleted: dayStats.deleted,
        commits: dayStats.commits
      });
    }

    // 重构 commitTypeStats：遍历该分组的 commits 统计
    const isGitMode = connectionConfig.vcs === 'git';
    const isMixedMode = connectionConfig.vcs === 'mixed';
    for (const commit of queryResult.commits) {
      if (isMixedMode) {
        if (selectedGroup.startsWith('[SVN] ')) {
          const name = selectedGroup.replace('[SVN] ', '');
          if (commit.project !== name) continue;
        } else if (selectedGroup.includes('/')) {
          // 使用第一个斜杠分割仓库名和分支名
          const slashIdx = selectedGroup.indexOf('/');
          const repoName = selectedGroup.substring(0, slashIdx);
          const branchName = selectedGroup.substring(slashIdx + 1);
          if (commit.repoName !== repoName || commit.branch !== branchName) continue;
        } else if (selectedGroup.startsWith('[Git] ')) {
          const name = selectedGroup.replace('[Git] ', '');
          if (commit.repoName !== name) continue;
        } else {
          continue;
        }
      } else if (isGitMode) {
        // Git 模式 selectedGroup 格式为 "repoName/branchName"，branchName 可能包含斜杠
        const slashIdx = selectedGroup.indexOf('/');
        const repoName = selectedGroup.substring(0, slashIdx);
        const branchName = selectedGroup.substring(slashIdx + 1);
        if (commit.repoName !== repoName || commit.branch !== branchName) continue;
      } else {
        if (commit.project !== selectedGroup) continue;
      }
      const type = commit.commitType || 'other';
      commitTypeStats[type] = (commitTypeStats[type] || 0) + 1;
    }
  }

  renderLineChart(chartData);
  renderBarChart(chartData);
  renderPieChart(commitTypeStats);
}

// 渲染分组选项卡（项目或分支）
function renderGroupingTabs() {
  const isGit = connectionConfig.vcs === 'git';
  const isMixed = connectionConfig.vcs === 'mixed';
  const isSvn = connectionConfig.vcs === 'svn';
  const svnStatsSource = queryResult.projectStats || {};
  const gitStatsSource = queryResult.branchStats || {};

  console.log('[DEBUG] renderGroupingTabs', {
    vcs: connectionConfig.vcs,
    svnStatsSourceKeys: Object.keys(svnStatsSource),
    gitStatsSourceKeys: Object.keys(gitStatsSource),
    queryResultProjectStats: queryResult.projectStats,
    connectionConfigSvnProjects: connectionConfig.svn?.projects,
    mergedKeys: Object.keys(queryResult)
  });

  const allText = isMixed ? '全部' : (isGit ? '全部仓库' : '全部项目');

  let html = `<button class="project-tab ${selectedGroup === 'all' ? 'active' : ''}" data-group="all">${allText}</button>`;

  // Git 模式：使用 branchStats，显示每个分支的 tab
  if (isGit) {
    Object.keys(gitStatsSource || {}).forEach(key => {
      const stats = gitStatsSource[key];
      // tab 显示格式：仓库名/分支名
      const tabName = `${stats.repoName}/${stats.branchName}`;
      html += `<button class="project-tab ${selectedGroup === tabName ? 'active' : ''}" data-group="${tabName}">${tabName}</button>`;
    });
  } else if (isMixed) {
    // 混合模式：先显示 SVN 项目，再显示 Git 仓库分支
    // SVN 项目：使用 projectStats 的 key（包含 [SVN] 前缀）
    Object.keys(svnStatsSource || {}).forEach(name => {
      const tabName = `[SVN] ${name}`;
      html += `<button class="project-tab ${selectedGroup === tabName ? 'active' : ''}" data-group="${tabName}">${tabName}</button>`;
    });
    // Git 分支：使用 branchStats，显示每个分支 tab，格式为 "repoName/branchName"
    Object.keys(gitStatsSource || {}).forEach(key => {
      const stats = gitStatsSource[key];
      const tabName = `${stats.repoName}/${stats.branchName}`;
      html += `<button class="project-tab ${selectedGroup === tabName ? 'active' : ''}" data-group="${tabName}">[Git] ${tabName}</button>`;
    });
  } else {
    // SVN 模式：优先使用 connectionConfig.svn.projects 显示所有项目
    const svnProjects = connectionConfig.svn?.projects || [];
    if (svnProjects.length > 0) {
      // 显示所有配置的项目（无论有没有统计数据）
      svnProjects.forEach(project => {
        const hasStats = svnStatsSource[project.name];
        html += `<button class="project-tab ${selectedGroup === project.name ? 'active' : ''}" data-group="${project.name}">${project.name}${hasStats ? '' : '(无数据)'}</button>`;
      });
    } else {
      // 回退到 projectStats
      Object.keys(svnStatsSource || {}).forEach(name => {
        html += `<button class="project-tab ${selectedGroup === name ? 'active' : ''}" data-group="${name}">${name}</button>`;
      });
    }
  }

  projectTabs.innerHTML = html;

  // 绑定点击事件
  projectTabs.querySelectorAll('.project-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedGroup = tab.dataset.group;
      projectTabs.querySelectorAll('.project-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateStats();
      updateCharts();
      applyFilter();
    });
  });
}

function renderBranchCheckboxes(groupName) {
  const groupStats = queryResult.branchStats[groupName];
  if (!groupStats || !groupStats.dailyStats) return '';
  const branches = Object.keys(groupStats.dailyStats);
  return branches.map(branch => `
    <label class="branch-checkbox-label">
      <input type="checkbox" value="${branch}" checked onchange="onBranchFilterChange('${groupName}', this.checked)">
      ${branch}
    </label>
  `).join('');
}

// 分支筛选变化处理
function onBranchFilterChange(groupName, checked) {
  // 获取该仓库下的所有分支复选框
  const checkboxes = document.querySelectorAll(`.branch-filter[data-for="${groupName}"] input[type="checkbox"]`);
  const selectedBranches = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

  // 至少要选择一个分支
  if (selectedBranches.length === 0) {
    // 恢复该复选框的勾选状态
    const checkbox = Array.from(checkboxes).find(cb => cb.value === groupName.split(' ').pop());
    if (checkbox) checkbox.checked = true;
    alert('请至少选择一个分支');
    return;
  }

  // 设置 selectedGroup 为该仓库
  selectedGroup = groupName;

  // 获取该仓库的分支统计数据，用于判断哪些提交属于哪个分支
  const groupStats = queryResult.branchStats[groupName];
  if (!groupStats) {
    console.error('未找到分组统计数据:', groupName);
    return;
  }

  // 构建日期到分支的映射：哪些分支在哪些日期有提交
  // 因为 commit 对象没有 branch 字段，我们需要通过 branchStats 来推断
  const dateToBranches = {}; // { "2024-01-15": Set(["main", "dev"]) }
  for (const branch of Object.keys(groupStats.dailyStats || {})) {
    const dailyStats = groupStats.dailyStats[branch];
    for (const dateStr of Object.keys(dailyStats)) {
      if (!dateToBranches[dateStr]) {
        dateToBranches[dateStr] = new Set();
      }
      dateToBranches[dateStr].add(branch);
    }
  }

  // 筛选 commits - 只针对该仓库的分支进行筛选
  const filteredCommits = queryResult.commits.filter(c => {
    // 检查是否属于该仓库（通过 project 字段匹配）
    const isSameGroup = c.project === groupName || c.project.startsWith(groupName + ' ') || c.project.startsWith('[Git] ' + groupName + '/');
    if (!isSameGroup) return true; // 不属于该仓库的提交保留
    // 属于该仓库的提交，判断日期对应的分支是否选中
    const dateStr = c.date.substring(0, 10);
    const branchesOnDate = dateToBranches[dateStr];
    if (!branchesOnDate) return true; // 找不到对应日期的分支，保留
    // 检查是否有任何选中的分支在该日期有提交
    return selectedBranches.some(b => branchesOnDate.has(b));
  });

  // 更新统计卡片
  const stats = calculateGroupStats(groupName, filteredCommits);
  totalCommitsEl.textContent = stats.totalCommits;
  totalAddedEl.textContent = stats.totalAdded.toLocaleString();
  totalDeletedEl.textContent = stats.totalDeleted.toLocaleString();
  netLinesEl.textContent = (stats.totalAdded - stats.totalDeleted).toLocaleString();
  overThresholdCountEl.textContent = stats.overThresholdCount;
  formatCodeCountEl.textContent = stats.formatCodeCount;

  // 更新活跃天数
  const activeDays = new Set(filteredCommits.map(c => c.date.substring(0, 10)));
  document.getElementById('activeDays').textContent = activeDays.size + '天';

  // 更新图表
  const chartData = buildFilteredChartData(groupName, selectedBranches, filteredCommits);
  renderLineChart(chartData);
  renderBarChart(chartData);

  // 更新饼图
  const commitTypeStats = {};
  for (const commit of filteredCommits) {
    commitTypeStats[commit.commitType] = (commitTypeStats[commit.commitType] || 0) + 1;
  }
  renderPieChart(commitTypeStats);

  // 更新提交表格
  filteredCommits = filteredCommits;
  currentPage = 1;
  renderCommitsTable();
  renderPagination();
}

// 计算分组统计
function calculateGroupStats(groupName, commits) {
  let totalCommits = 0, totalAdded = 0, totalDeleted = 0;
  let overThresholdCount = 0, formatCodeCount = 0;
  const commitTypeStats = {};
  const dailyStats = {};

  for (const commit of commits) {
    if (commit.project !== groupName && !commit.project.startsWith(groupName + ' ') && !commit.project.startsWith('[Git] ' + groupName + '/')) continue;
    totalCommits++;
    totalAdded += commit.added;
    totalDeleted += commit.deleted;
    if (commit.status === 'over') overThresholdCount++;
    if (commit.status === 'format') formatCodeCount++;
    commitTypeStats[commit.commitType] = (commitTypeStats[commit.commitType] || 0) + 1;

    const dateStr = commit.date.substring(0, 10);
    if (!dailyStats[dateStr]) {
      dailyStats[dateStr] = { added: 0, deleted: 0, commits: 0 };
    }
    dailyStats[dateStr].added += commit.added;
    dailyStats[dateStr].deleted += commit.deleted;
    dailyStats[dateStr].commits++;
  }

  return { totalCommits, totalAdded, totalDeleted, overThresholdCount, formatCodeCount, commitTypeStats, dailyStats };
}

// 构建筛选后的图表数据
function buildFilteredChartData(groupName, selectedBranches, filteredCommits) {
  const dailyMap = {};
  for (const commit of filteredCommits) {
    if (commit.project !== groupName && !commit.project.startsWith(groupName + ' ') && !commit.project.startsWith('[Git] ' + groupName + '/')) continue;
    const dateStr = commit.date.substring(0, 10);
    if (!dailyMap[dateStr]) {
      dailyMap[dateStr] = { added: 0, deleted: 0, commits: 0 };
    }
    dailyMap[dateStr].added += commit.added;
    dailyMap[dateStr].deleted += commit.deleted;
    dailyMap[dateStr].commits++;
  }
  const allDates = Object.keys(dailyMap).sort();
  return allDates.map(date => ({
    date,
    added: dailyMap[date].added,
    deleted: dailyMap[date].deleted,
    commits: dailyMap[date].commits
  }));
}

// 更新统计数据
function updateStats() {
  let stats;
  const isGit = connectionConfig.vcs === 'git';
  const isMixed = connectionConfig.vcs === 'mixed';
  let statsSource;
  let isRepoLevelTab = false;
  let groupStats = null;

  if (isMixed) {
    // 混合模式：同时检查 projectStats 和 branchStats
    statsSource = { ...queryResult.projectStats, ...queryResult.branchStats };
  } else {
    statsSource = isGit ? queryResult.branchStats : queryResult.projectStats;
  }

  console.log('[DEBUG] updateStats', {
    selectedGroup,
    isGit,
    isMixed,
    statsSourceKeys: Object.keys(statsSource || {}),
    statsSourceForSelectedGroup: statsSource?.[selectedGroup]
  });

  const breakdownSection = document.getElementById('projectStatsSection');
  const breakdownTitle = breakdownSection.querySelector('h3');

  if (selectedGroup === 'all') {
    stats = {
      totalCommits: queryResult.totalCommits,
      totalAdded: queryResult.totalAdded,
      totalDeleted: queryResult.totalDeleted,
      overThresholdCount: queryResult.overThresholdCount,
      formatCodeCount: queryResult.formatCodeCount
    };
    breakdownSection.classList.remove('hidden');
    breakdownTitle.textContent = isGit ? '各分支代码量统计' : '各项目代码量统计';
  } else {
    // 处理 Git 或混合模式的仓库级别 tab
    let lookupKey = selectedGroup;

    // 混合模式需要处理前缀
    if (isMixed) {
      if (selectedGroup.startsWith('[SVN] ')) {
        lookupKey = selectedGroup.replace('[SVN] ', '');
        statsSource = queryResult.projectStats;
        groupStats = statsSource ? statsSource[lookupKey] : null;
        isRepoLevelTab = false;
      } else if (selectedGroup.includes('/')) {
        // Git 分支级别 tab：格式为 "repoName/branchName"，直接查找 branchStats
        const branchKey = selectedGroup;
        groupStats = queryResult.branchStats ? queryResult.branchStats[branchKey] : null;
        isRepoLevelTab = false;
      } else if (selectedGroup.startsWith('[Git] ')) {
        // Git 仓库级别 tab（遗留格式）：收集该仓库所有分支的数据并合并
        lookupKey = selectedGroup.replace('[Git] ', '');
        let aggregatedStats = null;
        for (const [branchKey, branchData] of Object.entries(queryResult.branchStats || {})) {
          if (branchData.repoName === lookupKey) {
            if (!aggregatedStats) {
              aggregatedStats = {
                totalCommits: 0,
                totalAdded: 0,
                totalDeleted: 0,
                overThresholdCount: 0,
                formatCodeCount: 0
              };
            }
            aggregatedStats.totalCommits += branchData.totalCommits;
            aggregatedStats.totalAdded += branchData.totalAdded;
            aggregatedStats.totalDeleted += branchData.totalDeleted;
            aggregatedStats.overThresholdCount += branchData.overThresholdCount;
            aggregatedStats.formatCodeCount += branchData.formatCodeCount;
          }
        }
        groupStats = aggregatedStats;
        isRepoLevelTab = true;
      }
    } else if (isGit) {
      // 纯 Git 模式：直接使用 selectedGroup 作为 branchKey 查找
      groupStats = statsSource ? statsSource[selectedGroup] : null;
    } else {
      // SVN 模式
      groupStats = statsSource ? statsSource[lookupKey] : null;
      isRepoLevelTab = false;
    }

    console.log('[DEBUG] updateStats groupStats lookup', { selectedGroup, lookupKey, isMixed, isGit, isRepoLevelTab, groupStats });
    if (!groupStats) {
      // 项目没有统计数据，显示为空
      stats = {
        totalCommits: 0,
        totalAdded: 0,
        totalDeleted: 0,
        overThresholdCount: 0,
        formatCodeCount: 0
      };
    } else {
      stats = {
        totalCommits: groupStats.totalCommits,
        totalAdded: groupStats.totalAdded,
        totalDeleted: groupStats.totalDeleted,
        overThresholdCount: groupStats.overThresholdCount,
        formatCodeCount: groupStats.formatCodeCount
      };
    }
    breakdownSection.classList.add('hidden');
  }

  totalCommitsEl.textContent = stats.totalCommits;
  totalAddedEl.textContent = stats.totalAdded.toLocaleString();
  totalDeletedEl.textContent = stats.totalDeleted.toLocaleString();
  netLinesEl.textContent = (stats.totalAdded - stats.totalDeleted).toLocaleString();
  overThresholdCountEl.textContent = stats.overThresholdCount;
  formatCodeCountEl.textContent = stats.formatCodeCount;

  // 活跃天数：选择全部时用全局数据，选择分支时用该分支的数据
  if (selectedGroup === 'all') {
    const activeDaysCount = Array.isArray(queryResult.activeDays)
      ? queryResult.activeDays.length
      : (queryResult.activeDays || 0);
    document.getElementById('activeDays').textContent = activeDaysCount + '天';
  } else {
    // 从分支的 dailyStats 计算活跃天数
    let activeDays = 0;
    if (isRepoLevelTab && groupStats && groupStats.dailyStats) {
      activeDays = Object.keys(groupStats.dailyStats).length;
    } else if (groupStats && groupStats.dailyStats) {
      activeDays = Object.keys(groupStats.dailyStats).length;
    }
    document.getElementById('activeDays').textContent = activeDays + '天';
  }
}

// 渲染项目/分支统计表格
function renderBreakdownTable() {
  const isGit = connectionConfig.vcs === 'git';
  const isMixed = connectionConfig.vcs === 'mixed';
  const statsSource = isGit ? queryResult.branchStats : (isMixed ? { ...queryResult.projectStats, ...queryResult.branchStats } : queryResult.projectStats);
  const headerLabel = isGit ? '项目名称' : '项目名称';

  const projectStatsBody = document.getElementById('projectStatsBody');
  const projectStatsFoot = document.getElementById('projectStatsFoot');
  const tableHeader = document.querySelector('#projectStatsTable th');

  tableHeader.textContent = headerLabel;
  const groupNames = Object.keys(statsSource || {});

  if (groupNames.length === 0) {
    projectStatsBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #999; padding: 20px;">暂无数据</td></tr>';
    projectStatsFoot.innerHTML = '';
    return;
  }

  let totalCommits = 0, totalAdded = 0, totalDeleted = 0, totalFeat = 0, totalFix = 0, totalOther = 0;

  let html = '';

  if (isGit || (isMixed && Object.keys(queryResult.branchStats || {}).length > 0)) {
    // Git 模式/混合模式 Git 部分：按仓库分组，渲染树形表格
    const repoGroups = {};
    const gitGroupNames = Object.keys(queryResult.branchStats || {});

    for (const key of gitGroupNames) {
      const stats = queryResult.branchStats[key];
      const repoName = stats.repoName || key.split('/')[0];
      if (!repoGroups[repoName]) {
        repoGroups[repoName] = {
          branches: {},
          totalCommits: 0, totalAdded: 0, totalDeleted: 0,
          featCount: 0, fixCount: 0, otherCount: 0
        };
      }
      repoGroups[repoName].branches[key] = stats;
      repoGroups[repoName].totalCommits += stats.totalCommits;
      repoGroups[repoName].totalAdded += stats.totalAdded;
      repoGroups[repoName].totalDeleted += stats.totalDeleted;
      repoGroups[repoName].featCount += stats.featCount || 0;
      repoGroups[repoName].fixCount += stats.fixCount || 0;
      repoGroups[repoName].otherCount += stats.otherCount || 0;

      totalCommits += stats.totalCommits;
      totalAdded += stats.totalAdded;
      totalDeleted += stats.totalDeleted;
      totalFeat += stats.featCount || 0;
      totalFix += stats.fixCount || 0;
      totalOther += stats.otherCount || 0;
    }

    for (const [repoName, repoData] of Object.entries(repoGroups)) {
      const repoNet = repoData.totalAdded - repoData.totalDeleted;
      const branchCount = Object.keys(repoData.branches).length;

      // 仓库父节点 - 默认展开
      html += `
        <tr class="stats-repo-row expanded" data-repo="${escapeHtml(repoName)}">
          <td><span class="expand-icon" data-action="toggle">▼</span> <span class="vcs-tag git-tag">[Git]</span> ${escapeHtml(repoName)} (${branchCount}个分支)</td>
          <td class="num">${repoData.totalCommits}</td>
          <td class="num added">+${repoData.totalAdded.toLocaleString()}</td>
          <td class="num deleted">-${repoData.totalDeleted.toLocaleString()}</td>
          <td class="num net">${repoNet >= 0 ? '+' : ''}${repoNet.toLocaleString()}</td>
          <td class="num feat">${repoData.featCount}</td>
          <td class="num fix">${repoData.fixCount}</td>
          <td class="num other">${repoData.otherCount}</td>
        </tr>
      `;

      // 分支子节点
      for (const [branchKey, branchStats] of Object.entries(repoData.branches)) {
        const branchName = branchStats.branchName || branchKey.split('/')[1] || branchKey;
        const branchNet = branchStats.totalAdded - branchStats.totalDeleted;
        html += `
          <tr class="stats-branch-row" data-repo="${escapeHtml(repoName)}">
            <td style="padding-left: 30px;">└ ${escapeHtml(branchName)}</td>
            <td class="num">${branchStats.totalCommits}</td>
            <td class="num added">+${branchStats.totalAdded.toLocaleString()}</td>
            <td class="num deleted">-${branchStats.totalDeleted.toLocaleString()}</td>
            <td class="num net">${branchNet >= 0 ? '+' : ''}${branchNet.toLocaleString()}</td>
            <td class="num feat">${branchStats.featCount || 0}</td>
            <td class="num fix">${branchStats.fixCount || 0}</td>
            <td class="num other">${branchStats.otherCount || 0}</td>
          </tr>
        `;
      }
    }
  }

  // SVN 部分（混合模式或纯 SVN 模式）
  if (!isGit || (isMixed && Object.keys(queryResult.projectStats || {}).length > 0)) {
    const svnGroupNames = Object.keys(statsSource || {});
    svnGroupNames.forEach(name => {
      // 跳过 Git 的统计数据（已经在上面处理了）
      if (queryResult.branchStats && queryResult.branchStats[name]) return;

      const groupStats = statsSource[name];
      if (!groupStats) return;
      const net = groupStats.totalAdded - groupStats.totalDeleted;

      totalCommits += groupStats.totalCommits;
      totalAdded += groupStats.totalAdded;
      totalDeleted += groupStats.totalDeleted;
      totalFeat += groupStats.featCount || 0;
      totalFix += groupStats.fixCount || 0;
      totalOther += groupStats.otherCount || 0;

      html += `
        <tr>
          <td><span class="vcs-tag svn-tag">[SVN]</span> ${escapeHtml(name)}</td>
          <td class="num">${groupStats.totalCommits}</td>
          <td class="num added">+${groupStats.totalAdded.toLocaleString()}</td>
          <td class="num deleted">-${groupStats.totalDeleted.toLocaleString()}</td>
          <td class="num net">${net >= 0 ? '+' : ''}${net.toLocaleString()}</td>
          <td class="num feat">${groupStats.featCount || 0}</td>
          <td class="num fix">${groupStats.fixCount || 0}</td>
          <td class="num other">${groupStats.otherCount || 0}</td>
        </tr>
      `;
    });
  }

  projectStatsBody.innerHTML = html;

  // 使用事件委托处理展开/折叠
  projectStatsBody.onclick = function(e) {
    const icon = e.target.closest('.expand-icon');
    if (icon) {
      toggleStatsRepoRow(icon);
    }
  };

  const totalNet = totalAdded - totalDeleted;
  projectStatsFoot.innerHTML = `
    <tr>
      <td>合计</td>
      <td class="num">${totalCommits}</td>
      <td class="num added">+${totalAdded.toLocaleString()}</td>
      <td class="num deleted">-${totalDeleted.toLocaleString()}</td>
      <td class="num net">${totalNet >= 0 ? '+' : ''}${totalNet.toLocaleString()}</td>
      <td class="num feat">${totalFeat}</td>
      <td class="num fix">${totalFix}</td>
      <td class="num other">${totalOther}</td>
    </tr>
  `;
}

// 切换统计表格仓库行的展开/折叠
function toggleStatsRepoRow(icon) {
  const row = icon.closest('tr');
  const repoName = row.dataset.repo;
  const isExpanded = row.classList.contains('expanded');

  // 切换父节点图标
  if (isExpanded) {
    row.classList.remove('expanded');
    icon.textContent = '▼';
  } else {
    row.classList.add('expanded');
    icon.textContent = '▲';
  }

  // 获取表格所有行
  const tbody = row.parentNode;
  const allRows = Array.from(tbody.querySelectorAll('tr'));
  const rowIndex = allRows.indexOf(row);
  const isSVN = connectionConfig.vcs !== 'git';

  // 遍历后续行
  for (let i = rowIndex + 1; i < allRows.length; i++) {
    const r = allRows[i];
    // SVN 模式或遇到下一个仓库父节点则停止
    if (isSVN || r.classList.contains('stats-repo-row')) {
      break;
    }
    // 同仓库的分支行，切换显示
    if (r.classList.contains('stats-branch-row') && r.dataset.repo === repoName) {
      r.style.display = isExpanded ? 'none' : '';
    }
  }
}

// 筛选提交记录
function applyFilter() {
  const typeFilter = filterType.value;
  const statusFilter = filterStatus.value;
  const keywordFilter = filterKeyword.value.toLowerCase().trim();

  let commits = queryResult.commits;

  // 按分组（项目或仓库）筛选
  if (selectedGroup !== 'all') {
    commits = commits.filter(c => {
      if (connectionConfig.vcs === 'git') {
        // selectedGroup 格式为 "repoName/branchName"，branchName 可能包含斜杠
        const slashIdx = selectedGroup.indexOf('/');
        const repoName = selectedGroup.substring(0, slashIdx);
        const branchName = selectedGroup.substring(slashIdx + 1);
        return c.repoName === repoName && c.branch === branchName;
      } else if (connectionConfig.vcs === 'svn') {
        return c.project === selectedGroup;
      } else if (connectionConfig.vcs === 'mixed') {
        // 混合模式根据 selectedGroup 格式判断
        if (selectedGroup.startsWith('[SVN] ')) {
          const name = selectedGroup.replace('[SVN] ', '');
          return c.project === name;
        } else if (selectedGroup.includes('/')) {
          // Git 分支级别 tab：格式为 "repoName/branchName"，branchName 可能包含斜杠
          const slashIdx = selectedGroup.indexOf('/');
          const repoName = selectedGroup.substring(0, slashIdx);
          const branchName = selectedGroup.substring(slashIdx + 1);
          return c.repoName === repoName && c.branch === branchName;
        } else if (selectedGroup.startsWith('[Git] ')) {
          // Git 仓库级别 tab（遗留格式）
          const name = selectedGroup.replace('[Git] ', '');
          return c.repoName === name;
        }
      }
      return true;
    });
  }

  // 按类型筛选
  if (typeFilter) {
    commits = commits.filter(c => c.commitType === typeFilter);
  }

  // 按状态筛选
  if (statusFilter) {
    commits = commits.filter(c => c.status === statusFilter);
  }

  // 按关键词筛选
  if (keywordFilter) {
    commits = commits.filter(c =>
      c.message.toLowerCase().includes(keywordFilter) ||
      c.revision.includes(keywordFilter) ||
      c.project.toLowerCase().includes(keywordFilter) ||
      (c.branch && c.branch.toLowerCase().includes(keywordFilter))
    );
  }

  filteredCommits = commits;
  currentPage = 1;
  // 筛选后清空选中状态
  selectedCommitIndices.clear();
  renderCommitsTable();
  renderPagination();
}

// 筛选按钮事件
filterBtn.addEventListener('click', applyFilter);
resetFilterBtn.addEventListener('click', () => {
  filterType.value = '';
  filterStatus.value = '';
  filterKeyword.value = '';
  applyFilter();
});

// 渲染提交记录表格
function renderCommitsTable() {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageCommits = filteredCommits.slice(start, end);

  if (pageCommits.length === 0) {
    commitsBody.innerHTML = '<tr><td colspan="12" style="text-align: center; color: #999; padding: 30px;">暂无提交记录</td></tr>';
    updateSelectedCount();
    return;
  }

  const isGit = connectionConfig.vcs === 'git';
  const isMixed = connectionConfig.vcs === 'mixed';
  let html = '';

  // 分离 Git 提交和 SVN 提交
  const gitCommits = pageCommits.filter(c => c.repoName || c.branch);
  const svnCommits = pageCommits.filter(c => !c.repoName && !c.branch);

  if ((isGit || (isMixed && gitCommits.length > 0)) && gitCommits.length > 0) {
    // Git 模式或混合模式 Git 部分：按仓库分组，渲染树形表格
    const repoGroups = {};
    for (const commit of gitCommits) {
      const repoName = commit.repoName || commit.project;
      if (!repoGroups[repoName]) {
        repoGroups[repoName] = [];
      }
      repoGroups[repoName].push(commit);
    }

    for (const [repoName, commits] of Object.entries(repoGroups)) {
      // 仓库父节点 - 默认展开
      html += `
        <tr class="repo-row expanded" data-repo="${escapeHtml(repoName)}">
          <td class="checkbox-col"><input type="checkbox" class="repo-checkbox" data-repo="${escapeHtml(repoName)}" onchange="toggleRepoCommits('${escapeHtml(repoName)}', this.checked)"></td>
          <td><span class="expand-icon" data-action="toggle">▼</span> <span class="vcs-tag git-tag">[Git]</span> ${escapeHtml(repoName)}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </tr>
      `;

      // 按分支排序的子节点
      const branchGroups = {};
      for (const commit of commits) {
        const branchName = commit.branch || 'main';
        if (!branchGroups[branchName]) {
          branchGroups[branchName] = [];
        }
        branchGroups[branchName].push(commit);
      }

      for (const [branchName, branchCommits] of Object.entries(branchGroups)) {
        for (const commit of branchCommits) {
          const globalIndex = filteredCommits.indexOf(commit);
          const dateStr = commit.date.substring(0, 10);
          const statusText = {
            normal: '正常',
            over: '超阈值',
            format: '格式化'
          }[commit.status];
          const isChecked = selectedCommitIndices.has(globalIndex) ? 'checked' : '';

          html += `
            <tr class="commit-row" data-repo="${escapeHtml(repoName)}">
              <td class="checkbox-col"><input type="checkbox" class="commit-checkbox" data-index="${globalIndex}" ${isChecked}></td>
              <td style="padding-left: 30px;">└ ${escapeHtml(branchName)}</td>
              <td>${escapeHtml(branchName)}</td>
              <td>${commit.revision}</td>
              <td>${dateStr}</td>
              <td><span class="commit-type ${commit.commitType}">${commit.commitType}</span></td>
              <td class="commit-message" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</td>
              <td class="num added">+${commit.added}</td>
              <td class="num deleted">-${commit.deleted}</td>
              <td class="num">${commit.net >= 0 ? '+' : ''}${commit.net}</td>
              <td><span class="commit-status ${commit.status}">${statusText}</span></td>
              <td>
                <button class="btn-view-diff" onclick="viewCommitDiff(${globalIndex})">查看</button>
                <button class="btn-review" onclick="reviewCommitCode(${globalIndex})" title="AI审查">🔍</button>
              </td>
            </tr>
          `;
        }
      }
    }
  }

  // SVN 提交渲染（混合模式或纯 SVN 模式）
  if (svnCommits.length > 0) {
    for (const commit of svnCommits) {
      const globalIndex = filteredCommits.indexOf(commit);
      const dateStr = commit.date.substring(0, 10);
      const statusText = {
        normal: '正常',
        over: '超阈值',
        format: '格式化'
      }[commit.status];

      const isChecked = selectedCommitIndices.has(globalIndex) ? 'checked' : '';

      html += `
        <tr>
          <td class="checkbox-col"><input type="checkbox" class="commit-checkbox" data-index="${globalIndex}" ${isChecked}></td>
          <td><span class="vcs-tag svn-tag">[SVN]</span> ${escapeHtml(commit.project)}</td>
          <td>-</td>
          <td>${commit.revision}</td>
          <td>${dateStr}</td>
          <td><span class="commit-type ${commit.commitType}">${commit.commitType}</span></td>
          <td class="commit-message" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</td>
          <td class="num added">+${commit.added}</td>
          <td class="num deleted">-${commit.deleted}</td>
          <td class="num">${commit.net >= 0 ? '+' : ''}${commit.net}</td>
          <td><span class="commit-status ${commit.status}">${statusText}</span></td>
          <td>
            <button class="btn-view-diff" onclick="viewCommitDiff(${globalIndex})">查看</button>
            <button class="btn-review" onclick="reviewCommitCode(${globalIndex})" title="AI审查">🔍</button>
          </td>
        </tr>
      `;
    }
  }

  commitsBody.innerHTML = html;

  // 使用事件委托处理展开/折叠
  commitsBody.onclick = function(e) {
    const icon = e.target.closest('.expand-icon');
    if (icon) {
      toggleRepoRow(icon);
    }
  };

  // 绑定复选框事件
  bindCheckboxEvents();
  updateSelectedCount();
  updateSelectAllCheckbox();
}

// 切换仓库行的展开/折叠
function toggleRepoRow(icon) {
  const row = icon.closest('tr');
  const repoName = row.dataset.repo;
  const isExpanded = row.classList.contains('expanded');

  // 切换父节点状态
  if (isExpanded) {
    row.classList.remove('expanded');
  } else {
    row.classList.add('expanded');
  }

  // 获取表格所有行
  const tbody = row.parentNode;
  const allRows = Array.from(tbody.querySelectorAll('tr'));
  const rowIndex = allRows.indexOf(row);

  // 遍历后续行
  for (let i = rowIndex + 1; i < allRows.length; i++) {
    const r = allRows[i];
    // 遇到下一个仓库父节点则停止
    if (r.classList.contains('repo-row')) {
      break;
    }
    // 同仓库的提交行，切换显示
    if (r.classList.contains('commit-row') && r.dataset.repo === repoName) {
      r.style.display = isExpanded ? 'none' : '';
    }
  }
}

// 切换仓库的所有提交选中状态
function toggleRepoCommits(repoName, checked) {
  document.querySelectorAll(`.commit-row[data-repo="${repoName}"] .commit-checkbox`).forEach(cb => {
    const index = parseInt(cb.dataset.index);
    if (checked) {
      selectedCommitIndices.add(index);
      cb.checked = true;
    } else {
      selectedCommitIndices.delete(index);
      cb.checked = false;
    }
  });
  updateSelectedCount();
}

// 绑定复选框事件
function bindCheckboxEvents() {
  const checkboxes = document.querySelectorAll('.commit-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      if (e.target.checked) {
        selectedCommitIndices.add(index);
      } else {
        selectedCommitIndices.delete(index);
      }
      updateSelectedCount();
      updateSelectAllCheckbox();
    });
  });
}

// 更新已选择计数
function updateSelectedCount() {
  if (selectedCountEl) {
    const count = selectedCommitIndices.size;
    if (count > 0) {
      selectedCountEl.textContent = `已选择 ${count} 条`;
      selectedCountEl.classList.add('has-selection');
    } else {
      selectedCountEl.textContent = '';
      selectedCountEl.classList.remove('has-selection');
    }
  }
}

// 更新全选复选框状态
function updateSelectAllCheckbox() {
  if (!selectAllCommitsCheckbox) return;

  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, filteredCommits.length);
  const pageIndices = [];

  for (let i = start; i < end; i++) {
    pageIndices.push(i);
  }

  if (pageIndices.length === 0) {
    selectAllCommitsCheckbox.checked = false;
    selectAllCommitsCheckbox.indeterminate = false;
    return;
  }

  const selectedOnPage = pageIndices.filter(i => selectedCommitIndices.has(i)).length;

  if (selectedOnPage === 0) {
    selectAllCommitsCheckbox.checked = false;
    selectAllCommitsCheckbox.indeterminate = false;
  } else if (selectedOnPage === pageIndices.length) {
    selectAllCommitsCheckbox.checked = true;
    selectAllCommitsCheckbox.indeterminate = false;
  } else {
    selectAllCommitsCheckbox.checked = false;
    selectAllCommitsCheckbox.indeterminate = true;
  }
}

// 全选复选框事件
if (selectAllCommitsCheckbox) {
  selectAllCommitsCheckbox.addEventListener('change', (e) => {
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, filteredCommits.length);

    for (let i = start; i < end; i++) {
      if (e.target.checked) {
        selectedCommitIndices.add(i);
      } else {
        selectedCommitIndices.delete(i);
      }
    }

    // 更新当前页面的复选框
    const checkboxes = document.querySelectorAll('.commit-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });

    updateSelectedCount();
  });
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 渲染分页
function renderPagination() {
  const totalPages = Math.ceil(filteredCommits.length / pageSize);

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';

  // 上一页
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">上一页</button>`;

  // 页码
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    html += `<button class="page-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      html += `<span class="page-info">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      html += `<span class="page-info">...</span>`;
    }
    html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  // 下一页
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">下一页</button>`;

  // 统计信息
  html += `<span class="page-info">共 ${filteredCommits.length} 条记录</span>`;

  pagination.innerHTML = html;

  // 绑定分页事件
  pagination.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!btn.disabled) {
        currentPage = parseInt(btn.dataset.page);
        renderCommitsTable();
        renderPagination();
      }
    });
  });
}

// 渲染代码变化趋势折线图
function renderLineChart(chartData) {
  const container = document.getElementById('lineChart');

  if (lineChart) {
    lineChart.dispose();
  }

  lineChart = echarts.init(container);

  const dates = chartData.map(d => d.date.substring(5)); // MM-DD格式
  const addedData = chartData.map(d => d.added);
  const deletedData = chartData.map(d => d.deleted);

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    legend: {
      data: ['新增行数', '删除行数'],
      top: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 50,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: '代码行数'
    },
    series: [
      {
        name: '新增行数',
        type: 'line',
        smooth: true,
        data: addedData,
        itemStyle: {
          color: '#38ef7d'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(56, 239, 125, 0.3)' },
              { offset: 1, color: 'rgba(56, 239, 125, 0.05)' }
            ]
          }
        }
      },
      {
        name: '删除行数',
        type: 'line',
        smooth: true,
        data: deletedData,
        itemStyle: {
          color: '#f45c43'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 92, 67, 0.3)' },
              { offset: 1, color: 'rgba(244, 92, 67, 0.05)' }
            ]
          }
        }
      }
    ]
  };

  lineChart.setOption(option);
}

// 渲染每日提交次数柱状图
function renderBarChart(chartData) {
  const container = document.getElementById('barChart');

  if (barChart) {
    barChart.dispose();
  }

  barChart = echarts.init(container);

  const dates = chartData.map(d => d.date.substring(5));
  const commitsData = chartData.map(d => d.commits);

  const option = {
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 30,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: '提交次数',
      minInterval: 1
    },
    series: [
      {
        name: '提交次数',
        type: 'bar',
        data: commitsData,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#667eea' },
              { offset: 1, color: '#764ba2' }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        }
      }
    ]
  };

  barChart.setOption(option);
}

// 提交类型饼图实例
let pieChart = null;

// 渲染提交类型分布饼图
function renderPieChart(commitTypeStats) {
  const container = document.getElementById('pieChart');

  if (pieChart) {
    pieChart.dispose();
  }

  pieChart = echarts.init(container);

  const typeMap = {
    feat: 'feat (新功能)',
    fix: 'fix (修复)',
    refactor: 'refactor (重构)',
    style: 'style (样式)',
    docs: 'docs (文档)',
    test: 'test (测试)',
    chore: 'chore (杂务)',
    perf: 'perf (性能优化)',
    ci: 'ci (CI配置)',
    build: 'build (构建)',
    other: '其他'
  };

  const pieData = Object.entries(commitTypeStats).map(([type, value]) => ({
    name: typeMap[type] || type,
    value: value
  })).sort((a, b) => b.value - a.value); // 按值降序排序

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      data: pieData.map(item => item.name)
    },
    series: [
      {
        name: '提交类型',
        type: 'pie',
        radius: ['50%', '70%'], // 内外半径，形成环状图
        avoidLabelOverlap: false,
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: '20',
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: pieData
      }
    ]
  };

  pieChart.setOption(option);
}

// 窗口大小变化时重绘图表
window.addEventListener('resize', () => {
  if (lineChart) lineChart.resize();
  if (barChart) barChart.resize();
  if (pieChart) pieChart.resize();
});

// ============================================
// Diff 模态框相关功能
// ============================================

// Diff 模态框 DOM 元素
const diffModalOverlay = document.getElementById('diffModalOverlay');
const diffModal = document.getElementById('diffModal');
const diffModalTitle = document.getElementById('diffModalTitle');
const diffModalClose = document.getElementById('diffModalClose');
const diffLoading = document.getElementById('diffLoading');
const diffError = document.getElementById('diffError');
const diffWarning = document.getElementById('diffWarning');
const diffContent = document.getElementById('diffContent');
const diffFileList = document.getElementById('diffFileList');
const diffFiles = document.getElementById('diffFiles');
const diffWarningConfirm = document.getElementById('diffWarningConfirm');
const diffWarningCancel = document.getElementById('diffWarningCancel');

// 当前待渲染的 diff 数据（用于大文件警告确认后渲染）
let pendingDiffData = null;

// 打开 Diff 模态框
function openDiffModal() {
  diffModalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// 关闭 Diff 模态框
function closeDiffModal() {
  diffModalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  // 重置状态
  diffLoading.classList.remove('hidden');
  diffError.classList.add('hidden');
  diffWarning.classList.add('hidden');
  diffContent.classList.add('hidden');
  diffFileList.innerHTML = '';
  diffFiles.innerHTML = '';
  pendingDiffData = null;
}

// 显示错误信息
function showDiffError(message) {
  diffLoading.classList.add('hidden');
  diffWarning.classList.add('hidden');
  diffContent.classList.add('hidden');
  diffError.classList.remove('hidden');
  diffError.querySelector('.error-message').textContent = message;
}

// 查看提交的代码差异
async function viewCommitDiff(index) {
  const commit = filteredCommits[index];
  if (!commit) {
    console.error('Commit not found at index:', index);
    return;
  }

  // 打开模态框，显示加载状态
  openDiffModal();
  diffModalTitle.textContent = `代码差异 - ${commit.revision} (${commit.message.substring(0, 50)}${commit.message.length > 50 ? '...' : ''})`;

  try {
    let result;

    if (connectionConfig.vcs === 'svn' || commit.source === 'svn') {
      // SVN 模式
      result = await window.svnAPI.getDiff({
        projectUrl: commit.projectUrl,
        revision: commit.revision,
        username: connectionConfig.svn.username,
        password: connectionConfig.svn.password
      });
    } else {
      // Git 或混合模式 - 使用 fullHash (如果有) 或 revision
      const commitHash = commit.fullHash || commit.revision;

      // 混合模式下根据 commit.source 判断使用哪个仓库配置
      if (connectionConfig.vcs === 'mixed' && commit.source === 'git') {
        // 在 git.repos 中找到对应的仓库
        const repo = gitRepos.find(r => r.name === commit.repoName);
        if (repo) {
          if (repo.mode === 'local') {
            result = await window.gitlabAPI.localGetDiff({
              repoPath: repo.path,
              commitHash: commitHash
            });
          } else {
            result = await window.gitlabAPI.sshGetDiff({
              repoUrl: repo.url,
              commitHash: commitHash
            });
          }
        } else {
          result = { success: false, error: '未找到对应的 Git 仓库配置' };
        }
      } else {
        // Git 模式 - 根据 commit.repoName 找到对应仓库配置
        const repo = gitRepos.find(r => r.name === commit.repoName);
        if (repo) {
          if (repo.mode === 'local') {
            result = await window.gitlabAPI.localGetDiff({
              repoPath: repo.path,
              commitHash: commitHash
            });
          } else {
            result = await window.gitlabAPI.sshGetDiff({
              repoUrl: repo.url,
              commitHash: commitHash
            });
          }
        } else {
          result = { success: false, error: '未找到对应的 Git 仓库配置' };
        }
      }
    }

    if (result.success) {
      // 计算总变更行数
      let totalChanges = 0;
      if (result.diff && result.diff.files) {
        result.diff.files.forEach(file => {
          if (file.hunks) {
            file.hunks.forEach(hunk => {
              totalChanges += hunk.changes ? hunk.changes.length : 0;
            });
          }
        });
      }

      // 检查是否为大文件
      if (totalChanges > 2000) {
        pendingDiffData = result.diff;
        diffLoading.classList.add('hidden');
        diffWarning.classList.remove('hidden');
      } else {
        renderDiffContent(result.diff);
      }
    } else {
      showDiffError(result.error || '获取代码差异失败');
    }
  } catch (error) {
    showDiffError(`获取代码差异出错: ${error.message}`);
  }
}

// 渲染 Diff 内容
function renderDiffContent(diffData) {
  diffLoading.classList.add('hidden');
  diffWarning.classList.add('hidden');
  diffError.classList.add('hidden');
  diffContent.classList.remove('hidden');

  if (!diffData || !diffData.files || diffData.files.length === 0) {
    diffFileList.innerHTML = '<p style="color: #666; text-align: center;">此提交没有文件变更</p>';
    diffFiles.innerHTML = '';
    return;
  }

  // 渲染文件列表
  const statusTextMap = {
    added: '新增',
    deleted: '删除',
    modified: '修改',
    renamed: '重命名'
  };

  let fileListHtml = `<div class="diff-file-list-title">变更文件 (${diffData.files.length})</div>`;
  diffData.files.forEach((file, index) => {
    const status = file.isBinary ? 'binary' : file.status;
    const statusText = file.isBinary ? '二进制' : (statusTextMap[file.status] || file.status);
    const filePath = file.status === 'renamed' ? `${file.oldPath} → ${file.newPath}` : file.newPath;
    const fileStats = file.isBinary ? '' : `<span class="diff-file-stats"><span class="additions">+${file.additions || 0}</span> <span class="deletions">-${file.deletions || 0}</span></span>`;

    fileListHtml += `
      <div class="diff-file-item" onclick="scrollToFile(${index})">
        <span class="diff-file-status ${status}">${statusText}</span>
        <span class="diff-file-path">${escapeHtml(filePath)}</span>
        ${fileStats}
      </div>
    `;
  });
  diffFileList.innerHTML = fileListHtml;

  // 渲染每个文件的 Diff
  let filesHtml = '';
  diffData.files.forEach((file, index) => {
    const status = file.isBinary ? 'binary' : file.status;
    const statusText = file.isBinary ? '二进制' : (statusTextMap[file.status] || file.status);
    const filePath = file.status === 'renamed' ? `${file.oldPath} → ${file.newPath}` : file.newPath;
    const fileStats = file.isBinary ? '' : `<span class="diff-file-stats"><span class="additions">+${file.additions || 0}</span> <span class="deletions">-${file.deletions || 0}</span></span>`;

    filesHtml += `<div class="diff-file-block" id="diff-file-${index}">`;
    filesHtml += `
      <div class="diff-file-header">
        <span class="diff-file-status ${status}">${statusText}</span>
        <span class="diff-file-name">${escapeHtml(filePath)}</span>
        ${fileStats}
      </div>
    `;

    if (file.isBinary) {
      filesHtml += '<div class="diff-binary-notice">二进制文件 - 无法显示差异</div>';
    } else if (!file.hunks || file.hunks.length === 0) {
      filesHtml += '<div class="diff-binary-notice">无内容变更</div>';
    } else {
      // 渲染每个 hunk
      file.hunks.forEach(hunk => {
        const hunkStats = `<span class="diff-hunk-stats"><span class="additions">+${hunk.additions || 0}</span> <span class="deletions">-${hunk.deletions || 0}</span></span>`;
        filesHtml += '<div class="diff-hunk">';
        filesHtml += `<div class="diff-hunk-header">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${hunk.context ? ' ' + escapeHtml(hunk.context) : ''} ${hunkStats}</div>`;
        filesHtml += '<div class="diff-lines">';

        let oldLineNum = hunk.oldStart;
        let newLineNum = hunk.newStart;

        if (hunk.changes) {
          hunk.changes.forEach(change => {
            let lineClass = 'normal';
            let oldNum = '';
            let newNum = '';

            if (change.type === 'add') {
              lineClass = 'addition';
              newNum = newLineNum++;
            } else if (change.type === 'del') {
              lineClass = 'deletion';
              oldNum = oldLineNum++;
            } else {
              oldNum = oldLineNum++;
              newNum = newLineNum++;
            }

            filesHtml += `
              <div class="diff-line ${lineClass}">
                <span class="diff-line-num old">${oldNum}</span>
                <span class="diff-line-num new">${newNum}</span>
                <span class="diff-line-content">${escapeHtml(change.content)}</span>
              </div>
            `;
          });
        }

        filesHtml += '</div></div>';
      });
    }

    filesHtml += '</div>';
  });

  diffFiles.innerHTML = filesHtml;
}

// 滚动到指定文件
function scrollToFile(index) {
  const fileBlock = document.getElementById(`diff-file-${index}`);
  if (fileBlock) {
    fileBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 模态框事件绑定
diffModalClose.addEventListener('click', closeDiffModal);

diffModalOverlay.addEventListener('click', (e) => {
  if (e.target === diffModalOverlay) {
    closeDiffModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !diffModalOverlay.classList.contains('hidden')) {
    closeDiffModal();
  }
});

// 大文件警告确认/取消按钮
diffWarningConfirm.addEventListener('click', () => {
  if (pendingDiffData) {
    renderDiffContent(pendingDiffData);
    pendingDiffData = null;
  }
});

diffWarningCancel.addEventListener('click', closeDiffModal);

// ============================================
// AI 代码审查功能
// ============================================

// AI 配置 DOM 元素
const aiApiUrlInput = document.getElementById('aiApiUrl');
const aiModelInput = document.getElementById('aiModel');
const aiApiKeyInput = document.getElementById('aiApiKey');

// 审查结果弹窗 DOM 元素
const reviewModalOverlay = document.getElementById('reviewModalOverlay');
const reviewModalClose = document.getElementById('reviewModalClose');
const reviewLoading = document.getElementById('reviewLoading');
const reviewError = document.getElementById('reviewError');
const reviewResult = document.getElementById('reviewResult');
const reviewContent = document.getElementById('reviewContent');

// Diff 弹窗中的审查按钮
const diffReviewBtn = document.getElementById('diffReviewBtn');

// 当前审查的提交索引
let currentReviewIndex = -1;

// 当前 diff 数据缓存（用于 diff 弹窗内的审查）
let currentDiffData = null;

// 获取 AI 配置
function getAIConfig() {
  return {
    apiUrl: aiApiUrlInput?.value?.trim() || '',
    model: aiModelInput?.value?.trim() || '',
    authorization: aiApiKeyInput?.value?.trim() || ''
  };
}

// 保存 AI 配置到 connectionConfig 和 localStorage
function saveAIConfig() {
  const config = getAIConfig();
  connectionConfig.aiApiUrl = config.apiUrl;
  connectionConfig.aiModel = config.model;
  connectionConfig.aiApiKey = config.authorization;

  // 保存到 localStorage
  try {
    localStorage.setItem('aiConfig', JSON.stringify({
      apiUrl: config.apiUrl,
      model: config.model,
      apiKey: config.authorization
    }));
  } catch (e) {
    console.error('保存 AI 配置失败:', e);
  }
}

// 从 localStorage 加载 AI 配置
function loadAIConfig() {
  try {
    const saved = localStorage.getItem('aiConfig');
    if (saved) {
      const config = JSON.parse(saved);
      if (aiApiUrlInput && config.apiUrl) {
        aiApiUrlInput.value = config.apiUrl;
      }
      if (aiModelInput && config.model) {
        aiModelInput.value = config.model;
      }
      if (aiApiKeyInput && config.apiKey) {
        aiApiKeyInput.value = config.apiKey;
      }
      // 同步到 connectionConfig
      connectionConfig.aiApiUrl = config.apiUrl || '';
      connectionConfig.aiModel = config.model || '';
      connectionConfig.aiApiKey = config.apiKey || '';
    }
  } catch (e) {
    console.error('加载 AI 配置失败:', e);
  }
}

// 页面加载时自动加载 AI 配置
loadAIConfig();

// 打开审查结果弹窗
function openReviewModal() {
  reviewModalOverlay.classList.remove('hidden');
  reviewLoading.classList.remove('hidden');
  reviewError.classList.add('hidden');
  reviewResult.classList.add('hidden');
  document.body.style.overflow = 'hidden';
}

// 关闭审查结果弹窗
function closeReviewModal() {
  reviewModalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  reviewLoading.classList.remove('hidden');
  reviewError.classList.add('hidden');
  reviewResult.classList.add('hidden');
}

// 显示审查错误
function showReviewError(message) {
  reviewLoading.classList.add('hidden');
  reviewError.classList.remove('hidden');
  reviewResult.classList.add('hidden');
  reviewError.querySelector('.error-message').textContent = message;
}

// 显示审查结果
function showReviewResult(resultText) {
  reviewLoading.classList.add('hidden');
  reviewError.classList.add('hidden');
  reviewResult.classList.remove('hidden');
  // 简单的 Markdown 渲染
  reviewContent.innerHTML = simpleMarkdownRender(resultText);
}

// 简单的 Markdown 渲染函数
function simpleMarkdownRender(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // 处理标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

  // 处理加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 处理代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // 处理行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 处理列表项
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // 处理换行
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // 包装段落
  html = '<p>' + html + '</p>';

  // 清理空段落
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p><br><\/p>/g, '');

  return html;
}

// 从提交列表发起代码审查
async function reviewCommitCode(index) {
  const commit = filteredCommits[index];
  if (!commit) {
    console.error('Commit not found at index:', index);
    return;
  }

  // 保存 AI 配置
  saveAIConfig();

  const aiConfig = getAIConfig();
  if (!aiConfig.apiUrl || !aiConfig.model) {
    alert('请先在登录页面配置 AI API 地址和模型名称');
    return;
  }

  currentReviewIndex = index;

  // 打开审查弹窗
  openReviewModal();

  try {
    // 获取 diff 数据
    let diffResult;

    if (connectionConfig.vcs === 'svn' || commit.source === 'svn') {
      diffResult = await window.svnAPI.getDiff({
        projectUrl: commit.projectUrl,
        revision: commit.revision,
        username: connectionConfig.svn.username,
        password: connectionConfig.svn.password
      });
    } else {
      const commitHash = commit.fullHash || commit.revision;

      // 混合模式或 Git 模式：通过 repoName 找到对应仓库
      const repo = gitRepos.find(r => r.name === commit.repoName);
      if (repo) {
        if (repo.mode === 'local') {
          diffResult = await window.gitlabAPI.localGetDiff({
            repoPath: repo.path,
            commitHash: commitHash
          });
        } else {
          diffResult = await window.gitlabAPI.sshGetDiff({
            repoUrl: repo.url,
            commitHash: commitHash
          });
        }
      } else {
        diffResult = { success: false, error: '未找到对应的 Git 仓库配置' };
      }
    }

    if (!diffResult.success) {
      showReviewError('获取代码差异失败: ' + (diffResult.error || '未知错误'));
      return;
    }

    // 调用代码审查 API
    const reviewResult = await window.codeReviewAPI.review({
      apiUrl: aiConfig.apiUrl,
      model: aiConfig.model,
      authorization: aiConfig.authorization,
      diffData: diffResult.diff
    });

    if (reviewResult.success) {
      showReviewResult(reviewResult.result);
    } else {
      showReviewError(reviewResult.error || '代码审查失败');
    }
  } catch (error) {
    showReviewError('代码审查出错: ' + error.message);
  }
}

// 从 Diff 弹窗发起代码审查
async function reviewFromDiffModal() {
  // 保存 AI 配置
  saveAIConfig();

  const aiConfig = getAIConfig();
  if (!aiConfig.apiUrl || !aiConfig.model) {
    alert('请先在登录页面配置 AI API 地址和模型名称');
    return;
  }

  if (!currentDiffData) {
    alert('没有可审查的代码差异');
    return;
  }

  // 打开审查弹窗
  openReviewModal();

  try {
    const reviewResult = await window.codeReviewAPI.review({
      apiUrl: aiConfig.apiUrl,
      model: aiConfig.model,
      authorization: aiConfig.authorization,
      diffData: currentDiffData
    });

    if (reviewResult.success) {
      showReviewResult(reviewResult.result);
    } else {
      showReviewError(reviewResult.error || '代码审查失败');
    }
  } catch (error) {
    showReviewError('代码审查出错: ' + error.message);
  }
}

// 修改 viewCommitDiff 函数，缓存 diff 数据
const originalViewCommitDiff = typeof viewCommitDiff === 'function' ? viewCommitDiff : null;

// 重写 viewCommitDiff 以缓存 diff 数据
async function viewCommitDiff(index) {
  const commit = filteredCommits[index];
  if (!commit) {
    console.error('Commit not found at index:', index);
    return;
  }

  // 打开模态框，显示加载状态
  openDiffModal();
  diffModalTitle.textContent = `代码差异 - ${commit.revision} (${commit.message.substring(0, 50)}${commit.message.length > 50 ? '...' : ''})`;

  // 重置 diff 数据缓存
  currentDiffData = null;

  try {
    let result;

    if (connectionConfig.vcs === 'svn' || commit.source === 'svn') {
      // SVN 模式
      result = await window.svnAPI.getDiff({
        projectUrl: commit.projectUrl,
        revision: commit.revision,
        username: connectionConfig.svn.username,
        password: connectionConfig.svn.password
      });
    } else {
      // Git 或混合模式 - 使用 fullHash (如果有) 或 revision
      const commitHash = commit.fullHash || commit.revision;

      // 混合模式下根据 commit.source 判断使用哪个仓库配置
      if (connectionConfig.vcs === 'mixed' && commit.source === 'git') {
        // 在 git.repos 中找到对应的仓库
        const repo = gitRepos.find(r => r.name === commit.repoName);
        if (repo) {
          if (repo.mode === 'local') {
            result = await window.gitlabAPI.localGetDiff({
              repoPath: repo.path,
              commitHash: commitHash
            });
          } else {
            result = await window.gitlabAPI.sshGetDiff({
              repoUrl: repo.url,
              commitHash: commitHash
            });
          }
        } else {
          result = { success: false, error: '未找到对应的 Git 仓库配置' };
        }
      } else {
        // Git 模式 - 根据 commit.repoName 找到对应仓库配置
        const repo = gitRepos.find(r => r.name === commit.repoName);
        if (repo) {
          if (repo.mode === 'local') {
            result = await window.gitlabAPI.localGetDiff({
              repoPath: repo.path,
              commitHash: commitHash
            });
          } else {
            result = await window.gitlabAPI.sshGetDiff({
              repoUrl: repo.url,
              commitHash: commitHash
            });
          }
        } else {
          result = { success: false, error: '未找到对应的 Git 仓库配置' };
        }
      }
    }

    if (result.success) {
      // 缓存 diff 数据
      currentDiffData = result.diff;

      // 计算总变更行数
      let totalChanges = 0;
      if (result.diff && result.diff.files) {
        result.diff.files.forEach(file => {
          if (file.hunks) {
            file.hunks.forEach(hunk => {
              totalChanges += hunk.changes ? hunk.changes.length : 0;
            });
          }
        });
      }

      // 检查是否为大文件
      if (totalChanges > 2000) {
        pendingDiffData = result.diff;
        diffLoading.classList.add('hidden');
        diffWarning.classList.remove('hidden');
      } else {
        renderDiffContent(result.diff);
      }
    } else {
      showDiffError(result.error || '获取代码差异失败');
    }
  } catch (error) {
    showDiffError(`获取代码差异出错: ${error.message}`);
  }
}

// 审查弹窗事件绑定
reviewModalClose.addEventListener('click', closeReviewModal);

reviewModalOverlay.addEventListener('click', (e) => {
  if (e.target === reviewModalOverlay) {
    closeReviewModal();
  }
});

// Diff 弹窗中的审查按钮事件
diffReviewBtn.addEventListener('click', reviewFromDiffModal);

// ESC 键关闭审查弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !reviewModalOverlay.classList.contains('hidden')) {
    closeReviewModal();
  }
});

// ============================================
// 批量 AI 代码审查功能
// ============================================

const batchReviewBtn = document.getElementById('batchReviewBtn');

// 批量审查按钮事件
if (batchReviewBtn) {
  batchReviewBtn.addEventListener('click', async () => {
    // 保存 AI 配置
    saveAIConfig();

    const aiConfig = getAIConfig();
    if (!aiConfig.apiUrl || !aiConfig.model) {
      alert('请先在登录页面配置 AI API 地址和模型名称');
      return;
    }

    // 获取用户勾选的提交记录
    if (selectedCommitIndices.size === 0) {
      alert('请先勾选要审查的提交记录');
      return;
    }

    // 根据选中索引获取提交记录
    const commitsToReview = [];
    selectedCommitIndices.forEach(index => {
      if (filteredCommits[index]) {
        commitsToReview.push(filteredCommits[index]);
      }
    });

    if (commitsToReview.length === 0) {
      alert('没有有效的提交记录可供审查');
      return;
    }

    // 限制最多20条，避免prompt过长
    const maxCommits = 20;
    if (commitsToReview.length > maxCommits) {
      alert(`最多支持同时审查 ${maxCommits} 条提交记录，当前选择了 ${commitsToReview.length} 条，请减少选择数量`);
      return;
    }

    // 打开审查弹窗
    openReviewModal();

    try {
      // 获取每个提交的实际代码 diff
      const commitsWithDiff = [];

      for (let i = 0; i < commitsToReview.length; i++) {
        const commit = commitsToReview[i];

        // 更新加载提示
        if (reviewLoading) {
          const loadingText = reviewLoading.querySelector('p');
          if (loadingText) {
            loadingText.textContent = `正在获取代码差异 (${i + 1}/${commitsToReview.length})...`;
          }
        }

        let diffText = '';
        try {
          let diffResult;

          if (connectionConfig.vcs === 'svn' || commit.source === 'svn') {
            diffResult = await window.svnAPI.getDiff({
              projectUrl: commit.projectUrl,
              revision: commit.revision,
              username: connectionConfig.svn.username,
              password: connectionConfig.svn.password
            });
          } else {
            const commitHash = commit.fullHash || commit.revision;
            const repo = gitRepos.find(r => r.name === commit.repoName);

            if (repo) {
              if (repo.mode === 'local') {
                diffResult = await window.gitlabAPI.localGetDiff({
                  repoPath: repo.path,
                  commitHash: commitHash
                });
              } else {
                diffResult = await window.gitlabAPI.sshGetDiff({
                  repoUrl: repo.url,
                  commitHash: commitHash
                });
              }
            } else {
              diffResult = { success: false, error: '未找到对应的 Git 仓库配置' };
            }
          }

          if (diffResult && diffResult.success && diffResult.diff) {
            // 将 diff 对象转换为可读文本
            diffText = formatDiffToText(diffResult.diff);
          }
        } catch (e) {
          console.error(`获取提交 ${commit.revision} 的 diff 失败:`, e);
          diffText = '(获取代码差异失败)';
        }

        commitsWithDiff.push({
          revision: commit.revision,
          date: commit.date,
          commitType: commit.commitType,
          message: commit.message,
          added: commit.added,
          deleted: commit.deleted,
          net: commit.net,
          status: commit.status,
          project: commit.project,
          diffText: diffText
        });
      }

      // 更新加载提示
      if (reviewLoading) {
        const loadingText = reviewLoading.querySelector('p');
        if (loadingText) {
          loadingText.textContent = '正在进行 AI 代码审查，请稍候...';
        }
      }

      const result = await window.codeReviewAPI.batchReview({
        apiUrl: aiConfig.apiUrl,
        model: aiConfig.model,
        authorization: aiConfig.authorization,
        commits: commitsWithDiff
      });

      if (result.success) {
        showReviewResult(result.result);
      } else {
        showReviewError(result.error || '批量代码审查失败');
      }
    } catch (error) {
      showReviewError('批量代码审查出错: ' + error.message);
    }
  });
}

// 将 diff 对象转换为可读文本格式
function formatDiffToText(diffData) {
  if (!diffData || !diffData.files || diffData.files.length === 0) {
    return '(无代码变更)';
  }

  let result = '';

  for (const file of diffData.files) {
    result += `\n--- 文件: ${file.newPath || file.oldPath} (${file.status || 'modified'}) ---\n`;

    if (file.isBinary) {
      result += '[二进制文件]\n';
      continue;
    }

    if (file.hunks && file.hunks.length > 0) {
      for (const hunk of file.hunks) {
        result += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;

        if (hunk.changes) {
          // 限制每个 hunk 显示的行数，避免内容过长
          const maxLines = 50;
          const changes = hunk.changes.slice(0, maxLines);

          for (const change of changes) {
            const prefix = change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';
            result += `${prefix}${change.content}\n`;
          }

          if (hunk.changes.length > maxLines) {
            result += `... (省略 ${hunk.changes.length - maxLines} 行)\n`;
          }
        }
      }
    }
  }

  // 限制总长度
  const maxLength = 3000;
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '\n... (代码内容过长，已截断)';
  }

  return result;
}
