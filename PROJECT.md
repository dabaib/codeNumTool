# SVN代码统计工具

## 项目概述

这是一个基于 Electron 的桌面应用程序，用于统计 SVN 仓库中指定用户的代码提交情况。

## 技术栈

- **Electron**: 桌面应用框架
- **ECharts**: 图表可视化
- **iconv-lite**: 字符编码转换（处理 SVN 命令输出的中文）
- **原生 HTML/CSS/JS**: 前端界面

## 项目结构

```
jixiao/
├── main.js          # Electron 主进程，处理 SVN 命令执行
├── preload.js       # 预加载脚本，暴露 API 给渲染进程
├── renderer.js      # 渲染进程，前端交互逻辑
├── index.html       # 主界面 HTML
├── styles.css       # 样式文件
├── package.json     # 项目配置
└── node_modules/    # 依赖包
```

## 核心功能

### 1. 多项目支持
- 支持同时配置多个 SVN 项目
- 每个项目包含：项目名称 + SVN地址
- 登录时验证所有项目连接，只保留成功的项目

### 2. 代码统计
- 按月份统计指定用户的提交
- 统计新增行数、删除行数、净增行数
- 统计提交次数

### 3. 阈值检测
- **超阈值提交**：单次提交代码量超过设定阈值（默认500行）
- **格式化代码**：变化量超过格式化阈值（默认200行）且新增/删除行数接近（差异≤20%）

### 4. 提交类型识别
自动识别提交信息前缀：
- `feat`: 新功能
- `fix`: 修复
- `refactor`: 重构
- `style`: 样式
- `docs`: 文档
- `test`: 测试
- `chore`: 杂务
- `perf`: 性能优化
- `ci`: CI配置
- `build`: 构建

### 5. 筛选功能
- 按项目筛选
- 按提交类型筛选
- 按状态筛选（正常/超阈值/格式化）
- 关键词搜索

### 6. 可视化
- 每日代码变化趋势折线图
- 每日提交次数柱状图

### 7. 项目统计表格（全部项目视图）
- 在"全部项目"视图下显示各项目代码量汇总表格
- 包含列：项目名称、提交次数、新增行、删除行、净增行、feat数量、fix数量、其他数量
- 底部显示合计行

## API 接口

### preload.js 暴露的 API

```javascript
window.svnAPI = {
  // 登录验证
  login(projects, username, password) -> Promise<{success, results, message}>

  // 获取统计数据
  getStats(projects, username, password, author, year, month, threshold, formatThreshold)
    -> Promise<{success, data}>
}
```

### 数据结构

#### 项目配置
```javascript
{
  name: '项目名称',
  url: 'SVN地址'
}
```

#### 提交记录
```javascript
{
  project: '项目名称',
  projectUrl: 'SVN地址',
  revision: '版本号',
  date: '提交日期',
  author: '作者',
  message: '提交信息',
  commitType: 'feat|fix|refactor|style|docs|test|chore|other',
  added: 123,      // 新增行数
  deleted: 45,     // 删除行数
  net: 78,         // 净增行数
  status: 'normal|over|format'  // 状态
}
```

#### 统计结果
```javascript
{
  totalAdded: 1000,
  totalDeleted: 500,
  totalCommits: 20,
  overThresholdCount: 2,
  formatCodeCount: 1,
  chartData: [...],      // 每日统计数据
  commits: [...],        // 所有提交记录
  projectStats: {...}    // 按项目分组的统计
}
```

## 主要文件说明

### main.js
- `runSvnCommand(command)`: 执行 SVN 命令
- `parseCommitType(message)`: 解析提交类型前缀
- `getCommitStatus(added, deleted, threshold, formatThreshold)`: 判断提交状态
- IPC 处理器：`svn-login`, `svn-stats`

### renderer.js
- 项目列表动态管理（添加/删除）
- 登录流程控制
- 查询和结果展示
- 筛选和分页逻辑
- ECharts 图表渲染

### styles.css
- 渐变色卡片设计
- 响应式布局
- 提交类型/状态标签样式
- 表格和分页样式

## 运行命令

```bash
# 安装依赖
npm install

# 开发运行
npm start

# 打包
npm run build
```

## 注意事项

1. **SVN 客户端依赖**：需要系统安装 SVN 命令行工具
2. **字符编码**：Windows 下 SVN 输出使用 GBK 编码，使用 iconv-lite 转换
3. **ECharts 初始化**：容器需要先显示再初始化图表，否则宽度为0
4. **大仓库性能**：每个提交都需要执行 `svn diff`，大量提交时查询较慢

## 待优化项

- [ ] 添加查询进度条
- [ ] 支持导出统计报告（Excel/PDF）
- [ ] 缓存查询结果
- [ ] 支持日期范围查询（不限于月份）
- [ ] 支持多用户对比统计
- [ ] 添加提交记录详情弹窗（查看具体文件变更）
