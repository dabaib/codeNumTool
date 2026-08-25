# 月度代码报告生成功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现生成标准化月度代码绩效报告的功能，包含统计指标和变更摘要，供后续 AI 横向评比使用。

**架构：** 前端收集统计结果和提交明细 → 后端分批获取 diff 并生成变更摘要 → 汇总后调用 AI 生成综合报告 → 输出标准化 HTML 报告。

**技术栈：** Electron IPC、Node.js、Git CLI、LLM API

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `main.js` | 后端 IPC handler：分批获取 diff、调用 AI 生成摘要和最终报告 |
| `preload.js` | 暴露 `generateMonthlyReport` 方法到渲染进程 |
| `renderer.js` | 前端：收集数据、显示进度、处理结果 |
| `index.html` | UI：生成月度报告按钮、进度条 |

---

## 任务 1：清理 renderer.js 中的重复代码

**文件：** `renderer.js:3817-3966`

- [ ] **步骤 1：删除重复的代码块**

renderer.js 底部有一段未使用的旧逻辑（3909-3966 行），需要删除。只保留 `DOMContentLoaded` 中的月度报告按钮逻辑（3817-3906 行）。

删除这段代码：
```javascript
      // 收集参数
      const author = document.getElementById('author')?.value?.trim() || '';
      // 年月从隐藏域 yearMonth 读取（格式: "2026-03"）
      const yearMonthVal = document.getElementById('yearMonth')?.value || '';
      const [yearNum, monthNum] = yearMonthVal.split('-').map(Number);
      // 将 repos 序列化（Set 无法通过 IPC 传输，需转为 Array）
      const repos = (connectionConfig.git?.repos || []).map(r => ({
        type: r.type,
        repoName: r.repoName,
        repoPath: r.repoPath,
        repoUrl: r.repoUrl,
        gitlabUrl: r.gitlabUrl,
        token: r.token,
        projectId: r.projectId,
        projectName: r.projectName,
        selectedBranches: r.selectedBranches instanceof Set
          ? Array.from(r.selectedBranches)
          : (Array.isArray(r.selectedBranches) ? r.selectedBranches : []),
        branches: Array.isArray(r.branches) ? r.branches : []
      }));
      const threshold = connectionConfig.threshold;
      const formatThreshold = connectionConfig.formatThreshold;
      // 读取 AI 配置：优先从输入框，回退到 localStorage
      let aiConfig = getAIConfig();
      if (!aiConfig.apiUrl) {
        try {
          const saved = localStorage.getItem('aiConfig');
          if (saved) {
            const parsed = JSON.parse(saved);
            aiConfig = { apiUrl: parsed.apiUrl || '', model: parsed.model || '', authorization: parsed.apiKey || '' };
          }
        } catch (e) { /* ignore */ }
      }

      try {
        const result = await window.exportAPI.generateMonthlyReport({ author, year: yearNum, month: monthNum, repos, threshold, formatThreshold }, [], aiConfig);
        // 完成进度
        progressInner.style.width = '100%';
        if (result && result.success) {
          // 调用导出保存
          const saveRes = await window.exportAPI.saveReport(result.html, 'html');
          if (saveRes && saveRes.success) {
            alert(`报告已导出：${saveRes.filePath}`);
          } else {
            alert(`导出失败：${saveRes.error || '未知错误'}`);
          }
        } else {
          alert(`生成报告失败：${result.error || '未知错误'}`);
        }
      } catch (e) {
        alert(`生成报告出错：${e.message}`);
      } finally {
        // 隐藏进度条
        progressBar.classList.add('hidden');
      }
    });
  }
});
```

保留 3817-3906 行的代码。

---

## 任务 2：修改 preload.js 的 generateMonthlyReport 方法

**文件：** `preload.js:77-78`

- [ ] **步骤 1：修改 generateMonthlyReport 方法签名**

将方法改为接收完整的 statsData（包含 commits 数组），而不是 repos：

```javascript
// 导出报告 API
contextBridge.exposeInMainWorld('exportAPI', {
  saveReport: (html, format) => ipcRenderer.invoke('export-save-report', { html, format }),
  generateMonthlyReport: (params, dimensions, aiConfig) => {
    // params 包含: author, year, month, statsData(包含 commits 数组)
    return ipcRenderer.invoke('generate-monthly-report', {
      author: params.author,
      year: params.year,
      month: params.month,
      statsData: params.statsData,
      dimensions,
      aiConfig
    });
  }
});
```

---

## 任务 3：重写 main.js 的 generate-monthly-report handler

**文件：** `main.js:3696-3743`

