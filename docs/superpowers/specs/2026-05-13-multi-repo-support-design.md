# 多仓库混合查询功能设计

## 背景

用户希望能够同时查询 SVN 和 Git 仓库的数据，在同一个页面中展示混合的统计结果。

## 需求概述

1. **多行添加项目**：支持同时配置 SVN 和 Git 项目
2. **Git 多项目分支选择**：每个 Git 仓库独立选择分支
3. **混合查询**：同时查询 SVN 和 Git，结果统一展示
4. **来源区分**：结果通过标签区分 SVN/Git

## 架构设计

### 1. 数据结构变更

**原结构：**
```javascript
connectionConfig = {
  vcs: 'svn', // 'svn' | 'git' 单值
  projects: [], // SVN 项目列表
  gitlabMode: 'local',
  // Git 单仓库配置...
}
```

**新结构：**
```javascript
connectionConfig = {
  enabledModes: ['svn', 'git'], // 启用的模式列表
  svn: {
    projects: [{ name, url, username, password }]
  },
  git: {
    repos: [{
      name, url, mode, branches: [], path, // 每个仓库独立配置
      selectedBranches: Set
    }]
  }
}
```

### 2. UI 变更

**登录配置区域：**
- 移除 SVN/Git 互斥切换，改为可折叠的配置区块
- 两个区块默认都展开，同时可见
- SVN 项目列表和 Git 仓库列表可同时添加

**Git 仓库分支选择：**
- 每个 Git 仓库独立显示分支选择器
- 多仓库时，每个仓库显示为可折叠卡片

**提交结果展示：**
- 分组选项卡格式：`[SVN]项目A`、`[Git]仓库B`
- 提交表格增加"来源"列（绿色 SVN 标签 / 蓝色 Git 标签）

### 3. 查询流程

```
1. 用户配置 SVN 项目列表
2. 用户配置 Git 仓库列表（每个仓库独立选分支）
3. 点击查询
4. 后端并行查询 SVN 和 Git：
   - svn-stats (多个项目)
   - git-local-stats / git-ssh-stats (多个仓库)
5. 合并结果：
   - 给每个 commit 添加 source: 'svn' | 'git'
   - project/projectUrl 保持原样
6. 返回统一格式结果
```

### 4. 数据流变更

**Commit Record 新增字段：**
```javascript
{
  // ... 现有字段
  source: 'svn' | 'git', // 来源标识
  repoType: 'svn' | 'git' // 兼容旧版
}
```

### 5. IPC Handler 变更

**新增 Handler：**
- `multi-stats`: 接收混合配置，并行查询后合并结果

**请求格式：**
```javascript
{
  svn: {
    projects: [...],
    username, password
  },
  git: {
    repos: [{
      mode: 'local' | 'ssh',
      url, path, branches: [], selectedBranches: []
    }]
  },
  author, year, month, startDate, endDate,
  threshold, formatThreshold
}
```

### 6. 图表与统计

**图表：**
- 折线图/柱状图：聚合两个数据源的 dailyStats
- 饼图：聚合两个数据源的 commitTypeStats

**统计卡片：**
- 汇总 SVN + Git 的总计数据
- 分组表格分别显示 SVN 项目和 Git 仓库

### 7. 标签样式

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

## 实现计划

1. 修改 `connectionConfig` 数据结构
2. 修改 renderer.js UI，改为可折叠的双区块配置
3. 每个 Git 仓库独立分支选择器
4. 新增 `multi-stats` IPC handler
5. 修改 main.js 中的各查询函数支持多项目
6. 修改 renderer.js 结果展示（来源标签、分组选项卡）
7. 修改图表聚合逻辑

## 验收标准

- [ ] 可以同时配置 SVN 项目和 Git 仓库
- [ ] 每个 Git 仓库可以独立选择分支
- [ ] 查询结果同时包含 SVN 和 Git 提交
- [ ] 分组选项卡正确显示来源标签
- [ ] 提交表格正确显示来源标签
- [ ] 图表正确聚合两个数据源
- [ ] 统计卡片正确汇总两个数据源