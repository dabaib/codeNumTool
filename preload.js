const { contextBridge, ipcRenderer } = require('electron');

// SVN API
contextBridge.exposeInMainWorld('svnAPI', {
  login: (projects, username, password) =>
    ipcRenderer.invoke('svn-login', { projects, username, password }),
  getStats: (projects, username, password, author, year, month, threshold, formatThreshold, startDate, endDate) =>
    ipcRenderer.invoke('svn-stats', { projects, username, password, author, year, month, threshold, formatThreshold, startDate, endDate }),
  getDiff: ({ projectUrl, revision, username, password }) =>
    ipcRenderer.invoke('svn-get-diff', { projectUrl, revision, username, password })
});

// GitLab API
contextBridge.exposeInMainWorld('gitlabAPI', {
  // 原有 SSH 模式 (保留兼容)
  gitlabOauthStart: ({ gitlabUrl }) =>
    ipcRenderer.invoke('gitlab-oauth-start', { gitlabUrl }),
  gitlabOauthCheck: () =>
    ipcRenderer.invoke('gitlab-oauth-check'),
  gitlabLogout: () =>
    ipcRenderer.invoke('gitlab-logout'),
  gitlabLogin: ({ gitlabUrl, projects }) =>
    ipcRenderer.invoke('gitlab-login', { gitlabUrl, projects }),
  getLocalGitUser: () =>
    ipcRenderer.invoke('get-local-git-user'),
  getBranches: (projectUrl) =>
    ipcRenderer.invoke('gitlab-get-branches', { projectUrl }),
  gitlabGetStats: ({ gitlabUrl, projects, author, branches, year, month, threshold, formatThreshold, startDate, endDate }) =>
    ipcRenderer.invoke('gitlab-stats', { gitlabUrl, projects, author, branches, year, month, threshold, formatThreshold, startDate, endDate }),

  // ========== 新增: API 模式 ==========
  apiLogin: ({ gitlabUrl, token, projectId }) =>
    ipcRenderer.invoke('gitlab-api-login', { gitlabUrl, token, projectId }),
  apiGetBranches: ({ gitlabUrl, token, projectId }) =>
    ipcRenderer.invoke('gitlab-api-get-branches', { gitlabUrl, token, projectId }),
  apiGetStats: ({ gitlabUrl, token, projectId, projectName, author, branches, year, month, threshold, formatThreshold, startDate, endDate }) =>
    ipcRenderer.invoke('gitlab-api-stats', { gitlabUrl, token, projectId, projectName, author, branches, year, month, threshold, formatThreshold, startDate, endDate }),

  // ========== 新增: 本地扫描模式 ==========
  selectLocalRepo: () =>
    ipcRenderer.invoke('select-local-repo'),
  localGetStats: ({ repoPath, repoName, author, branches, year, month, threshold, formatThreshold, startDate, endDate }) =>
    ipcRenderer.invoke('gitlab-local-stats', { repoPath, repoName, author, branches, year, month, threshold, formatThreshold, startDate, endDate }),

  // ========== 新增: SSH 远程模式 ==========
  testSshConnection: (repoUrl) =>
    ipcRenderer.invoke('test-ssh-connection', { repoUrl }),
  sshGetStats: ({ repoUrl, repoName, author, branches, year, month, threshold, formatThreshold, startDate, endDate }) =>
    ipcRenderer.invoke('gitlab-ssh-stats', { repoUrl, repoName, author, branches, year, month, threshold, formatThreshold, startDate, endDate }),

  // ========== 新增: Diff 获取方法 ==========
  localGetDiff: ({ repoPath, commitHash }) =>
    ipcRenderer.invoke('git-local-get-diff', { repoPath, commitHash }),
  sshGetDiff: ({ repoUrl, commitHash }) =>
    ipcRenderer.invoke('git-ssh-get-diff', { repoUrl, commitHash }),
  apiGetDiff: ({ gitlabUrl, token, projectId, commitHash }) =>
    ipcRenderer.invoke('gitlab-api-get-diff', { gitlabUrl, token, projectId, commitHash })
});

// 代码审查 API
contextBridge.exposeInMainWorld('codeReviewAPI', {
  review: ({ apiUrl, model, authorization, diffData }) =>
    ipcRenderer.invoke('code-review', { apiUrl, model, authorization, diffData }),
  batchReview: ({ apiUrl, model, authorization, commits }) =>
    ipcRenderer.invoke('batch-code-review', { apiUrl, model, authorization, commits })
});