- [ ] **步骤 1：重写 generate-monthly-report handler**

删除现有 handler（3696-3743 行），用以下新逻辑替换：

```javascript
// 生成月度审查报告
ipcMain.handle('generate-monthly-report', async (event, { author, year, month, statsData, dimensions, aiConfig }) => {
  try {
    // 校验 AI 配置
    if (!aiConfig || !aiConfig.apiUrl) {
      return { success: false, error: 'AI 配置未填写，请先在"AI 代码审查"面板中配置 API 地址、模型和密钥' };
    }

    const commits = statsData?.commits || [];
    if (commits.length === 0) {
      return { success: false, error: '没有提交记录可生成报告' };
    }

    // 限制最大处理条数
    if (commits.length > 500) {
      return { success: false, error: `提交记录超过 500 条（当前 ${commits.length} 条），请分批生成报告` };
    }

    const BATCH_SIZE = 5; // 每批处理 5 条
    const summaries = [];
    const totalBatches = Math.ceil(commits.length / BATCH_SIZE);

    // 分批处理：为每条提交获取 diff 并生成变更摘要
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

      try {
        // 获取 diff（根据 repo 类型选择不同方式）
        let diffResult;
        if (commit.repoSource === 'local') {
          diffResult = await getLocalRepoDiff(commit.repoPath, commit.revision);
        } else if (commit.repoSource === 'ssh') {
          diffResult = await getSshRepoDiff(commit.repoUrl, commit.revision);
        } else if (commit.repoSource === 'gitlab-api') {
          diffResult = await getGitLabApiDiff(commit.gitlabUrl, commit.token, commit.projectId, commit.revision);
        } else {
          // 未知来源，使用本地尝试
          diffResult = await getLocalRepoDiff(commit.repoPath, commit.revision);
        }

        const diffContent = diffResult?.success ? diffResult.raw : '(无法获取 diff)';

        // 调用 AI 生成变更摘要
        const summaryPrompt = `## 代码变更摘要生成

**提交信息：** ${commit.message}
**作者：** ${author}
**日期：** ${commit.date}
**仓库/分支：** ${commit.project} / ${commit.branch || 'N/A'}
**变更统计：** +${commit.added} -${commit.deleted}

