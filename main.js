const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const https = require('https');
const http = require('http');
const path = require('path');
const { execSync, exec } = require('child_process');
const iconv = require('iconv-lite');
const fs = require('fs-extra');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: '代码统计工具'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 执行命令行
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const errorMsg = iconv.decode(stderr, 'gbk');
        reject(new Error(errorMsg || error.message));
        return;
      }
      const output = iconv.decode(stdout, 'utf-8');
      resolve(output);
    });
  });
}

// 执行SVN命令（自动检测编码：优先尝试UTF-8，失败则用GBK）
function runSvnCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        // 错误信息尝试两种编码
        let errorMsg = '';
        try {
          errorMsg = iconv.decode(stderr, 'utf-8');
          // 检查是否有乱码特征（常见的UTF-8解码GBK产生的乱码）
          if (errorMsg.includes('�') || /[\uFFFD]/.test(errorMsg)) {
            errorMsg = iconv.decode(stderr, 'gbk');
          }
        } catch (e) {
          errorMsg = iconv.decode(stderr, 'gbk');
        }
        reject(new Error(errorMsg || error.message));
        return;
      }
      // 尝试UTF-8解码，检查是否有乱码
      let output = iconv.decode(stdout, 'utf-8');
      // 如果包含替换字符或常见乱码模式，使用GBK
      if (output.includes('�') || /[\uFFFD]/.test(output)) {
        output = iconv.decode(stdout, 'gbk');
      }
      resolve(output);
    });
  });
}

