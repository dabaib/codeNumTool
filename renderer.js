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
const branchGroup = document.getElementById('branchGroup');
const yearMonthInput = document.getElementById('yearMonth');
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
  vcs: 'svn', // 'svn' or 'git'
  projects: [],
  username: '',
  password: '',
  threshold: 500,
  formatThreshold: 200,

  // GitLab 模式配置
  gitlabMode: 'local', // 'local' or 'ssh'

  // 本地扫描模式配置
  localRepoPath: '',
  localRepoName: '',

  // SSH 远程模式配置
  sshRepoUrl: '',
  sshRepoName: '',
  sshBranches: [],

  // AI 代码审查配置
  aiApiUrl: '',
  aiModel: '',
  aiApiKey: ''
};

// VCS切换
vcsToggleButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const vcs = button.dataset.vcs;
    vcsTypeInput.value = vcs;

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

      // 自动填充Git用户名
      const result = await window.gitlabAPI.getLocalGitUser();
      if (result.success) {
        authorInput.value = result.userName;
      } else {
        authorInput.value = '';
        console.error(result.error);
      }
    }
  });
});

// GitLab 子模式切换（本地 / SSH）
gitlabModeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    connectionConfig.gitlabMode = mode;

    gitlabModeButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    if (mode === 'local') {
      gitlabLocalConfig.classList.remove('hidden');
      gitlabSshConfig.classList.add('hidden');
    } else {
      gitlabLocalConfig.classList.add('hidden');
      gitlabSshConfig.classList.remove('hidden');
    }

    // 清空分支选择
    branchInput.innerHTML = '';
    loginStatus.textContent = '';
    loginStatus.className = 'status';
  });
});

