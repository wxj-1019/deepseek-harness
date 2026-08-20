# Web 表面的输入框图片上传入口

日期：2026-08-19
领域：`packages/client/ui-conversation`

[English](2026-08-19-composer-image-upload-entry.md) | 中文

## 决策

输入框在"命令"按钮旁新增了可见的"上传图片"按钮。Web 的图片摄入管线——投影的 `imageLimits` 准入预检、随后的 rail 缩略图、宿主准入——本就存在且可用，但只能通过整页拖放与剪贴板粘贴到达，没有任何可发现的文件选择入口，于是"传图"实际上等于隐形（`InputBar` 原本只有 命令/访问模式/模型/发送 四个控件）。按钮打开一个隐藏的 `<input type="file" accept="image/*" multiple>`，所选文件走拖放与粘贴处理用的同一条 `intakeImages` 路径，因此所有手势共享同一套准入策略：触碰投影限额的批次整体拒绝并给出相同文案，每次选择后清空 input 值，同一文件可再次选择再触发 change。按钮在输入框锁定、忙碌或未装配附件服务面（`addImages === undefined`）时禁用，与拖放门控一致。

无需宿主或路由改动：文本会话收到图片本就通过 `dsh-llm-vision-route` 转到 `vision-model` 方案——线上部署已验证——deepseek 会话收到图片后切到 `qwen3-vl-plus` 完成分析并保持（会话持久路由，见 [2026-08-17-vision-model-routing note](2026-08-17-vision-model-routing.md)）。

排查过程中发现 master 上已提交的 `vision-route.e2e` settings golden 过期：它早于 better-sidebar 新增的 "Side card" 设置导航，replay 会失败。已刷新该 golden（多一行导航项），现在 replay 通过。

## 影响

- 上传按钮是在共享摄入之上的又一种入口：开文件选择器，且拖放/粘贴/点击全部汇入 `intakeImages`，限额行为与错误文案不会因入口不同而分叉。
- 覆盖：ButtonBar 规范新增点击打开、所选文件走摄入、两个禁用臂（锁定/无附件面）；新的无 key `apps/web/tests/composer-attach.e2e.ts` 场景通过按钮的文件输入上传 PNG 并钉住 rail 缩略图 golden，零模型调用。
- vision-route settings golden 的刷新是独立修正，与本次改动同一提交发出，保证 master 上 CI replay 通过。
