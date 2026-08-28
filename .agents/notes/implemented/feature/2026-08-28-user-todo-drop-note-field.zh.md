# Agent Note：移除用户待办的备注字段

Status: implemented

[English](2026-08-28-user-todo-drop-note-field.md) | 中文

## 问题

今日待办条目此前端到端携带可选 `note`：记录字段、put 补丁、模型可见目录行中的 `(note: ...)` 段，以及抽屉详情卡里的每行备注编辑器。实际上标题、到期与项目/会话链接承载了全部价值，备注编辑器挤占卡片，而编辑器之外没有任何写入方。用户要求展开卡直接呈现条目的完整内容、去掉备注编辑器。

## 决策

`note` 从整个接缝移除，而不是保留为永不被写的死字段：`UserTodoRecord`/`UserTodoPutRequest` 与存储域 schema（`packages/todo/user-todo`）、controller 与 Remote 面（`packages/client/ui-user-todo`）、目录投影（渲染行去掉 `(note: ...)` 段）、行 UI（详情卡呈现标题、到期、链接、打开会话按钮与创建日期；locale 词典删去备注键）。钉住行为的测试套件与两份 README 对随代码一同更新。

`user_todo` 域保持在 schema 版本 1。记录经 spec 的 zod `parse` 加载，非 strict 对象会剥离未知键，因此仍携带 `note` 的存量记录加载时静默丢弃该值——无需迁移，也无需升版本。目录的 digest 与会话日志可重建性不受影响：所有投影来源在同一次变更中一起去掉了该段。

## 备选方案

只删编辑器、保留宿主字段被否决：没有代码能写的字段是死重，而预发布立场倾向于删掉整条接缝而不是留下垫片。升域版本到 2 也被否决：parse 语义本就接受旧介质，升版本没有必要。
