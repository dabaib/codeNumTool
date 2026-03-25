---
description: 开发新功能或修改代码后自动更新 CLAUDE.md 文档
---

# 代码修改后文档同步规则

每次完成代码修改后，**必须**检查并更新 `CLAUDE.md` 文件：

## 检查清单

1. **新增 IPC Handler** → 更新 "IPC Handlers Reference" 表格
2. **修改数据结构** → 更新 "Key Data Structures" 部分  
3. **新增功能模块** → 添加功能说明章节
4. **修改依赖** → 更新 "Dependencies" 部分
5. **修改架构** → 更新 "Architecture" 部分
6. **新增 preload API** → 更新 "Process Model" 中的 preload 描述

## 执行时机

- 在完成功能开发、提交给用户验证**之前**
- 作为实现流程的最后一步（不是可选项）

## 更新格式

保持与现有文档风格一致：
- 使用英文编写技术术语和代码引用
- 中文说明复杂业务逻辑
- 表格使用 Markdown 格式