// 验证SVN连接（支持多项目）
ipcMain.handle('svn-login', async (event, { projects, username, password }) => {
  try {
    const results = [];
    for (const project of projects) {
      try {
        const command = `svn info "${project.url}" --username "${username}" --password "${password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other`;
        await runCommand(command);
        results.push({ name: project.name, url: project.url, success: true });
      } catch (err) {
        results.push({ name: project.name, url: project.url, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount > 0,
      results,
      message: `${successCount}/${results.length} 个项目连接成功`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证GitLab连接
ipcMain.handle('gitlab-login', async (event, { projects }) => {
  try {
    const results = [];
    for (const project of projects) {
      try {
        // 使用 git ls-remote 来测试SSH连接，这比clone快
        const command = `git ls-remote "${project.url}"`;
        await runCommand(command); // 复用runCommand来执行git命令
        results.push({ name: project.name, url: project.url, success: true });
      } catch (err) {
        results.push({ name: project.name, url: project.url, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    if (successCount === 0) {
      return { success: false, error: '所有GitLab项目都无法访问，请检查SSH Key或项目地址是否正确。' };
    }

    return {
      success: true,
      results,
      message: `${successCount}/${results.length} 个项目连接成功`
    };
  } catch (error) {
    return { success: false, error: `连接失败: ${error.message}` };
  }
});

// 获取本地Git用户名
ipcMain.handle('get-local-git-user', async () => {
  try {
    const command = 'git config user.name';
    const userName = await runCommand(command);
    return { success: true, userName: userName.trim() };
  } catch (error) {
    // git might not be installed or user.name not set
    console.error('Could not get local git user name:', error.message);
    return { success: false, error: '无法获取本地Git用户名，请确认已安装Git并在命令行中设置了user.name。' };
  }
});

// 获取GitLab项目分支
ipcMain.handle('gitlab-get-branches', async (event, { projectUrl }) => {
  try {
    const command = `git ls-remote --heads "${projectUrl}"`;
    const output = await runCommand(command);
    const branches = output.split('\n')
      .filter(line => line.includes('refs/heads/'))
      .map(line => line.split('refs/heads/')[1].trim());
    return { success: true, branches };
  } catch (error) {
    console.error(`Could not fetch branches for ${projectUrl}:`, error.message);
    return { success: false, error: `无法获取分支列表，请检查项目地址是否正确以及SSH Key是否有权限。` };
  }
});

// 解析提交类型前缀
function parseCommitType(message) {
  if (!message) return 'other';
  const lowerMsg = message.toLowerCase().trim();
  const types = ['feat', 'fix', 'refactor', 'style', 'docs', 'test', 'chore', 'perf', 'ci', 'build'];
  for (const type of types) {
    if (lowerMsg.startsWith(type + ':') || lowerMsg.startsWith(type + '(') || lowerMsg.startsWith(type + ' ')) {
      return type;
    }
  }
  return 'other';
}

// 判断提交状态（正常、超阈值、格式化代码）
function getCommitStatus(added, deleted, threshold, formatThreshold) {
  const total = added + deleted;

  // 格式化代码：变化量超过格式化阈值，且新增和删除接近（差异在20%以内）
  if (total >= formatThreshold) {
    const ratio = Math.min(added, deleted) / Math.max(added, deleted);
    if (ratio >= 0.8) {
      return 'format';
    }
  }

  // 超阈值
  if (added > threshold || deleted > threshold) {
    return 'over';
  }

  return 'normal';
}

// 获取用户提交统计（SVN）
ipcMain.handle('svn-stats', async (event, { projects, username, password, author, year, month, threshold, formatThreshold, startDate, endDate }) => {
  try {
    // 计算日期范围
    const startD = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endD = endDate || `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    // We will use local vars startD and endD in queries

    const allCommits = [];
    const projectStats = {};
    const activeDaysSet = new Set();
    const commitTypeStats = {};

    // 遍历每个项目
    for (const project of projects) {
      try {
        // 获取该用户在指定时间范围内的提交记录
        const logCommand = `svn log "${project.url}" --username "${username}" --password "${password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other -r {${startD}}:{${endD}} --search "${author}" --xml`;

        const logOutput = await runSvnCommand(logCommand);

        // 解析XML获取revision列表
        const entries = logOutput.split('</logentry>');

        for (const entry of entries) {
          const revMatch = /<logentry\s+revision="(\d+)">/.exec(entry);
          const dateMatch = /<date>([^<]+)<\/date>/.exec(entry);
          const authorMatch = /<author>([^<]+)<\/author>/.exec(entry);
          const msgMatch = /<msg>([^]*?)<\/msg>/.exec(entry);

          if (revMatch && dateMatch && authorMatch) {
            // 确保是目标作者的提交
            if (authorMatch[1].toLowerCase() === author.toLowerCase()) {
              const message = msgMatch ? msgMatch[1].trim() : '';
              const commitType = parseCommitType(message);

              // 获取diff统计
              try {
                const diffCommand = `svn diff "${project.url}" --username "${username}" --password "${password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other -c ${revMatch[1]}`;
                const diffOutput = await runSvnCommand(diffCommand);

                // 统计新增和删除行数
                const lines = diffOutput.split('\n');
                let added = 0;
                let deleted = 0;

                for (const line of lines) {
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    added++;
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    deleted++;
                  }
                }

                const status = getCommitStatus(added, deleted, threshold, formatThreshold);
                const dateStr = dateMatch[1].substring(0, 10);

                // 记录活跃天数
                activeDaysSet.add(dateStr);

                // 统计提交类型
                commitTypeStats[commitType] = (commitTypeStats[commitType] || 0) + 1;

                allCommits.push({
                  project: project.name,
                  projectUrl: project.url,
                  revision: revMatch[1],
                  date: dateMatch[1],
                  author: authorMatch[1],
                  message,
                  commitType,
                  added,
                  deleted,
                  net: added - deleted,
                  status
                });

                // 项目统计
                if (!projectStats[project.name]) {
                  projectStats[project.name] = {
                    totalAdded: 0,
                    totalDeleted: 0,
                    totalCommits: 0,
                    overThresholdCount: 0,
                    formatCodeCount: 0,
                    featCount: 0,
                    fixCount: 0,
                    otherCount: 0,
                    dailyStats: {}
                  };
                }

                const ps = projectStats[project.name];
                ps.totalAdded += added;
                ps.totalDeleted += deleted;
                ps.totalCommits += 1;

                if (status === 'over') ps.overThresholdCount += 1;
                if (status === 'format') ps.formatCodeCount += 1;

                // 统计提交类型
                if (commitType === 'feat') {
                  ps.featCount += 1;
                } else if (commitType === 'fix') {
                  ps.fixCount += 1;
                } else {
                  ps.otherCount += 1;
                }

                // 按日期汇总
                if (!ps.dailyStats[dateStr]) {
                  ps.dailyStats[dateStr] = { added: 0, deleted: 0, commits: 0 };
                }
                ps.dailyStats[dateStr].added += added;
                ps.dailyStats[dateStr].deleted += deleted;
                ps.dailyStats[dateStr].commits += 1;

              } catch (diffError) {
                console.error(`Error getting diff for revision ${revMatch[1]}:`, diffError.message);
              }
            }
          }
        }
      } catch (projectError) {
        console.error(`Error processing project ${project.name}:`, projectError.message);
      }
    }

    // 生成当月每天的数据（补齐没有提交的日期）
    const chartData = [];
    const _start = new Date(startD);
    const _end = new Date(endD);
    _end.setDate(_end.getDate() - 1); 
    let currDay = new Date(startDate ? startDate : `${year}-${String(month).padStart(2, '0')}-01`);
    let targetEnd = new Date(endDate ? endDate : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);
    
    // Safety break
    let limit = 0;
    while(currDay <= targetEnd && limit++ < 2000) {
      const _y = currDay.getFullYear();
      const _m = String(currDay.getMonth() + 1).padStart(2, '0');
      const _d = String(currDay.getDate()).padStart(2, '0');
      const dateStr = `${_y}-${_m}-${_d}`;
      currDay.setDate(currDay.getDate() + 1);
      let dayAdded = 0;
      let dayDeleted = 0;
      let dayCommits = 0;

      for (const pName of Object.keys(projectStats)) {
        const ds = projectStats[pName].dailyStats[dateStr];
        if (ds) {
          dayAdded += ds.added;
          dayDeleted += ds.deleted;
          dayCommits += ds.commits;
        }
      }

      chartData.push({
        date: dateStr,
        added: dayAdded,
        deleted: dayDeleted,
        commits: dayCommits
      });
    }

    // 计算总计
    let totalAdded = 0;
    let totalDeleted = 0;
    let totalCommits = 0;
    let overThresholdCount = 0;
    let formatCodeCount = 0;

    for (const pName of Object.keys(projectStats)) {
      const ps = projectStats[pName];
      totalAdded += ps.totalAdded;
      totalDeleted += ps.totalDeleted;
      totalCommits += ps.totalCommits;
      overThresholdCount += ps.overThresholdCount;
      formatCodeCount += ps.formatCodeCount;
    }

    // 按日期排序提交记录
    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
      data: {
        totalAdded,
        totalDeleted,
        totalCommits,
        overThresholdCount,
        formatCodeCount,
        activeDays: activeDaysSet.size,
        commitTypeStats,
        chartData,
        commits: allCommits,
        projectStats
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取用户提交统计（GitLab）
ipcMain.handle('gitlab-stats', async (event, { projects, author, branches, year, month, threshold, formatThreshold, startDate, endDate }) => {
  const startD = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endD = endDate || `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    // We will use local vars startD and endD in queries

  const allCommits = [];
  const branchStats = {}; // Changed from projectStats
  const activeDaysSet = new Set();
  const commitTypeStats = {};

  const tempDir = path.join(app.getPath('temp'), `jixiao-git-${Date.now()}`);
  await fs.ensureDir(tempDir);

  try {
    // Since we are dealing with one project in Git mode, we take the first one
    if (projects.length === 0) {
      return { success: false, error: "No project configured." };
    }
    const project = projects[0];
    const projectName = project.name;
    const projectUrl = project.url;

    const localDir = projectUrl.split('/').pop().replace('.git', '');
    const repoPath = path.join(tempDir, localDir);

    try {
      // 1. 克隆完整仓库
      await runCommand(`git clone "${projectUrl}" "${repoPath}"`);

      let targetBranches = branches;
      // 2. 如果没有选择分支，则获取默认分支
      if (!targetBranches || targetBranches.length === 0) {
        try {
          const headRefCmd = `git -C "${repoPath}" symbolic-ref refs/remotes/origin/HEAD`;
          const headRef = await runCommand(headRefCmd); // e.g., refs/remotes/origin/main
          const defaultBranch = headRef.split('/').pop().trim();
          if (defaultBranch) {
            targetBranches = [defaultBranch];
          } else {
            throw new Error('Could not determine default branch.');
          }
        } catch (e) {
          return { success: false, error: '无法确定默认分支，请尝试手动选择一个分支。' };
        }
      }

      // 3. 遍历每个目标分支进行统计
      for (const branch of targetBranches) {
        const branchName = branch.trim();
        if (!branchName) continue;

        // 初始化该分支的统计对象
        if (!branchStats[branchName]) {
          branchStats[branchName] = {
            totalAdded: 0, totalDeleted: 0, totalCommits: 0,
            overThresholdCount: 0, formatCodeCount: 0,
            featCount: 0, fixCount: 0, otherCount: 0,
            dailyStats: {}
          };
        }

        // 4. 获取日志
        const logSeparator = '---COMMIT-SEPARATOR---';
        const logFormat = `%H%n%aN%n%cN%n%ai%n%s%n%b${logSeparator}`; // Added %cN for committer name
        // Removed --author flag to filter in JS, which is more robust
        const logCommand = `git -C "${repoPath}" log origin/${branchName} --since="${startD}" --until="${endD}" --pretty=format:"${logFormat}"`;

        const logOutput = await runCommand(logCommand);
        const commitLogs = logOutput.split(logSeparator).filter(log => log.trim() !== '');

        const authorToMatch = author.toLowerCase();

        for (const log of commitLogs) {
          const lines = log.trim().split('\n');
          const hash = lines[0];
          const commitAuthor = lines[1];
          const commitCommitter = lines[2]; // New: committer name

          // New: Filter by author or committer in JS
          if (commitAuthor.toLowerCase() !== authorToMatch && commitCommitter.toLowerCase() !== authorToMatch) {
            continue;
          }

          const date = lines[3].replace(' ', 'T') + 'Z';
          const message = lines.slice(4).join('\n').trim();
          const commitType = parseCommitType(message);
          const dateStr = date.substring(0, 10);

          // 5. 获取每个提交的diff统计
          let added = 0;
          let deleted = 0;
          try {
            const showCommand = `git -C "${repoPath}" show --shortstat ${hash}`;
            const showOutput = await runCommand(showCommand);

            // 查找包含统计信息的行（不一定是最后一行）
            const lines_show = showOutput.split('\n');
            let statLine = '';
            for (let i = lines_show.length - 1; i >= 0; i--) {
              if (lines_show[i].includes('changed') || lines_show[i].includes('insertion') || lines_show[i].includes('deletion')) {
                statLine = lines_show[i].trim();
                break;
              }
            }

            if (statLine) {
              const insertionsMatch = statLine.match(/(\d+)\s+insertion(s)?/);
              const deletionsMatch = statLine.match(/(\d+)\s+deletion(s)?/);
              added = insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0;
              deleted = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0;
            }
          } catch (showError) {
            console.error(`Error getting stats for commit ${hash}:`, showError.message);
          }

          const status = getCommitStatus(added, deleted, threshold, formatThreshold);
          activeDaysSet.add(dateStr);
          commitTypeStats[commitType] = (commitTypeStats[commitType] || 0) + 1;

          allCommits.push({
            project: branchName, // Use branch name as project identifier in this view
            projectUrl: projectUrl,
            revision: hash.substring(0, 7),
            fullHash: hash,
            date: date,
            author: commitAuthor,
            message: message.split('\n')[0],
            commitType,
            added,
            deleted,
            net: added - deleted,
            status
          });

          // 累加到分支统计
          const bs = branchStats[branchName];
          bs.totalAdded += added;
          bs.totalDeleted += deleted;
          bs.totalCommits += 1;
          if (status === 'over') bs.overThresholdCount += 1;
          if (status === 'format') bs.formatCodeCount += 1;
          if (commitType === 'feat') bs.featCount += 1;
          else if (commitType === 'fix') bs.fixCount += 1;
          else bs.otherCount += 1;

          // 每日统计（用于总图表）
          if (!bs.dailyStats[dateStr]) {
            bs.dailyStats[dateStr] = { added: 0, deleted: 0, commits: 0 };
          }
          bs.dailyStats[dateStr].added += added;
          bs.dailyStats[dateStr].deleted += deleted;
          bs.dailyStats[dateStr].commits += 1;
        }
      }
    } catch (projectError) {
      console.error(`Error processing project ${projectName}:`, projectError.message);
      return { success: false, error: projectError.message };
    }

    // --- 后续处理 ---
    const chartData = [];
    const _start = new Date(startD);
    const _end = new Date(endD);
    _end.setDate(_end.getDate() - 1); 
    let currDay = new Date(startDate ? startDate : `${year}-${String(month).padStart(2, '0')}-01`);
    let targetEnd = new Date(endDate ? endDate : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);
    
    // Safety break
    let limit = 0;
    while(currDay <= targetEnd && limit++ < 2000) {
      const _y = currDay.getFullYear();
      const _m = String(currDay.getMonth() + 1).padStart(2, '0');
      const _d = String(currDay.getDate()).padStart(2, '0');
      const dateStr = `${_y}-${_m}-${_d}`;
      currDay.setDate(currDay.getDate() + 1);
      let dayAdded = 0, dayDeleted = 0, dayCommits = 0;

      // Sum daily stats from all processed branches
      for (const bName of Object.keys(branchStats)) {
        const ds = branchStats[bName].dailyStats[dateStr];
        if (ds) {
          dayAdded += ds.added;
          dayDeleted += ds.deleted;
          dayCommits += ds.commits;
        }
      }
      chartData.push({ date: dateStr, added: dayAdded, deleted: dayDeleted, commits: dayCommits });
    }

    let totalAdded = 0, totalDeleted = 0, totalCommits = 0, overThresholdCount = 0, formatCodeCount = 0;
    for (const bName of Object.keys(branchStats)) {
      const bs = branchStats[bName];
      totalAdded += bs.totalAdded;
      totalDeleted += bs.totalDeleted;
      totalCommits += bs.totalCommits;
      overThresholdCount += bs.overThresholdCount;
      formatCodeCount += bs.formatCodeCount;
    }

    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
      data: {
        totalAdded, totalDeleted, totalCommits, overThresholdCount, formatCodeCount,
        activeDays: activeDaysSet.size,
        commitTypeStats,
        chartData,
        commits: allCommits,
        branchStats // Changed from projectStats
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await fs.remove(tempDir);
  }
});

// ============================================
// GitLab API 请求辅助函数
// ============================================
function gitlabApiRequest(url, token) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: false // 支持自签名证书的内网环境
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({ success: true, data: JSON.parse(data) });
          } catch (e) {
            resolve({ success: false, error: '解析响应数据失败' });
          }
        } else if (res.statusCode === 401) {
          resolve({ success: false, error: 'Token 无效或已过期' });
        } else if (res.statusCode === 403) {
          resolve({ success: false, error: 'Token 权限不足，请确保有 read_api 权限' });
        } else if (res.statusCode === 404) {
          resolve({ success: false, error: '项目不存在或无访问权限' });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: `连接失败: ${e.message}` });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ success: false, error: '请求超时' });
    });

    req.end();
  });
}

// ============================================
// GitLab API 模式 - 验证连接
// ============================================
ipcMain.handle('gitlab-api-login', async (event, { gitlabUrl, token, projectId }) => {
  try {
    const baseUrl = gitlabUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}`;

    console.log('GitLab API 请求 URL:', apiUrl);
    console.log('Token 长度:', token ? token.length : 0);

    const response = await gitlabApiRequest(apiUrl, token);

    console.log('API 响应:', response.success ? '成功' : response.error);

    if (response.success) {
      const project = response.data;
      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          path_with_namespace: project.path_with_namespace,
          default_branch: project.default_branch
        }
      };
    } else {
      return { success: false, error: response.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// GitLab API 模式 - 获取分支列表
// ============================================
ipcMain.handle('gitlab-api-get-branches', async (event, { gitlabUrl, token, projectId }) => {
  try {
    const baseUrl = gitlabUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/branches?per_page=100`;

    const response = await gitlabApiRequest(apiUrl, token);
    if (response.success) {
      const branches = response.data.map(b => b.name);
      return { success: true, branches };
    }
    return response;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// GitLab API 模式 - 统计查询
// ============================================
ipcMain.handle('gitlab-api-stats', async (event, {
  gitlabUrl, token, projectId, projectName,  author, branches, year, month, threshold, formatThreshold, startDate, endDate
}) => {
  try {
    const baseUrl = gitlabUrl.replace(/\/+$/, '');
    const startD = startDate ? `${startDate}T00:00:00Z` : `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDateInclusive = endDate || `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    const endD = endDate ? `${endDate}T23:59:59Z` : `${endYear}-${String(endMonth).padStart(2, '0')}-01T00:00:00Z`;

    const allCommits = [];
    const branchStats = {};
    const activeDaysSet = new Set();
    const commitTypeStats = {};
    const processedHashes = new Set(); // 避免重复统计

    // 遍历每个分支
    for (const branch of branches) {
      if (!branchStats[branch]) {
        branchStats[branch] = {
          totalAdded: 0, totalDeleted: 0, totalCommits: 0,
          overThresholdCount: 0, formatCodeCount: 0,
          featCount: 0, fixCount: 0, otherCount: 0,
          dailyStats: {}
        };
      }

      // 获取提交列表 (分页处理)
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const commitsUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/commits?ref_name=${encodeURIComponent(branch)}&since=${startDate}&until=${endDate}&per_page=100&page=${page}`;

        const commitsResponse = await gitlabApiRequest(commitsUrl, token);
        if (!commitsResponse.success) {
          console.error(`获取提交列表失败: ${commitsResponse.error}`);
          break;
        }

        const commits = commitsResponse.data;
        if (commits.length === 0) {
          hasMore = false;
          break;
        }

        // 筛选作者
        const authorLower = author.toLowerCase();
        const authorCommits = commits.filter(c =>
          (c.author_name && c.author_name.toLowerCase() === authorLower) ||
          (c.committer_name && c.committer_name.toLowerCase() === authorLower)
        );

        // 获取每个提交的 diff 统计
        for (const commit of authorCommits) {
          // 跳过已处理的提交
          if (processedHashes.has(commit.id)) continue;
          processedHashes.add(commit.id);

          // 获取单个提交的详细信息（包含统计）
          const commitDetailUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/commits/${commit.id}`;
          const detailResponse = await gitlabApiRequest(commitDetailUrl, token);

          let added = 0, deleted = 0;

          if (detailResponse.success && detailResponse.data.stats) {
            added = detailResponse.data.stats.additions || 0;
            deleted = detailResponse.data.stats.deletions || 0;
          }

          const dateStr = commit.created_at.substring(0, 10);
          const commitType = parseCommitType(commit.title);
          const status = getCommitStatus(added, deleted, threshold, formatThreshold);

          activeDaysSet.add(dateStr);
          commitTypeStats[commitType] = (commitTypeStats[commitType] || 0) + 1;

          allCommits.push({
            project: branch,
            projectUrl: `${baseUrl}/${projectName}`,
            revision: commit.short_id,
            date: commit.created_at,
            author: commit.author_name,
            message: commit.title,
            commitType,
            added,
            deleted,
            net: added - deleted,
            status
          });

          // 更新分支统计
          const bs = branchStats[branch];
          bs.totalAdded += added;
          bs.totalDeleted += deleted;
          bs.totalCommits += 1;
          if (status === 'over') bs.overThresholdCount += 1;
          if (status === 'format') bs.formatCodeCount += 1;
          if (commitType === 'feat') bs.featCount += 1;
          else if (commitType === 'fix') bs.fixCount += 1;
          else bs.otherCount += 1;

          if (!bs.dailyStats[dateStr]) {
            bs.dailyStats[dateStr] = { added: 0, deleted: 0, commits: 0 };
          }
          bs.dailyStats[dateStr].added += added;
          bs.dailyStats[dateStr].deleted += deleted;
          bs.dailyStats[dateStr].commits += 1;
        }

        page++;
        if (commits.length < 100) hasMore = false;
      }
    }

    // 生成图表数据
    const chartData = [];
    const _start = new Date(startD);
    const _end = new Date(endD);
    _end.setDate(_end.getDate() - 1); 
    let currDay = new Date(startDate ? startDate : `${year}-${String(month).padStart(2, '0')}-01`);
    let targetEnd = new Date(endDate ? endDate : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);
    
    // Safety break
    let limit = 0;
    while(currDay <= targetEnd && limit++ < 2000) {
      const _y = currDay.getFullYear();
      const _m = String(currDay.getMonth() + 1).padStart(2, '0');
      const _d = String(currDay.getDate()).padStart(2, '0');
      const dateStr = `${_y}-${_m}-${_d}`;
      currDay.setDate(currDay.getDate() + 1);
      let dayAdded = 0, dayDeleted = 0, dayCommits = 0;

      for (const bName of Object.keys(branchStats)) {
        const ds = branchStats[bName].dailyStats[dateStr];
        if (ds) {
          dayAdded += ds.added;
          dayDeleted += ds.deleted;
          dayCommits += ds.commits;
        }
      }
      chartData.push({ date: dateStr, added: dayAdded, deleted: dayDeleted, commits: dayCommits });
    }

    // 汇总统计
    let totalAdded = 0, totalDeleted = 0, totalCommits = 0, overThresholdCount = 0, formatCodeCount = 0;
    for (const bName of Object.keys(branchStats)) {
      const bs = branchStats[bName];
      totalAdded += bs.totalAdded;
      totalDeleted += bs.totalDeleted;
      totalCommits += bs.totalCommits;
      overThresholdCount += bs.overThresholdCount;
      formatCodeCount += bs.formatCodeCount;
    }

    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
      data: {
        totalAdded, totalDeleted, totalCommits, overThresholdCount, formatCodeCount,
        activeDays: activeDaysSet.size,
        commitTypeStats,
        chartData,
        commits: allCommits,
        branchStats
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// SSH 远程模式 - 测试连接
// ============================================
ipcMain.handle('test-ssh-connection', async (event, { repoUrl }) => {
  try {
    // 使用 git ls-remote 来测试 SSH 连接并获取分支
    const command = `git ls-remote --heads "${repoUrl}"`;
    const output = await runCommand(command);

    // 解析分支列表
    const branches = output.split('\n')
      .filter(line => line.includes('refs/heads/'))
      .map(line => line.split('refs/heads/')[1].trim());

    // 从 URL 提取仓库名
    const repoName = repoUrl.split('/').pop().replace('.git', '');

    return {
      success: true,
      repoName,
      branches
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// SSH 远程模式 - 统计查询
// ============================================
ipcMain.handle('gitlab-ssh-stats', async (event, {
  repoUrl, repoName,  author, branches, year, month, threshold, formatThreshold, startDate, endDate
}) => {
  const startD = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endD = endDate || `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    // We will use local vars startD and endD in queries

  const allCommits = [];
  const branchStats = {};
  const activeDaysSet = new Set();
  const commitTypeStats = {};
  const processedHashes = new Set();

  const tempDir = path.join(app.getPath('temp'), `jixiao-ssh-${Date.now()}`);
  await fs.ensureDir(tempDir);

  try {
    const localDir = repoUrl.split('/').pop().replace('.git', '');
    const repoPath = path.join(tempDir, localDir);

    // 1. 克隆仓库
    await runCommand(`git clone "${repoUrl}" "${repoPath}"`);

    let targetBranches = branches;
    // 2. 如果没有选择分支，获取默认分支
    if (!targetBranches || targetBranches.length === 0) {
      try {
        const headRefCmd = `git -C "${repoPath}" symbolic-ref refs/remotes/origin/HEAD`;
        const headRef = await runCommand(headRefCmd);
        const defaultBranch = headRef.split('/').pop().trim();
        if (defaultBranch) {
          targetBranches = [defaultBranch];
        } else {
          throw new Error('Could not determine default branch.');
        }
      } catch (e) {
        return { success: false, error: '无法确定默认分支，请尝试手动选择一个分支。' };
      }
    }

    // 3. 遍历每个分支进行统计
    for (const branch of targetBranches) {
      const branchName = branch.trim();
      if (!branchName) continue;

      if (!branchStats[branchName]) {
        branchStats[branchName] = {
          totalAdded: 0, totalDeleted: 0, totalCommits: 0,
          overThresholdCount: 0, formatCodeCount: 0,
          featCount: 0, fixCount: 0, otherCount: 0,
          dailyStats: {}
        };
      }

      const logSeparator = '---COMMIT-SEPARATOR---';
      const logFormat = `%H%n%aN%n%cN%n%ai%n%s%n%b${logSeparator}`;
      const logCommand = `git -C "${repoPath}" log origin/${branchName} --since="${startD}" --until="${endD}" --pretty=format:"${logFormat}"`;

      const logOutput = await runCommand(logCommand);
      const commitLogs = logOutput.split(logSeparator).filter(log => log.trim() !== '');
      const authorToMatch = author.toLowerCase();

      for (const log of commitLogs) {
        const lines = log.trim().split('\n');
        if (lines.length < 4) continue;

        const hash = lines[0];
        if (processedHashes.has(hash)) continue;
        processedHashes.add(hash);

        const commitAuthor = lines[1];
        const commitCommitter = lines[2];

        if (commitAuthor.toLowerCase() !== authorToMatch &&
          commitCommitter.toLowerCase() !== authorToMatch) {
          continue;
        }

        const date = lines[3].replace(' ', 'T') + 'Z';
        const message = lines.slice(4).join('\n').trim();
        const commitType = parseCommitType(message);
        const dateStr = date.substring(0, 10);

        let added = 0, deleted = 0;
        try {
          const showCommand = `git -C "${repoPath}" show --shortstat ${hash}`;
          const showOutput = await runCommand(showCommand);

          const lines_show = showOutput.split('\n');
          let statLine = '';
          for (let i = lines_show.length - 1; i >= 0; i--) {
            if (lines_show[i].includes('changed') || lines_show[i].includes('insertion') || lines_show[i].includes('deletion')) {
              statLine = lines_show[i].trim();
              break;
            }
          }

          if (statLine) {
            const insertionsMatch = statLine.match(/(\d+)\s+insertion/);
            const deletionsMatch = statLine.match(/(\d+)\s+deletion/);
            added = insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0;
            deleted = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0;
          }
        } catch (showError) {
          console.error(`Error getting stats for commit ${hash}:`, showError.message);
        }

        const status = getCommitStatus(added, deleted, threshold, formatThreshold);
        activeDaysSet.add(dateStr);
        commitTypeStats[commitType] = (commitTypeStats[commitType] || 0) + 1;

        allCommits.push({
          project: branchName,
          projectUrl: repoUrl,
          revision: hash.substring(0, 7),
          fullHash: hash,
          date,
          author: commitAuthor,
          message: message.split('\n')[0],
          commitType,
          added,
          deleted,
          net: added - deleted,
          status
        });

        const bs = branchStats[branchName];
        bs.totalAdded += added;
        bs.totalDeleted += deleted;
        bs.totalCommits += 1;
        if (status === 'over') bs.overThresholdCount += 1;
        if (status === 'format') bs.formatCodeCount += 1;
        if (commitType === 'feat') bs.featCount += 1;
        else if (commitType === 'fix') bs.fixCount += 1;
        else bs.otherCount += 1;

        if (!bs.dailyStats[dateStr]) {
          bs.dailyStats[dateStr] = { added: 0, deleted: 0, commits: 0 };
        }
        bs.dailyStats[dateStr].added += added;
        bs.dailyStats[dateStr].deleted += deleted;
        bs.dailyStats[dateStr].commits += 1;
      }
    }

    // 生成图表数据
    const chartData = [];
    const _start = new Date(startD);
    const _end = new Date(endD);
    _end.setDate(_end.getDate() - 1); 
    let currDay = new Date(startDate ? startDate : `${year}-${String(month).padStart(2, '0')}-01`);
    let targetEnd = new Date(endDate ? endDate : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);
    
    // Safety break
    let limit = 0;
    while(currDay <= targetEnd && limit++ < 2000) {
      const _y = currDay.getFullYear();
      const _m = String(currDay.getMonth() + 1).padStart(2, '0');
      const _d = String(currDay.getDate()).padStart(2, '0');
      const dateStr = `${_y}-${_m}-${_d}`;
      currDay.setDate(currDay.getDate() + 1);
      let dayAdded = 0, dayDeleted = 0, dayCommits = 0;

      for (const bName of Object.keys(branchStats)) {
        const ds = branchStats[bName].dailyStats[dateStr];
        if (ds) {
          dayAdded += ds.added;
          dayDeleted += ds.deleted;
          dayCommits += ds.commits;
        }
      }
      chartData.push({ date: dateStr, added: dayAdded, deleted: dayDeleted, commits: dayCommits });
    }

    let totalAdded = 0, totalDeleted = 0, totalCommits = 0, overThresholdCount = 0, formatCodeCount = 0;
    for (const bName of Object.keys(branchStats)) {
      const bs = branchStats[bName];
      totalAdded += bs.totalAdded;
      totalDeleted += bs.totalDeleted;
      totalCommits += bs.totalCommits;
      overThresholdCount += bs.overThresholdCount;
      formatCodeCount += bs.formatCodeCount;
    }

    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
      data: {
        totalAdded, totalDeleted, totalCommits, overThresholdCount, formatCodeCount,
        activeDays: activeDaysSet.size,
        commitTypeStats,
        chartData,
        commits: allCommits,
        branchStats
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await fs.remove(tempDir);
  }
});

// ============================================
// Diff 解析工具函数
// ============================================
function parseUnifiedDiff(diffText) {
  const files = [];
  let currentFile = null;
  let currentHunk = null;

  // 处理 Windows 换行符 \r\n，统一转换为 \n
  const normalizedText = diffText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测文件头 (Git格式: diff --git a/file b/file)
    if (line.startsWith('diff --git ')) {
      if (currentFile) {
        // 计算文件级别的统计
        calculateFileStats(currentFile);
        files.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      currentFile = {
        oldPath: match ? match[1] : '',
        newPath: match ? match[2] : '',
        status: 'modified',
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0
      };
      currentHunk = null;
      continue;
    }

    // 检测SVN格式文件头 (Index: file)
    if (line.startsWith('Index: ')) {
      if (currentFile) {
        calculateFileStats(currentFile);
        files.push(currentFile);
      }
      const filePath = line.substring(7).trim();
      currentFile = {
        oldPath: filePath,
        newPath: filePath,
        status: 'modified',
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    // 检测新文件
    if (line.startsWith('new file mode')) {
      currentFile.status = 'added';
      continue;
    }

    // 检测删除文件
    if (line.startsWith('deleted file mode')) {
      currentFile.status = 'deleted';
      continue;
    }

    // 检测重命名
    if (line.startsWith('rename from ')) {
      currentFile.status = 'renamed';
      currentFile.oldPath = line.substring(12);
      continue;
    }
    if (line.startsWith('rename to ')) {
      currentFile.newPath = line.substring(10);
      continue;
    }

    // 检测二进制文件
    if (line.includes('Binary files') || line.includes('GIT binary patch')) {
      currentFile.isBinary = true;
      continue;
    }

    // 检测 hunk 头 (@@ -x,y +a,b @@)
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newLines: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        context: hunkMatch[5] || '',
        changes: [],
        additions: 0,
        deletions: 0
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    // 解析变更行
    if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.changes.push({ type: 'add', content: line.substring(1) });
        currentHunk.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.changes.push({ type: 'del', content: line.substring(1) });
        currentHunk.deletions++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.changes.push({ type: 'normal', content: line.substring(1) || '' });
      }
    }
  }

  if (currentFile) {
    calculateFileStats(currentFile);
    files.push(currentFile);
  }

  return { files };
}

// 计算文件级别的统计
function calculateFileStats(file) {
  file.additions = 0;
  file.deletions = 0;
  if (file.hunks) {
    file.hunks.forEach(hunk => {
      file.additions += hunk.additions || 0;
      file.deletions += hunk.deletions || 0;
    });
  }
}

// ============================================
// SVN 模式 - 获取 Diff
// ============================================
ipcMain.handle('svn-get-diff', async (event, { projectUrl, revision, username, password }) => {
  try {
    const command = `svn diff "${projectUrl}" --username "${username}" --password "${password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other -c ${revision}`;
    const diffOutput = await runSvnCommand(command);
    const parsed = parseUnifiedDiff(diffOutput);
    return { success: true, diff: parsed, raw: diffOutput };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// Git 本地模式 - 获取 Diff
// ============================================
ipcMain.handle('git-local-get-diff', async (event, { repoPath, commitHash }) => {
  try {
    // 使用完整hash或短hash都可以
    const command = `git -C "${repoPath}" show --patch --format="" ${commitHash}`;
    const diffOutput = await runCommand(command);
    const parsed = parseUnifiedDiff(diffOutput);
    return { success: true, diff: parsed, raw: diffOutput };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// Git SSH 模式 - 获取 Diff
// ============================================
ipcMain.handle('git-ssh-get-diff', async (event, { repoUrl, commitHash }) => {
  const tempDir = path.join(app.getPath('temp'), `jixiao-diff-${Date.now()}`);
  await fs.ensureDir(tempDir);

  try {
    const localDir = repoUrl.split('/').pop().replace('.git', '');
    const repoPath = path.join(tempDir, localDir);

    // 使用 partial clone 优化性能
    await runCommand(`git clone --filter=blob:none "${repoUrl}" "${repoPath}"`);

    // 获取 diff
    const command = `git -C "${repoPath}" show --patch --format="" ${commitHash}`;
    const diffOutput = await runCommand(command);
    const parsed = parseUnifiedDiff(diffOutput);

    return { success: true, diff: parsed, raw: diffOutput };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await fs.remove(tempDir);
  }
});

// ============================================
// GitLab API 模式 - 获取 Diff
// ============================================
ipcMain.handle('gitlab-api-get-diff', async (event, { gitlabUrl, token, projectId, commitHash }) => {
  try {
    const baseUrl = gitlabUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/commits/${commitHash}/diff`;

    const response = await gitlabApiRequest(apiUrl, token);

    if (response.success) {
      // GitLab API 返回的是一个 diff 数组，需要转换格式
      const files = response.data.map(diff => ({
        oldPath: diff.old_path,
        newPath: diff.new_path,
        status: diff.new_file ? 'added' : (diff.deleted_file ? 'deleted' : (diff.renamed_file ? 'renamed' : 'modified')),
        isBinary: diff.diff ? diff.diff.includes('Binary files') : false,
        hunks: parseHunksFromDiff(diff.diff || '')
      }));

      return { success: true, diff: { files }, raw: response.data };
    } else {
      return { success: false, error: response.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 从单个文件的 diff 文本解析 hunks
function parseHunksFromDiff(diffText) {
  const hunks = [];
  let currentHunk = null;
  const lines = diffText.split('\n');

  for (const line of lines) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newLines: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        context: hunkMatch[5] || '',
        changes: [],
        additions: 0,
        deletions: 0
      };
      hunks.push(currentHunk);
      continue;
    }

    if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.changes.push({ type: 'add', content: line.substring(1) });
        currentHunk.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.changes.push({ type: 'del', content: line.substring(1) });
        currentHunk.deletions++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.changes.push({ type: 'normal', content: line.substring(1) || '' });
      }
    }
  }

  return hunks;
}

// ============================================
// 本地仓库扫描模式 - 选择目录
// ============================================
ipcMain.handle('select-local-repo', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择 Git 仓库目录'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const repoPath = result.filePaths[0];

  // 验证是否为有效的 Git 仓库
  const gitDir = path.join(repoPath, '.git');
  const isGitRepo = await fs.pathExists(gitDir);

  if (!isGitRepo) {
    return { success: false, error: '所选目录不是有效的 Git 仓库' };
  }

  // 获取仓库信息
  try {
    const repoName = path.basename(repoPath);
    const branchOutput = await runCommand(`git -C "${repoPath}" branch -a`);
    const branches = branchOutput.split('\n')
      .map(b => b.replace('*', '').trim())
      .filter(b => b && !b.includes('->'))
      .map(b => b.replace('remotes/origin/', ''));

    // 去重
    const uniqueBranches = [...new Set(branches)];

    return {
      success: true,
      repoPath,
      repoName,
      branches: uniqueBranches
    };
  } catch (error) {
    return { success: false, error: `读取仓库信息失败: ${error.message}` };
  }
});

// ============================================
// 本地仓库扫描模式 - 统计查询
// ============================================
ipcMain.handle('gitlab-local-stats', async (event, {
  repoPath, repoName,  author, branches, year, month, threshold, formatThreshold, startDate, endDate
}) => {
  try {
    const startD = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endD = endDate || `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    // We will use local vars startD and endD in queries

    const allCommits = [];
    const branchStats = {};
    const activeDaysSet = new Set();
    const commitTypeStats = {};
    const processedHashes = new Set(); // 避免重复统计合并的提交

    for (const branch of branches) {
      const branchName = branch.trim();
      if (!branchName) continue;

      if (!branchStats[branchName]) {
        branchStats[branchName] = {
          totalAdded: 0, totalDeleted: 0, totalCommits: 0,
          overThresholdCount: 0, formatCodeCount: 0,
          featCount: 0, fixCount: 0, otherCount: 0,
          dailyStats: {}
        };
      }

      // 获取提交日志
      const logSeparator = '---COMMIT-SEPARATOR---';
      const logFormat = `%H%n%aN%n%cN%n%ai%n%s%n%b${logSeparator}`;

      try {
        // 尝试 origin/branch 或直接 branch
        let logCommand = `git -C "${repoPath}" log origin/${branchName} --since="${startD}" --until="${endD}" --pretty=format:"${logFormat}"`;
        let logOutput;

        try {
          logOutput = await runCommand(logCommand);
        } catch (e) {
          // 如果 origin/branch 不存在，尝试直接使用分支名
          logCommand = `git -C "${repoPath}" log ${branchName} --since="${startD}" --until="${endD}" --pretty=format:"${logFormat}"`;
          logOutput = await runCommand(logCommand);
        }

        const commitLogs = logOutput.split(logSeparator).filter(log => log.trim() !== '');
        const authorToMatch = author.toLowerCase();

        for (const log of commitLogs) {
          const lines = log.trim().split('\n');
          if (lines.length < 4) continue;

          const hash = lines[0];

          // 跳过已处理的提交
          if (processedHashes.has(hash)) continue;
          processedHashes.add(hash);

          const commitAuthor = lines[1];
          const commitCommitter = lines[2];

          if (commitAuthor.toLowerCase() !== authorToMatch &&
            commitCommitter.toLowerCase() !== authorToMatch) {
            continue;
          }

          const date = lines[3].replace(' ', 'T') + 'Z';
          const message = lines.slice(4).join('\n').trim();
          const commitType = parseCommitType(message);
          const dateStr = date.substring(0, 10);

          // 获取 diff 统计
          let added = 0, deleted = 0;
          try {
            const showCommand = `git -C "${repoPath}" show --shortstat ${hash}`;
            const showOutput = await runCommand(showCommand);

            // 查找包含 "file" 和 "changed" 的统计行（不一定是最后一行）
            const lines_show = showOutput.split('\n');
            let statLine = '';
            for (let i = lines_show.length - 1; i >= 0; i--) {
              if (lines_show[i].includes('changed') || lines_show[i].includes('insertion') || lines_show[i].includes('deletion')) {
                statLine = lines_show[i].trim();
                break;
              }
            }

            if (statLine) {
              const insertionsMatch = statLine.match(/(\d+)\s+insertion/);
              const deletionsMatch = statLine.match(/(\d+)\s+deletion/);
              added = insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0;
              deleted = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0;
            }
          } catch (showError) {
            console.error(`Error getting stats for commit ${hash}:`, showError.message);
          }

          const status = getCommitStatus(added, deleted, threshold, formatThreshold);
          activeDaysSet.add(dateStr);
          commitTypeStats[commitType] = (commitTypeStats[commitType] || 0) + 1;

          allCommits.push({
            project: branchName,
            projectUrl: repoPath,
            revision: hash.substring(0, 7),
            fullHash: hash,
            date,
            author: commitAuthor,
            message: message.split('\n')[0],
            commitType,
            added,
            deleted,
            net: added - deleted,
            status
          });

          // 更新分支统计
          const bs = branchStats[branchName];
          bs.totalAdded += added;
          bs.totalDeleted += deleted;
          bs.totalCommits += 1;
          if (status === 'over') bs.overThresholdCount += 1;
          if (status === 'format') bs.formatCodeCount += 1;
          if (commitType === 'feat') bs.featCount += 1;
          else if (commitType === 'fix') bs.fixCount += 1;
          else bs.otherCount += 1;

          if (!bs.dailyStats[dateStr]) {
            bs.dailyStats[dateStr] = { added: 0, deleted: 0, commits: 0 };
          }
          bs.dailyStats[dateStr].added += added;
          bs.dailyStats[dateStr].deleted += deleted;
          bs.dailyStats[dateStr].commits += 1;
        }
      } catch (branchError) {
        console.error(`Error processing branch ${branchName}:`, branchError.message);
      }
    }

    // 生成图表数据
    const chartData = [];
    const _start = new Date(startD);
    const _end = new Date(endD);
    _end.setDate(_end.getDate() - 1); 
    let currDay = new Date(startDate ? startDate : `${year}-${String(month).padStart(2, '0')}-01`);
    let targetEnd = new Date(endDate ? endDate : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`);
    
    // Safety break
    let limit = 0;
    while(currDay <= targetEnd && limit++ < 2000) {
      const _y = currDay.getFullYear();
      const _m = String(currDay.getMonth() + 1).padStart(2, '0');
      const _d = String(currDay.getDate()).padStart(2, '0');
      const dateStr = `${_y}-${_m}-${_d}`;
      currDay.setDate(currDay.getDate() + 1);
      let dayAdded = 0, dayDeleted = 0, dayCommits = 0;

      for (const bName of Object.keys(branchStats)) {
        const ds = branchStats[bName].dailyStats[dateStr];
        if (ds) {
          dayAdded += ds.added;
          dayDeleted += ds.deleted;
          dayCommits += ds.commits;
        }
      }
      chartData.push({ date: dateStr, added: dayAdded, deleted: dayDeleted, commits: dayCommits });
    }

    // 汇总统计
    let totalAdded = 0, totalDeleted = 0, totalCommits = 0, overThresholdCount = 0, formatCodeCount = 0;
    for (const bName of Object.keys(branchStats)) {
      const bs = branchStats[bName];
      totalAdded += bs.totalAdded;
      totalDeleted += bs.totalDeleted;
      totalCommits += bs.totalCommits;
      overThresholdCount += bs.overThresholdCount;
      formatCodeCount += bs.formatCodeCount;
    }

    allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
      data: {
        totalAdded, totalDeleted, totalCommits, overThresholdCount, formatCodeCount,
        activeDays: activeDaysSet.size,
        commitTypeStats,
        chartData,
        commits: allCommits,
        branchStats
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// AI 代码审查功能
// ============================================

// 读取代码审查 Prompt 模板
function getCodeReviewPrompt(dimensions = []) {
  const dimensionMap = {
    codeStyle: "### 1. 代码规范\n- 命名规范：变量、函数、类、组件命名是否语义化\n- 代码格式：缩进、空格、换行是否一致\n- 注释质量：关键逻辑是否有清晰注释",
    potentialBugs: "### 2. 潜在 Bug\n- 空值检查：是否存在可能的 null/undefined 问题\n- 边界条件：循环、条件判断的边界是否正确\n- 异步处理：Promise、async/await 是否有适当的错误处理\n- 内存泄漏：事件监听、定时器是否正确清理",
    security: "### 3. 安全问题\n- XSS 风险：是否存在不安全的 HTML 注入\n- 敏感信息：是否有硬编码的密钥、密码\n- 输入验证：用户输入是否有适当验证",
    performance: "### 4. 性能优化\n- 重复计算：是否有可缓存的重复计算\n- DOM 操作：是否存在频繁的 DOM 操作可优化\n- 资源加载：是否有可懒加载的资源",
    bestPractices: "### 5. 最佳实践\n- 代码复用：是否有重复代码可提取\n- 模块化：组件/函数职责是否单一\n- 可维护性：代码是否易于理解和维护",
    testability: "### 6. 可测试性与架构设计\n- 模块耦合：高内聚低耦合程度，是否过度依赖全局变量\n- 测试友好度：核心鉴权/计算逻辑是否容易被单独进行单元测试\n- 纯函数比例：逻辑函数是否尽可能保持了纯净",
    frameworkFeatures: "### 7. 现代框架特性应用\n- 框架特性误用：是否错误地使用了 Hooks / Composition API / 生命周期\n- 渲染浪费：在 React / Vue 等框架中是否存在明显的多余重渲染\n- 状态管理：全局状态管理是否过载或冗余",
    ux: "### 8. 用户体验与无障碍\n- 异常处理 UI：失败请求是否有友好的用户提示和 fallback 状态\n- 体验细节：提交交互是否有防抖、耗期操作是否有加载状态提示\n- 无障碍支持：键盘和屏幕阅读器支持、图文表单控件是否完备"
  };

  let dimensionsText = "";
  if (dimensions && dimensions.length > 0) {
    dimensionsText = dimensions.map(key => dimensionMap[key]).filter(Boolean).join('\n\n');
  } else {
    dimensionsText = Object.values(dimensionMap).slice(0, 5).join('\n\n');
  }

  return `你是一位资深的前端代码审查专家，拥有丰富的 JavaScript、TypeScript、Vue、React、HTML、CSS 开发经验。请对以下代码变更进行全面审查。

## 审查维度

${dimensionsText}

## 代码变更

{CODE_DIFF}

## 输出格式

请按以下格式输出审查结果：

### 📊 整体评分
X/10 分 - 简短评价

### 🐛 发现的问题
按严重程度排序：
1. **[严重/中等/轻微]** 问题描述
   - 位置：文件名:行号
   - 建议：如何修复

### 💡 优化建议
1. 建议内容
2. ...

### ✅ 做得好的地方
1. 肯定的内容
2. ...`;
}


// 将 diff 数据转换为可读文本
function formatDiffForReview(diffData) {
  if (!diffData || !diffData.files || diffData.files.length === 0) {
    return '没有代码变更';
  }

  let result = '';

  for (const file of diffData.files) {
    result += `\n${'='.repeat(60)}\n`;
    result += `文件: ${file.newPath || file.oldPath}\n`;
    result += `状态: ${file.status || 'modified'}`;
    if (!file.isBinary && (file.additions || file.deletions)) {
      result += ` (+${file.additions || 0} / -${file.deletions || 0})`;
    }
    result += '\n';
    result += `${'='.repeat(60)}\n`;

    if (file.isBinary) {
      result += '[二进制文件]\n';
      continue;
    }

    if (file.hunks && file.hunks.length > 0) {
      for (const hunk of file.hunks) {
        result += `\n@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
        if (hunk.context) {
          result += ` ${hunk.context}`;
        }
        result += '\n';

        if (hunk.changes) {
          for (const change of hunk.changes) {
            const prefix = change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';
            result += `${prefix}${change.content}\n`;
          }
        }
      }
    }
  }

  return result;
}

// 调用大模型 API
function callLLMApi(apiUrl, model, authorization, prompt) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(apiUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const requestBody = JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: false
      });

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization,
          'Content-Length': Buffer.byteLength(requestBody)
        },
        rejectUnauthorized: false // 支持自签名证书
      };

      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // 检查是否返回了 HTML 而不是 JSON（常见于 API 地址错误或服务不可用）
          const trimmedData = data.trim();
          if (trimmedData.startsWith('<!') || trimmedData.startsWith('<html') || trimmedData.startsWith('<HTML')) {
            resolve({
              success: false,
              error: `AI API 返回了 HTML 页面而非 JSON，请检查 API 地址是否正确。\n` +
                `当前地址: ${apiUrl}\n` +
                `HTTP 状态码: ${res.statusCode}\n` +
                `提示: 确保地址指向 /v1/chat/completions 或正确的 API 端点`
            });
            return;
          }

          if (res.statusCode === 200) {
            try {
              const jsonData = JSON.parse(data);
              // 兼容 OpenAI 格式
              if (jsonData.choices && jsonData.choices[0] && jsonData.choices[0].message) {
                resolve({ success: true, result: jsonData.choices[0].message.content });
              } else if (jsonData.response) {
                // 兼容 Ollama 格式
                resolve({ success: true, result: jsonData.response });
              } else if (jsonData.content) {
                resolve({ success: true, result: jsonData.content });
              } else if (jsonData.error) {
                // API 返回了错误信息
                resolve({ success: false, error: `AI API 错误: ${jsonData.error.message || JSON.stringify(jsonData.error)}` });
              } else {
                resolve({ success: true, result: JSON.stringify(jsonData) });
              }
            } catch (e) {
              resolve({
                success: false,
                error: `解析 AI 响应失败: ${e.message}\n响应内容前200字符: ${data.substring(0, 200)}`
              });
            }
          } else {
            // 处理非 200 状态码
            let errorMsg = `AI API 返回错误: HTTP ${res.statusCode}`;

            // 尝试解析错误响应
            try {
              const errorJson = JSON.parse(data);
              if (errorJson.error) {
                errorMsg += ` - ${errorJson.error.message || JSON.stringify(errorJson.error)}`;
              }
            } catch (e) {
              // 不是 JSON，显示原始内容
              errorMsg += `\n响应内容: ${data.substring(0, 300)}`;
            }

            resolve({ success: false, error: errorMsg });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: `连接 AI API 失败: ${e.message}` });
      });

      req.setTimeout(120000, () => {
        req.destroy();
        resolve({ success: false, error: 'AI API 请求超时（120秒）' });
      });

      req.write(requestBody);
      req.end();
    } catch (error) {
      resolve({ success: false, error: `请求错误: ${error.message}` });
    }
  });
}

// IPC Handler: 代码审查
ipcMain.handle('code-review', async (event, { apiUrl, model, authorization, dimensions, diffData }) => {
  try {
    // 验证参数
    if (!apiUrl || !model) {
      return { success: false, error: '请配置 AI API 地址和模型名称' };
    }

    // 格式化 diff 数据
    const diffText = formatDiffForReview(diffData);
    if (diffText === '没有代码变更') {
      return { success: false, error: '此提交没有代码变更，无法进行审查' };
    }

    // 构建完整 prompt
    const promptTemplate = getCodeReviewPrompt(dimensions);
    const fullPrompt = promptTemplate.replace('{CODE_DIFF}', diffText);

    // 调用 AI API
    const result = await callLLMApi(apiUrl, model, authorization, fullPrompt);

    return result;
  } catch (error) {
    return { success: false, error: `代码审查失败: ${error.message}` };
  }
});

// 批量代码审查 Prompt 模板
function getBatchCodeReviewPrompt(dimensions = []) {
  const dimensionDescMap = {
    codeStyle: "代码规范与命名",
    potentialBugs: "潜在 Bug（空指针、边界与内存）",
    security: "安全漏洞",
    performance: "计算与渲染性能问题",
    bestPractices: "最佳实践与架构可维护性",
    testability: "可测试性设计缺陷",
    frameworkFeatures: "现代框架特性的误用",
    ux: "用户交互反馈与无障碍体验下降点"
  };

  let targetFocus = "";
  if (dimensions && dimensions.length > 0) {
    targetFocus = dimensions.map(key => dimensionDescMap[key]).filter(Boolean).join("、");
  } else {
    targetFocus = "安全漏洞、性能问题、代码规范";
  }

  return `你是一位资深的代码审查专家。请对以下多个提交的代码变更进行整体审查分析。

## 审查要求

1. **整体代码质量评估**：分析这批提交的整体代码质量
2. **具体问题识别**：针对每个提交，列出发现的具体问题
3. **共性问题识别**：找出多个提交中重复出现的问题模式
4. **改进趋势分析**：分析代码是否在逐步改进
5. **重点关注以下维度**：${targetFocus}

## 提交记录汇总

{COMMITS_SUMMARY}

## 输出格式

请按以下格式输出审查结果：

### 📊 整体评估
X/10 分 - 简要总结这批提交的整体质量

### ⚠️ 具体问题列表
针对每个存在问题的提交，列出具体问题：

**提交 rXXX (提交信息摘要)**
- [严重/中等/轻微] 问题描述
- [严重/中等/轻微] 问题描述

（如果某个提交没有发现问题，可以跳过）

### 📈 趋势分析
分析这批提交的代码质量变化趋势

### 🔴 共性问题
列出多次出现的问题模式：
1. 问题描述及出现频率
2. ...

### 🟡 建议改进
针对团队/个人的综合演进改进建议：
1. ...

### 🟢 亮点总结
做得好的方面：
1. ...

请用中文回复，保持专业且切中要害。`;
}


// IPC Handler: 批量代码审查
ipcMain.handle('batch-code-review', async (event, { apiUrl, model, authorization, dimensions, commits }) => {
  try {
    // 验证参数
    if (!apiUrl || !model) {
      return { success: false, error: '请配置 AI API 地址和模型名称' };
    }

    if (!commits || commits.length === 0) {
      return { success: false, error: '没有提交记录可供审查' };
    }

    // 构建提交记录汇总（包含实际代码）
    let commitsSummary = `共 ${commits.length} 个提交:\n\n`;

    commits.forEach((commit, index) => {
      commitsSummary += `${'='.repeat(60)}\n`;
      commitsSummary += `### 提交 ${index + 1}: ${commit.revision}\n`;
      commitsSummary += `- 日期: ${commit.date.substring(0, 10)}\n`;
      commitsSummary += `- 类型: ${commit.commitType}\n`;
      commitsSummary += `- 信息: ${commit.message}\n`;
      commitsSummary += `- 变更统计: +${commit.added} / -${commit.deleted} (净增 ${commit.net})\n`;
      commitsSummary += `- 状态: ${commit.status}\n`;

      // 添加实际代码变更
      if (commit.diffText && commit.diffText !== '(无代码变更)' && commit.diffText !== '(获取代码差异失败)') {
        commitsSummary += `\n**代码变更:**\n\`\`\`\n${commit.diffText}\n\`\`\`\n`;
      } else {
        commitsSummary += `\n**代码变更:** ${commit.diffText || '(未获取)'}\n`;
      }
      commitsSummary += '\n';
    });

    // 统计信息
    const totalAdded = commits.reduce((sum, c) => sum + c.added, 0);
    const totalDeleted = commits.reduce((sum, c) => sum + c.deleted, 0);
    const typeStats = {};
    commits.forEach(c => {
      typeStats[c.commitType] = (typeStats[c.commitType] || 0) + 1;
    });

    commitsSummary += `${'='.repeat(60)}\n`;
    commitsSummary += `### 统计汇总\n`;
    commitsSummary += `- 总提交数: ${commits.length}\n`;
    commitsSummary += `- 总新增行: ${totalAdded}\n`;
    commitsSummary += `- 总删除行: ${totalDeleted}\n`;
    commitsSummary += `- 净增行数: ${totalAdded - totalDeleted}\n`;
    commitsSummary += `- 类型分布: ${Object.entries(typeStats).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;

    // 构建完整 prompt
    const promptTemplate = getBatchCodeReviewPrompt(dimensions);
    const fullPrompt = promptTemplate.replace('{COMMITS_SUMMARY}', commitsSummary);

    // 调用 AI API
    const result = await callLLMApi(apiUrl, model, authorization, fullPrompt);

    return result;
  } catch (error) {
    return { success: false, error: `批量代码审查失败: ${error.message}` };
  }
});