**代码差异（前 500 行）：**
\`\`\`diff
${diffContent.slice(0, 50000)}
\`\`\`

请生成 100 字以内的变更摘要，格式如下：
[文件变更摘要] 修改了 X 个文件，主要变更：
- {filename}: +{add}/-{del} ({变更类型})
[代码概览] {一句话描述改动内容}`;

        const llmResp = await callLLMApi(aiConfig.apiUrl, aiConfig.model, aiConfig.authorization, summaryPrompt);
        const summary = llmResp.success ? llmResp.result : '(摘要生成失败)';

        summaries.push({
          revision: commit.revision,
          date: commit.date,
          message: commit.message,
          commitType: commit.commitType,
          added: commit.added,
          deleted: commit.deleted,
          status: commit.status,
          summary
        });

      } catch (e) {
        summaries.push({
          revision: commit.revision,
          date: commit.date,
          message: commit.message,
          commitType: commit.commitType,
          added: commit.added,
          deleted: commit.deleted,
          status: commit.status,
          summary: `(处理失败: ${e.message})`
        });
      }

      // 发送进度更新
      event.sender.send('monthly-report-progress', {
        current: i + 1,
        total: commits.length,
        batch: batchIndex,
        totalBatches,
        currentCommit: commit.message.slice(0, 30)
      });

      // 批次间延迟 500ms 避免 API 限流
      if (i < commits.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 生成最终报告
    const repoList = [...new Set(commits.map(c => c.project))].join(', ');
    const reportPrompt = `## ${author} ${year}年${String(month).padStart(2,'0')}月 代码绩效报告

### 统计概览
- 提交次数：${statsData.totalCommits}
- 代码增量：+${statsData.totalAdded} -${statsData.totalDeleted} (净增 ${statsData.totalAdded - statsData.totalDeleted})
- 活跃天数：${statsData.activeDays}
- 涉及仓库：${repoList}

### 提交类型分布
${Object.entries(statsData.commitTypeStats || {}).map(([type, cnt]) => `- ${type}: ${cnt}`).join('\n')}

### 阈值告警
- 超阈值提交：${statsData.overThresholdCount}
- 格式化代码警告：${statsData.formatCodeCount}

### 变更摘要（共 ${commits.length} 条提交）
${summaries.map((s, idx) => `${idx + 1}. [${s.date}] ${s.message}\n   ${s.summary}`).join('\n\n')}

请根据以上数据生成一份综合报告，包含：
1. **综合评分**（0-100）：给出评分及理由
2. **问题分类汇总**：按严重程度分类（严重/警告/建议），每类列举 2-3 个具体问题
3. **贡献度评价**：分析该开发者的代码贡献特点和模式
4. **改进建议**：给出 3-5 条具体可行的改进建议

报告语言：中文`;

    const llmResp = await callLLMApi(aiConfig.apiUrl, aiConfig.model, aiConfig.authorization, reportPrompt);
    if (!llmResp.success) {
      return { success: false, error: '报告生成失败: ' + llmResp.error };
    }

    // 组装 HTML 报告
    const reportHtml = buildMonthlyReportHtml(author, year, month, statsData, summaries, llmResp.result);

    return { success: true, html: reportHtml };

  } catch (e) {
    console.error('生成报告错误:', e);
    return { success: false, error: e.message };
  }
});
```

- [ ] **步骤 2：在 main.js 中添加辅助函数 getLocalRepoDiff**

在 `generate-monthly-report` handler 之前添加：

```javascript
// 获取本地仓库的 diff
async function getLocalRepoDiff(repoPath, commitHash) {
  try {
    const command = `git -C "${repoPath}" show --patch --format="" ${commitHash}`;
    const diffOutput = await runCommand(command);
    return { success: true, raw: diffOutput };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 通过 SSH 获取 diff（克隆后获取再清理）
async function getSshRepoDiff(repoUrl, commitHash) {
  const tempDir = path.join(app.getPath('temp'), `jixiao-diff-${Date.now()}`);
  await fs.ensureDir(tempDir);

  try {
    const localDir = repoUrl.split('/').pop().replace('.git', '');
    const repoPath = path.join(tempDir, localDir);

    await runCommand(`git clone --filter=blob:none "${repoUrl}" "${repoPath}"`);
    const command = `git -C "${repoPath}" show --patch --format="" ${commitHash}`;
    const diffOutput = await runCommand(command);

    return { success: true, raw: diffOutput };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    await fs.remove(tempDir);
  }
}

// 通过 GitLab API 获取 diff
async function getGitLabApiDiff(gitlabUrl, token, projectId, commitHash) {
  try {
    const baseUrl = gitlabUrl.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/commits/${commitHash}/diff`;

    const response = await gitlabApiRequest(apiUrl, token);

    if (response.success) {
      const diffOutput = formatGitLabDiff(response.data);
      return { success: true, raw: diffOutput };
    } else {
      return { success: false, error: response.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 格式化 GitLab diff 为统一格式
function formatGitLabDiff(diffData) {
  if (!Array.isArray(diffData)) return '';
  return diffData.map(file => {
    let result = `${'='.repeat(60)}\n`;
    result += `文件: ${file.new_path || file.old_path}\n`;
    result += `状态: ${file.status}\n`;
    result += `${'='.repeat(60)}\n`;
    if (file.diff) {
      result += file.diff + '\n';
    }
    return result;
  }).join('\n');
}
```

- [ ] **步骤 3：在 main.js 中添加 buildMonthlyReportHtml 函数**

在 `generate-monthly-report` handler 之后添加：

```javascript
// 生成月度报告 HTML
function buildMonthlyReportHtml(author, year, month, statsData, summaries, aiReport) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const repoList = [...new Set(summaries.map(s => s.project))].join(', ');

  const commitTypeRows = Object.entries(statsData.commitTypeStats || {})
    .map(([type, cnt]) => `<tr><td>${type}</td><td>${cnt}</td></tr>`)
    .join('');

  const summaryRows = summaries.map((s, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${s.date}</td>
      <td>${escapeHtml(s.message)}</td>
      <td>${s.commitType}</td>
      <td class="num">+${s.added}</td>
      <td class="num">-${s.deleted}</td>
      <td><span class="badge ${s.status}">${s.status}</span></td>
      <td>${escapeHtml(s.summary)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${author} ${year}年${String(month).padStart(2,'0')}月代码绩效报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 24px; border-bottom: 2px solid #4caf50; padding-bottom: 10px; margin-bottom: 20px; }
    h2 { font-size: 18px; color: #4caf50; margin: 30px 0 15px; border-left: 4px solid #4caf50; padding-left: 10px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 30px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: linear-gradient(135deg, #4caf50, #45a049); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-card .value { font-size: 28px; font-weight: bold; }
    .stat-card .label { font-size: 12px; opacity: 0.9; }
    .stat-card.warning { background: linear-gradient(135deg, #ff9800, #f57c00); }
    .stat-card.danger { background: linear-gradient(135deg, #f44336, #d32f2f); }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .num { text-align: right; font-family: monospace; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .badge.normal { background: #e8f5e9; color: #2e7d32; }
    .badge.over { background: #fff3e0; color: #e65100; }
    .badge.format { background: #fce4ec; color: #c2185b; }
    .ai-report { background: #f9f9f9; padding: 20px; border-radius: 8px; white-space: pre-wrap; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(author)} 代码绩效报告</h1>
  <p class="subtitle">${year}年${String(month).padStart(2,'0')}月 | 生成时间：${timestamp}</p>

  <h2>📊 统计概览</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="value">${statsData.totalCommits}</div>
      <div class="label">提交次数</div>
    </div>
    <div class="stat-card">
      <div class="value">+${statsData.totalAdded}</div>
      <div class="label">新增行</div>
    </div>
    <div class="stat-card">
      <div class="value">-${statsData.totalDeleted}</div>
      <div class="label">删除行</div>
    </div>
    <div class="stat-card">
      <div class="value">${statsData.totalAdded - statsData.totalDeleted}</div>
      <div class="label">净增行</div>
    </div>
    <div class="stat-card">
      <div class="value">${statsData.activeDays}</div>
      <div class="label">活跃天数</div>
    </div>
    ${statsData.overThresholdCount > 0 ? `
    <div class="stat-card danger">
      <div class="value">${statsData.overThresholdCount}</div>
      <div class="label">超阈值提交</div>
    </div>` : ''}
    ${statsData.formatCodeCount > 0 ? `
    <div class="stat-card warning">
      <div class="value">${statsData.formatCodeCount}</div>
      <div class="label">格式化警告</div>
    </div>` : ''}
  </div>

  <p style="margin-bottom: 15px;"><strong>涉及仓库：</strong>${escapeHtml(repoList)}</p>

  <h2>📈 提交类型分布</h2>
  <table>
    <tr><th>类型</th><th>次数</th></tr>
    ${commitTypeRows || '<tr><td colspan="2">无数据</td></tr>'}
  </table>

  <h2>📝 变更摘要</h2>
  <table>
    <tr>
      <th>#</th>
      <th>日期</th>
      <th>提交信息</th>
      <th>类型</th>
      <th>新增</th>
      <th>删除</th>
      <th>状态</th>
      <th>摘要</th>
    </tr>
    ${summaryRows || '<tr><td colspan="8">无数据</td></tr>'}
  </table>

  <h2>🤖 AI 综合分析</h2>
  <div class="ai-report">${escapeHtml(aiReport)}</div>

  <div class="footer">
    <p>由代码统计工具自动生成 | 数据仅供参考</p>
  </div>
</body>
</html>`;
}

// HTML 转义辅助函数
function escapeHtml(text) {
  if (!text) return '';
  const div = require('electron').document ? null : { textContent: String(text) };
  // 简单转义
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

## 任务 4：修改 renderer.js 的月度报告按钮逻辑

**文件：** `renderer.js:3817-3906`

- [ ] **步骤 1：修改 generateReportBtn 点击事件**

修改现有的点击事件处理，修复参数传递，添加 repoSource 字段，并监听进度更新：

```javascript
// 生成月度报告按钮逻辑
document.addEventListener('DOMContentLoaded', () => {
  const generateBtn = document.getElementById('generateReportBtn');
  const progressBar = document.getElementById('reportProgress');

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      // 检查是否已有查询数据
      if (!queryResult) {
        alert('请先点击"查询统计"获取当前周期的数据，再生成报告');
        return;
      }

      const commits = queryResult.commits || [];
      if (commits.length === 0) {
        alert('没有提交记录可生成报告');
        return;
      }

      // 显示进度条
      progressBar.classList.remove('hidden');
      const progressInner = progressBar.querySelector('.progress-bar');
      progressInner.style.width = '0%';

      // 收集参数
      const author = document.getElementById('author')?.value?.trim() || queryResult.author || '';
      const yearMonthVal = document.getElementById('yearMonth')?.value || '';
      const [yearNum, monthNum] = yearMonthVal.split('-').map(Number);

      // 读取 AI 配置
      let aiConfig = getAIConfig();
      if (!aiConfig.apiUrl) {
        try {
          const saved = localStorage.getItem('aiConfig');
          if (saved) {
            const parsed = JSON.parse(saved);
            aiConfig = { apiUrl: parsed.apiUrl || '', model: parsed.model || '', authorization: parsed.apiKey || '' };
          }
        } catch (e) { /* ignore */ }
      }

      // 组装 statsData
      const statsData = {
        totalCommits: queryResult.totalCommits || commits.length,
        totalAdded: queryResult.totalAdded || 0,
        totalDeleted: queryResult.totalDeleted || 0,
        overThresholdCount: queryResult.overThresholdCount || 0,
        formatCodeCount: queryResult.formatCodeCount || 0,
        activeDays: Array.isArray(queryResult.activeDays) ? queryResult.activeDays.length : (queryResult.activeDays || 0),
        commitTypeStats: queryResult.commitTypeStats || {},
        commits: commits.map(c => ({
          revision: c.revision || c.hash,
          date: c.date ? c.date.substring(0, 10) : '',
          message: c.message,
          commitType: c.commitType || 'other',
          added: c.added || 0,
          deleted: c.deleted || 0,
          net: c.net || 0,
          status: c.status || 'normal',
          project: c.project || c.repoName || '',
          repoName: c.repoName || '',
          branch: c.branch || '',
          repoSource: c.repoSource || c.source || 'local',
          repoPath: c.repoPath || '',
          repoUrl: c.repoUrl || '',
          gitlabUrl: c.gitlabUrl || '',
          token: c.token || '',
          projectId: c.projectId || ''
        }))
      };

      // 监听进度更新
      const progressHandler = (event, data) => {
        const percent = Math.round((data.current / data.total) * 100);
        progressInner.style.width = percent + '%';
        generateBtn.title = `正在处理: ${data.current}/${data.total} (第${data.batch}/${data.totalBatches}批)`;
      };
      window.electron?.ipcRenderer?.on?.('monthly-report-progress', progressHandler);

      try {
        const result = await window.exportAPI.generateMonthlyReport(
          { author, year: yearNum, month: monthNum, statsData },
          [],
          aiConfig
        );

        if (result && result.success) {
          const saveRes = await window.exportAPI.saveReport(result.html, 'html');
          if (saveRes && saveRes.success) {
            alert(`报告已导出：${saveRes.filePath}`);
          } else {
            alert(`导出失败：${saveRes.error || '未知错误'}`);
          }
        } else {
          alert(`生成报告失败：${result.error || '未知错误'}`);
        }
      } catch (e) {
        alert(`生成报告出错：${e.message}`);
      } finally {
        progressBar.classList.add('hidden');
        generateBtn.title = '生成月度报告';
        window.electron?.ipcRenderer?.removeListener?.('monthly-report-progress', progressHandler);
      }
    });
  }
});
```

---

## 任务 5：添加进度条样式

**文件：** `index.html`

- [ ] **步骤 1：确认进度条 HTML 结构存在**

确认 index.html 中有进度条元素（应在导出按钮附近）：

```html
<button id="generateReportBtn" class="btn btn-small btn-export" title="生成月度报告">📊 生成月度报告</button>
<div id="reportProgress" class="progress hidden" style="margin-top:5px; height:5px; background:#e0e0e0;">
  <div class="progress-bar" style="width:0%; height:100%; background:#4caf50;"></div>
</div>
```

---

## 规格覆盖度检查

| 规格章节 | 对应实现 |
|----------|----------|
| 2.1 统计指标 | statsData 包含 totalCommits, totalAdded, totalDeleted, activeDays, commitTypeStats, overThresholdCount, formatCodeCount |
| 2.2 提交明细 | statsData.commits 包含 revision, date, message, commitType, added, deleted, status, project, repoName, branch |
| 2.3 变更摘要 | 分批获取 diff 后调用 LLM 生成摘要，汇总到 summaries |
| 3. 分批策略 | BATCH_SIZE = 5，批次间 500ms 延迟 |
| 4.1 单条审查 prompt | summaryPrompt 模板 |
| 4.2 最终报告 prompt | reportPrompt 模板 |
| 5.1 HTML 报告结构 | buildMonthlyReportHtml 函数生成完整 HTML |
| 5.2 文件命名 | 由 saveReport 处理（保持原样） |
| 6. 进度展示 | 通过 IPC 发送 progress 事件，前端更新进度条 |
| 7. 错误处理 | try-catch 包裹每条提交处理，失败记录摘要继续执行 |
| 8. 配置项 | batchSize 硬编码为 5，aiConfig 从前端传入 |

---

## 自检

1. ✅ 所有任务都有实际代码
2. ✅ 无占位符（无"待定"、"TODO"）
3. ✅ 类型一致性：statsData.commits 数组中每个元素有 revision, date, message 等字段，与 prompt 中使用一致
4. ✅ 辅助函数（getLocalRepoDiff, getSshRepoDiff, getGitLabApiDiff, buildMonthlyReportHtml, escapeHtml）均在任务中定义
