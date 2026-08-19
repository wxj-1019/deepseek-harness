# Agent Note: 按文件类型的 VS Code 风格文件图标

Status: implemented

[English](2026-08-19-vscode-file-icons.md) | 中文

日期：2026-08-19 · 领域：`packages/client/ui-primitives`、`patches/dsh-better-sidebar@0.13.0.patch`

## 问题

Web 工作区树里每个文件行都顶着同一枚"#"字形，整棵树读起来就是一堵无差别的井号墙。那枚井号是 `IconCodeOutline16`——ic_ds_* 图标集的通用"代码"字形，其路径画的就是一个井号——被 `dsh-better-sidebar` 的 FileTree 与产物 chip 无差别地套在每个文件上。文件夹行本来就渲染真正的文件夹字形；丢失类型身份的只有文件行。

## 决策

文件行现在按类型渲染专属字形，分两半实现。

`dsh-client-ui-primitives` 新增 `FileIcon` 与纯函数 `fileIconKind(name)`：先小写化，再查无扩展名表（dotfile 与构建文件），然后查扩展名表，落到 `generic`。渲染沿用 VS Code 图标主题的做法——按类型身份色的圆角字母铭牌（TS/JS/HTML/CSS/PY/PS/PDF……）、shell 方言的提示符字形、图片/压缩包/文档的绘制形状，以及未识别类型回退的 currentColor 折角页。身份色放在字形表而不是 `--dsw-*` token：文件类型的颜色是品牌身份而非主题状态——与 VS Code 以静态图标主题 SVG 发布是同一个选择。因此 `FileIcon` 按设计处于 ic_ds_* 单色契约之外；它自己的测试钉住映射、纯度、颜色区分度与 currentColor 回退。

插件侧的替换以 `patches/dsh-better-sidebar@0.13.0.patch` 交付（pnpm patchedDependencies，与既有 node-pty 补丁同一机制）：两处按文件取图标的位置——FileTree 行与产物 chip——改渲染 `FileIcon name=…`；`IconCodeOutline16` 在表达"代码"语义处保留（上下文菜单的打开动作、代码查看器、编辑器/资源管理器布局开关）。

## 曾考虑的替代方案

- **直接重绘 `IconCodeOutline16` 为文件形状** —— 否决：菜单、代码查看器与布局开关把它当"代码"意图字形使用；井号在那里语义正确，那些表面与树同样拥有这枚字形。
- **依赖图标主题包而不是自行绘制** —— 暂缓：候选包在仓库的 NodeNext 与 publint 门禁下不是 typed-ESM 干净的，而精选表（20 类）已覆盖 harness 自身的表面；调用方只见 `fileIconKind` + `FileIcon`，日后更换绘制后端是局部改动。
- **把插件 fork 或 vendor 进 `vendor/`** —— 否决：两处替换不值得背上 vendor 一个活跃开发插件的维护负担。

## 后果

- 无扩展名表与扩展名表是唯一扩展点；新增一类是表里一行加（铭牌类）一条铭牌配置。铭牌字号由标签长度决定，三个字符的标签在 14px 树行尺寸下仍可读。
- 覆盖：`packages/client/ui-primitives/tests/file-icons.client.spec.tsx` 钉住解析（大小写不敏感、最后一个点取扩展名、名称表、generic 回落）与渲染（kind 属性、纯度、颜色区分、currentColor 回退、size/className 传递）。装配层面的检查是对运行中 Web 应用按操作者真实工作区目录的无头渲染（最初反馈的四个文件映射为 text/text/html/powershell）。不为该面板提交 web e2e 是有意的：那会钉住外部插件的内部结构；插件拥有自己的测试面，仓库门禁覆盖它消费的原语。
- 补丁同时改插件的 `src/` 与两份预构建 `lib/` bundle，替换在重装后依然成立，服务端分发的 bundle 无需重建插件即携带改动。把替换上游化到 `dsh-better-sidebar` 即可退役补丁；在那之前插件升版需要重做或重导补丁。
