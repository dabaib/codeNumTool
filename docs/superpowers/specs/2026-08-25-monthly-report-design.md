# 月度代码报告生成功能设计规格

## 1. 概述

**功能目标：** 为单个开发者生成标准化的月度代码绩效报告，报告格式统一、数据可比，便于后续用 AI 进行多人间横向评比。

**核心流程：**
1. 工具获取开发者指定月份的统计结果和全部提交明细
2. 分批获取每条提交的 diff，生成变更摘要
3. 汇总统计指标 + 变更摘要，AI 生成综合评分报告
4. 输出标准化 HTML 报告

## 2. 数据收集

### 2.1 统计指标（必须包含）

| 指标 | 说明 |
|------|------|
| author | 开发者名称 |
| year-month | 报告月份，格式 YYYY-MM |
| totalCommits | 提交次数 |
| totalAdded | 总新增行数 |
| totalDeleted | 总删除行数 |
| netLines | 净增行数 (= added - deleted) |
| activeDays | 活跃天数（不同日期的提交次数） |
| commitTypeStats | 提交类型分布 {feat: N, fix: N, ...} |
| overThresholdCount | 超阈值提交数（单次 > threshold） |
| formatCodeCount | 格式化代码警告数 |
| repoList | 涉及的仓库列表 |

### 2.2 提交明细

每条提交包含：
```javascript
{
  revision: string,      // commit hash
  date: string,          // 提交日期 YYYY-MM-DD
  message: string,       // 提交信息
  commitType: string,    // feat|fix|refactor|...
  added: number,
  deleted: number,
  net: number,
  status: string,        // normal|over|format
  project: string,       // 仓库名
  branch: string,        // 分支名
  repoName: string,
  repoSource: string     // 'local'|'ssh'|'gitlab-api'
}
```

### 2.3 变更摘要（每条提交一条）

由 AI 根据 diff 生成，固定格式：
```
[文件变更摘要] 修改了 X 个文件，主要变更：
- {filename}: +{add}/-{del} ({变更类型})
[代码概览] {一句话描述改动内容}
```

## 3. 分批策略

- **批次大小**：默认 5 条提交/批（可配置）
- **执行顺序**：先获取统计指标 → 分批获取 diff 生成摘要 → 汇总后生成最终报告
- **断点续传**：记录每批完成状态，中途失败可重试

## 4. AI 审查 prompt 设计

### 4.1 单条提交审查 prompt

```
## 代码变更审查

**提交信息：** {message}
**作者：** {author}
**日期：** {date}
**仓库/分支：** {repoName} / {branch}
**变更统计：** +{added} -{deleted}

**代码差异：**
\`\`\`diff
{full_diff_content}
\`\`\`

请生成 100 字以内的变更摘要，格式如下：
[文件变更摘要] 修改了 X 个文件，主要变更：
- {filename}: +{add}/-{del} ({变更类型})
[代码概览] {一句话描述改动内容}
```

### 4.2 最终报告生成 prompt

```
## {author} {year}年{month}月 代码绩效报告

### 统计概览
- 提交次数：{totalCommits}
- 代码增量：+{totalAdded} -{totalDeleted} (净增 {netLines})
- 活跃天数：{activeDays}
- 涉及仓库：{repoList}

### 提交类型分布
{commitTypeStats}

### 阈值告警
- 超阈值提交：{overThresholdCount}
- 格式化代码警告：{formatCodeCount}

### 变更摘要（共 {totalCommits} 条提交）
{每条的变更摘要列表}

请根据以上数据生成一份综合报告，包含：
1. **综合评分**（0-100）：给出评分及理由
2. **问题分类汇总**：按严重程度分类（严重/警告/建议），每类列举 2-3 个具体问题
3. **贡献度评价**：分析该开发者的代码贡献特点和模式
4. **改进建议**：给出 3-5 条具体可行的改进建议

报告语言：中文
```

## 5. 报告输出格式

### 5.1 HTML 报告结构

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{author} {year}年{month}月代码绩效报告</title>
  <style>
    /* 标准化的报告样式 */
  </style>
</head>
<body>
  <header>
    <h1>{author} 代码绩效报告</h1>
    <p class="subtitle">{year}年{month}月 | 生成时间：{timestamp}</p>
  </header>

  <section id="stats">
    <!-- 统计指标卡片 -->
  </section>

  <section id="commit-summary">
    <!-- 变更摘要列表 -->
  </section>

  <section id="ai-report">
    <!-- AI 综合评分报告 -->
  </section>

  <footer>
    <p>由代码统计工具自动生成</p>
  </footer>
</body>
</html>
```

### 5.2 报告文件命名

```
{author}_{year}{month}_代码绩效报告.html
例：张三_202608_代码绩效报告.html
```

## 6. 进度展示

- **进度条**：显示 当前批次 / 总批次数
- **状态文字**：显示当前操作（"正在获取第 3/20 批提交详情..."）
- **完成提示**：报告生成完成后显示保存路径

## 7. 错误处理

| 场景 | 处理方式 |
|------|----------|
| AI 配置未填写 | 弹窗提示，终止执行 |
| 获取 diff 失败 | 记录失败提交，继续处理下一条 |
| API 调用超时 | 重试 1 次，仍失败则跳过该条 |
| 批次处理中断 | 保存进度，支持从断点继续 |
| 报告生成失败 | 显示错误信息，可重试 |

## 8. 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| batchSize | 5 | 每批处理的提交数 |
| apiUrl | - | LLM API 地址（必填）|
| model | - | 模型名称（必填）|
| authorization | - | API Key（可选）|
| dimensions | 全部勾选 | 审查维度 |

## 9. 技术实现要点

### 9.1 前端职责
- 收集 `queryResult` 中的统计数据和提交列表
- 调用 `exportAPI.generateMonthlyReport()` 传入完整数据
- 显示进度条，处理进度更新

### 9.2 后端职责
- 接收提交列表，批量获取 diff
- 调用 AI 生成变更摘要
- 汇总后调用 AI 生成最终报告
- 返回 HTML 内容

### 9.3 diff 获取
- 本地仓库：`git -C {path} show {hash} --stat --format="" -p`
- SSH 仓库：克隆后获取
- GitLab API：`/projects/{id}/repository/commits/{hash}/diff`

## 10. 限制与约束

- 单次报告生成最大处理 500 条提交（超出提示分批）
- 每条 diff 最大 10MB（超出截断并标注）
- 批次间延迟 500ms（避免 API 限流）
- 报告 HTML 最大 5MB（超出压缩或分页）
