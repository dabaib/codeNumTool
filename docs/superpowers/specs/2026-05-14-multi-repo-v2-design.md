# 多仓库混合查询（修订版）功能设计

## 背景

用户要求修改当前的多仓库混合查询功能：
1. VCS 类型恢复为 SVN/Git 单选（互斥）
2. 保留 Git 多仓库配置需求
3. 登录后连接验证后，在当前页面先选择分支后查询
4. 结果页面按项目统计，Git 项目下增加分支筛选

## 需求概述

1. **VCS 单选**：恢复为 SVN/Git 互斥选择
2. **Git 多仓库配置**：支持配置多个 Git 仓库，每个独立选择分支
3. **分支选择前置**：连接验证后，在登录页面选择分支，然后查询
4. **结果页面分支筛选**：Git 项目可展开分支复选框进行二次筛选

## 架构设计

### 1. 数据结构

```javascript
connectionConfig = {
  vcs: 'svn' | 'git', // 单值，恢复互斥
  svn: {
    projects: [{ name, url }],
    username: '',
    password: ''
  },
  git: {
    repos: [{
      id, name, mode, url, path,
      branches: [],           // 所有分支
      selectedBranches: []   // 选择的分支
    }]
  },
  threshold: 500,
  formatThreshold: 200,
  // AI 配置...
}
```

### 2. 登录页面 UI

**VCS 切换：恢复为单选互斥**
```javascript
vcsToggleButtons.forEach(button => {
  button.addEventListener('click', () => {
    const vcs = button.dataset.vcs;
    // 互斥：只切换到选定模式，隐藏另一种
    connectionConfig.vcs = vcs;
    // 更新按钮高亮
    // 显示/隐藏对应配置区块
  });
});
```

**Git 多仓库卡片：**
- 每个仓库显示为可折叠卡片
- 卡片包含：仓库名称、模式选择、路径/URL 输入、分支选择器
- 有"添加仓库"按钮

**登录后分支选择：**
- 连接验证成功后（SVN 无需选择分支直接查询）
- Git 模式：显示每个仓库的分支选择器（分支多选标签）
- 用户勾选分支后，点击"查询"

### 3. 结果页面 UI

**分组选项卡：**
```
[全部项目] [SVN项目A] [SVN项目B] [Git仓库A▼] [Git仓库B▼]
```

**Git 仓库展开（点击 ▼）：**
```
[Git仓库A▼]
  ├─ ☑ main        ← 复选框，选中则显示该分支统计
  ├─ ☑ develop
  └─ ☐ feature-xxx
```

**联动逻辑：**
1. 选择分支 → 该仓库的 `selectedBranches` 更新
2. 触发该仓库的统计重新计算
3. 图表和数据联动刷新

### 4. IPC Handler

**新增/修改 Handler：**

- `svn-stats`：保持不变
- `git-multi-stats`：支持多个仓库，每个仓库指定分支

**请求格式：**
```javascript
{
  git: {
    repos: [{
      mode: 'local' | 'ssh',
      url, path,
      selectedBranches: ['main', 'develop']
    }]
  },
  author, year, month, threshold, formatThreshold, startDate, endDate
}
```

### 5. 标签样式

**来源标签（复用现有）：**
```css
.source-tag.svn { background: #d4edda; color: #155724; }
.source-tag.git { background: #cce5ff; color: #004085; }
```

## 实现计划

1. **修改 VCS 切换为单选互斥**
   - 恢复 `connectionConfig.vcs = 'svn' | 'git'` 单值
   - UI 按钮高亮互斥

2. **重构 Git 多仓库配置 UI**
   - 多仓库卡片列表
   - 每仓库独立分支选择器

3. **修改登录后分支选择流程**
   - SVN：直接查询
   - Git：连接验证后显示分支选择 → 选择分支 → 查询

4. **修改结果页面分支筛选**
   - Git 仓库显示为可展开卡片
   - 展开后显示分支复选框
   - 选择分支后联动更新统计

5. **修改 IPC handler 支持多仓库多分支查询**

## 验收标准

- [ ] VCS 类型单选互斥
- [ ] Git 支持配置多个仓库
- [ ] 登录后每个 Git 仓库独立选择分支
- [ ] 结果页面 Git 仓库可展开分支筛选
- [ ] 分支筛选联动更新统计结果