// SSH 模式：测试连接按钮
testSshBtn.addEventListener('click', async () => {
  const repoUrl = sshRepoUrl.value.trim();

  if (!repoUrl) {
    showStatus(sshTestStatus, '请输入 Git SSH 地址', 'error');
    return;
  }

  testSshBtn.disabled = true;
  testSshBtn.textContent = '测试中...';
  showStatus(sshTestStatus, '正在测试连接...', 'loading');

  try {
    const result = await window.gitlabAPI.testSshConnection(repoUrl);

    if (result.success) {
      // 保存配置
      connectionConfig.sshRepoUrl = repoUrl;
      connectionConfig.sshRepoName = result.repoName;
      connectionConfig.sshBranches = result.branches;

      // 显示仓库信息
      sshRepoInfo.classList.remove('hidden');
      sshRepoInfo.querySelector('.repo-name-display').textContent = result.repoName;
      sshRepoInfo.querySelector('.branch-count').textContent = `(${result.branches.length} 个分支)`;

      // 填充分支选择
      branchInput.innerHTML = '';
      result.branches.forEach((branchName, index) => {
        const option = document.createElement('option');
        option.value = branchName;
        option.textContent = branchName;
        if (branchName === 'main' || branchName === 'master' || index === 0) {
          option.selected = true;
        }
        branchInput.appendChild(option);
      });

      showStatus(sshTestStatus, `连接成功: ${result.repoName}`, 'success');
    } else {
      showStatus(sshTestStatus, `连接失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(sshTestStatus, `测试出错: ${error.message}`, 'error');
  } finally {
    testSshBtn.disabled = false;
    testSshBtn.textContent = '测试连接';
  }
});

// ========== 本地扫描模式: 选择目录 ==========
selectRepoBtn.addEventListener('click', async () => {
  selectRepoBtn.disabled = true;
  selectRepoBtn.textContent = '选择中...';
  showStatus(loginStatus, '正在选择仓库...', 'loading');

  try {
    const result = await window.gitlabAPI.selectLocalRepo();

    if (result.canceled) {
      showStatus(loginStatus, '', '');
      return;
    }

    if (result.success) {
      localRepoPath.value = result.repoPath;

      // 显示仓库信息
      localRepoInfo.classList.remove('hidden');
      localRepoInfo.querySelector('.repo-name-display').textContent = result.repoName;
      localRepoInfo.querySelector('.branch-count').textContent = `(${result.branches.length} 个分支)`;

      // 填充分支选择
      branchInput.innerHTML = '';
      result.branches.forEach((branchName, index) => {
        const option = document.createElement('option');
        option.value = branchName;
        option.textContent = branchName;
        if (branchName === 'main' || branchName === 'master' || index === 0) {
          option.selected = true;
        }
        branchInput.appendChild(option);
      });

      // 自动获取本地 git 用户名
      const userResult = await window.gitlabAPI.getLocalGitUser();
      if (userResult.success) {
        authorInput.value = userResult.userName;
      }

      // 保存连接配置
      connectionConfig.localRepoPath = result.repoPath;
      connectionConfig.localRepoName = result.repoName;

      showStatus(loginStatus, `已选择仓库: ${result.repoName}`, 'success');
    } else {
      showStatus(loginStatus, `选择失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(loginStatus, `选择出错: ${error.message}`, 'error');
  } finally {
    selectRepoBtn.disabled = false;
    selectRepoBtn.textContent = '选择目录';
  }
});

// 存储查询结果
let queryResult = null;
let filteredCommits = [];
let currentPage = 1;
const pageSize = 20;
let selectedGroup = 'all';

// 图表实例
let lineChart = null;
let barChart = null;

// 初始化日期选择器为当前月份
const now = new Date();
yearMonthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
  const vcsType = vcsTypeInput.value;
  const projects = [];

  if (vcsType === 'svn') {
    const rows = projectList.querySelectorAll('.project-row');
    rows.forEach(row => {
      const name = row.querySelector('.project-name').value.trim();
      const url = row.querySelector('.project-url').value.trim();
      if (name && url) {
        projects.push({ name, url });
      }
    });
  }
  // GitLab 模式不再使用 projects 数组，而是使用 connectionConfig 中的配置
  return projects;
}

// 登录按钮点击事件
loginBtn.addEventListener('click', async () => {
  const vcsType = vcsTypeInput.value;
  const threshold = parseInt(thresholdInput.value) || 3000;
  const formatThreshold = parseInt(formatThresholdInput.value) || 200;

  connectionConfig.vcs = vcsType;
  connectionConfig.threshold = threshold;
  connectionConfig.formatThreshold = formatThreshold;

  loginBtn.disabled = true;

  try {
    if (vcsType === 'svn') {
      // SVN 模式
      const projects = getProjects();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (projects.length === 0) {
        showStatus(loginStatus, '请至少填写一个项目', 'error');
        loginBtn.disabled = false;
        return;
      }
      if (!username || !password) {
        showStatus(loginStatus, '请填写用户名和密码', 'error');
        loginBtn.disabled = false;
        return;
      }

      showStatus(loginStatus, '正在连接 SVN 服务器...', 'loading');
      connectionConfig.username = username;
      connectionConfig.password = password;

      const result = await window.svnAPI.login(projects, username, password);

      if (result.success) {
        const successProjects = result.results.filter(r => r.success);
        connectionConfig.projects = successProjects.map(r => ({ name: r.name, url: r.url }));
        showStatus(loginStatus, result.message, 'success');
        setTimeout(() => {
          loginCard.classList.add('hidden');
          statsCard.classList.remove('hidden');
          // SVN模式：隐藏分支选择，填充用户名
          branchGroup.classList.add('hidden');
          authorInput.value = username;
        }, 1000);
      } else {
        showStatus(loginStatus, `连接失败: ${result.error || '所有项目连接失败'}`, 'error');
      }

    } else { // GitLab 模式
      const gitlabMode = connectionConfig.gitlabMode;

      if (gitlabMode === 'local') {
        // 本地模式: 验证必要配置
        if (!connectionConfig.localRepoPath) {
          showStatus(loginStatus, '请先选择本地仓库', 'error');
          loginBtn.disabled = false;
          return;
        }
        showStatus(loginStatus, '本地仓库已就绪', 'success');
      } else {
        // SSH 模式: 验证必要配置
        if (!connectionConfig.sshRepoUrl) {
          showStatus(loginStatus, '请先测试 SSH 连接', 'error');
          loginBtn.disabled = false;
          return;
        }
        showStatus(loginStatus, 'SSH 仓库已就绪', 'success');
      }

      setTimeout(async () => {
        loginCard.classList.add('hidden');
        statsCard.classList.remove('hidden');
        // Git模式：显示分支选择，获取Git用户名
        branchGroup.classList.remove('hidden');
        try {
          const gitUserResult = await window.gitlabAPI.getLocalGitUser();
          if (gitUserResult.success && gitUserResult.userName) {
            authorInput.value = gitUserResult.userName;
          }
        } catch (e) {
          console.error('获取Git用户名失败:', e);
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
  const author = authorInput.value.trim();
  const yearMonth = yearMonthInput.value;

  if (!author || !yearMonth) {
    showStatus(queryStatus, '请填写提交者账号并选择月份', 'error');
    return;
  }

  const [year, month] = yearMonth.split('-').map(Number);
  const branches = Array.from(branchInput.selectedOptions).map(opt => opt.value).filter(Boolean);

  queryBtn.disabled = true;
  showStatus(queryStatus, '正在查询统计数据，请稍候...', 'loading');

  try {
    let result;

    if (connectionConfig.vcs === 'svn') {
      // SVN 查询
      result = await window.svnAPI.getStats(
        connectionConfig.projects,
        connectionConfig.username,
        connectionConfig.password,
        author,
        year,
        month,
        connectionConfig.threshold,
        connectionConfig.formatThreshold
      );

    } else { // GitLab 模式
      const gitlabMode = connectionConfig.gitlabMode;

      if (gitlabMode === 'local') {
        // 本地扫描模式查询
        result = await window.gitlabAPI.localGetStats({
          repoPath: connectionConfig.localRepoPath,
          repoName: connectionConfig.localRepoName,
          author,
          branches: branches.length > 0 ? branches : ['main', 'master'],
          year,
          month,
          threshold: connectionConfig.threshold,
          formatThreshold: connectionConfig.formatThreshold
        });
      } else {
        // SSH 远程模式查询
        result = await window.gitlabAPI.sshGetStats({
          repoUrl: connectionConfig.sshRepoUrl,
          repoName: connectionConfig.sshRepoName,
          author,
          branches: branches.length > 0 ? branches : ['main', 'master'],
          year,
          month,
          threshold: connectionConfig.threshold,
          formatThreshold: connectionConfig.formatThreshold
        });
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
  renderLineChart(queryResult.chartData);
  renderBarChart(queryResult.chartData);
  renderPieChart(queryResult.commitTypeStats);
  applyFilter();
}

// 渲染分组选项卡（项目或分支）
function renderGroupingTabs() {
  const isGit = connectionConfig.vcs === 'git';
  const statsSource = isGit ? queryResult.branchStats : queryResult.projectStats;
  const groupNames = Object.keys(statsSource || {});
  const allText = isGit ? '全部分支' : '全部项目';

  let html = `<button class="project-tab ${selectedGroup === 'all' ? 'active' : ''}" data-group="all">${allText}</button>`;

  groupNames.forEach(name => {
    html += `<button class="project-tab ${selectedGroup === name ? 'active' : ''}" data-group="${name}">${name}</button>`;
  });

  projectTabs.innerHTML = html;

  // 绑定点击事件
  projectTabs.querySelectorAll('.project-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedGroup = tab.dataset.group;
      projectTabs.querySelectorAll('.project-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateStats();
      applyFilter();
    });
  });
}

// 更新统计数据
function updateStats() {
  let stats;
  const isGit = connectionConfig.vcs === 'git';
  const statsSource = isGit ? queryResult.branchStats : queryResult.projectStats;
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
    const groupStats = statsSource[selectedGroup];
    stats = {
      totalCommits: groupStats.totalCommits,
      totalAdded: groupStats.totalAdded,
      totalDeleted: groupStats.totalDeleted,
      overThresholdCount: groupStats.overThresholdCount,
      formatCodeCount: groupStats.formatCodeCount
    };
    breakdownSection.classList.add('hidden');
  }

  totalCommitsEl.textContent = stats.totalCommits;
  totalAddedEl.textContent = stats.totalAdded.toLocaleString();
  totalDeletedEl.textContent = stats.totalDeleted.toLocaleString();
  netLinesEl.textContent = (stats.totalAdded - stats.totalDeleted).toLocaleString();
  overThresholdCountEl.textContent = stats.overThresholdCount;
  formatCodeCountEl.textContent = stats.formatCodeCount;
  document.getElementById('activeDays').textContent = queryResult.activeDays;
}

// 渲染项目/分支统计表格
function renderBreakdownTable() {
  const isGit = connectionConfig.vcs === 'git';
  const statsSource = isGit ? queryResult.branchStats : queryResult.projectStats;
  const headerLabel = isGit ? '分支名称' : '项目名称';

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
  groupNames.forEach(name => {
    const groupStats = statsSource[name];
    const net = groupStats.totalAdded - groupStats.totalDeleted;

    totalCommits += groupStats.totalCommits;
    totalAdded += groupStats.totalAdded;
    totalDeleted += groupStats.totalDeleted;
    totalFeat += groupStats.featCount || 0;
    totalFix += groupStats.fixCount || 0;
    totalOther += groupStats.otherCount || 0;

    html += `
      <tr>
        <td>${escapeHtml(name)}</td>
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

  projectStatsBody.innerHTML = html;

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

// 筛选提交记录
function applyFilter() {
  const typeFilter = filterType.value;
  const statusFilter = filterStatus.value;
  const keywordFilter = filterKeyword.value.toLowerCase().trim();

  let commits = queryResult.commits;

  // 按分组（项目或分支）筛选
  if (selectedGroup !== 'all') {
    // 在Git模式下，commit.project被赋值为分支名称
    commits = commits.filter(c => c.project === selectedGroup);
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
      c.project.toLowerCase().includes(keywordFilter)
    );
  }

  filteredCommits = commits;
  currentPage = 1;
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
    commitsBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #999; padding: 30px;">暂无提交记录</td></tr>';
    return;
  }

  let html = '';
  pageCommits.forEach((commit, index) => {
    const globalIndex = start + index;
    const dateStr = commit.date.substring(0, 10);
    const typeClass = commit.commitType;
    const statusClass = commit.status;
    const statusText = {
      normal: '正常',
      over: '超阈值',
      format: '格式化'
    }[commit.status];

    html += `
      <tr>
        <td>${escapeHtml(commit.project)}</td>
        <td>r${commit.revision}</td>
        <td>${dateStr}</td>
        <td><span class="commit-type ${typeClass}">${commit.commitType}</span></td>
        <td class="commit-message" title="${escapeHtml(commit.message)}">${escapeHtml(commit.message)}</td>
        <td class="num added">+${commit.added}</td>
        <td class="num deleted">-${commit.deleted}</td>
        <td class="num">${commit.net >= 0 ? '+' : ''}${commit.net}</td>
        <td><span class="commit-status ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn-view-diff" onclick="viewCommitDiff(${globalIndex})">查看</button>
          <button class="btn-review" onclick="reviewCommitCode(${globalIndex})" title="AI审查">🔍</button>
        </td>
      </tr>
    `;
  });

  commitsBody.innerHTML = html;
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

    if (connectionConfig.vcs === 'svn') {
      // SVN 模式
      result = await window.svnAPI.getDiff({
        projectUrl: commit.projectUrl,
        revision: commit.revision,
        username: connectionConfig.username,
        password: connectionConfig.password
      });
    } else {
      // Git 模式 - 使用 fullHash (如果有) 或 revision
      const commitHash = commit.fullHash || commit.revision;
      const gitlabMode = connectionConfig.gitlabMode;

      if (gitlabMode === 'local') {
        // 本地模式
        result = await window.gitlabAPI.localGetDiff({
          repoPath: connectionConfig.localRepoPath,
          commitHash: commitHash
        });
      } else {
        // SSH 模式
        result = await window.gitlabAPI.sshGetDiff({
          repoUrl: connectionConfig.sshRepoUrl,
          commitHash: commitHash
        });
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

// 保存 AI 配置到 connectionConfig
function saveAIConfig() {
  const config = getAIConfig();
  connectionConfig.aiApiUrl = config.apiUrl;
  connectionConfig.aiModel = config.model;
  connectionConfig.aiApiKey = config.authorization;
}

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

    if (connectionConfig.vcs === 'svn') {
      diffResult = await window.svnAPI.getDiff({
        projectUrl: commit.projectUrl,
        revision: commit.revision,
        username: connectionConfig.username,
        password: connectionConfig.password
      });
    } else {
      const commitHash = commit.fullHash || commit.revision;
      const gitlabMode = connectionConfig.gitlabMode;

      if (gitlabMode === 'local') {
        diffResult = await window.gitlabAPI.localGetDiff({
          repoPath: connectionConfig.localRepoPath,
          commitHash: commitHash
        });
      } else {
        diffResult = await window.gitlabAPI.sshGetDiff({
          repoUrl: connectionConfig.sshRepoUrl,
          commitHash: commitHash
        });
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

    if (connectionConfig.vcs === 'svn') {
      // SVN 模式
      result = await window.svnAPI.getDiff({
        projectUrl: commit.projectUrl,
        revision: commit.revision,
        username: connectionConfig.username,
        password: connectionConfig.password
      });
    } else {
      // Git 模式 - 使用 fullHash (如果有) 或 revision
      const commitHash = commit.fullHash || commit.revision;
      const gitlabMode = connectionConfig.gitlabMode;

      if (gitlabMode === 'local') {
        // 本地模式
        result = await window.gitlabAPI.localGetDiff({
          repoPath: connectionConfig.localRepoPath,
          commitHash: commitHash
        });
      } else {
        // SSH 模式
        result = await window.gitlabAPI.sshGetDiff({
          repoUrl: connectionConfig.sshRepoUrl,
          commitHash: commitHash
        });
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
