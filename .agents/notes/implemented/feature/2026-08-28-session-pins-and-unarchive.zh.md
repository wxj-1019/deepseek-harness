# Agent Note: 会话置顶与解除归档表面

Status: implemented

[English](2026-08-28-session-pins-and-unarchive.md) | 中文

## 问题

web 侧栏对管理大量会话的用户有两处可见性缺口。没有置顶会话的办法：工作区浏览器只按工作区记账与最近度排序，一周里反复要回来的会话会滚走。而归档是单向的：`archiveSession` 把会话从所有分组表面藏起来，却没有任何地方能看到或撤销——已归档会话只能手工改动设置层相邻的状态才救得回来。

## 决策

**置顶。** 新宿主包 `@deepseek-ai/dsh-session-pins` 拥有一个 `session_pins` 存储域（表按会话 id 为键，`pinnedAt` 定序）与一个 Typert Remote 命名空间 `sessionPins`（`list` / `pin` / `unpin`）。置顶既非存活也非已持久化的会话会以 `session-not-found` 响亮失败；`pin` 幂等且不重盖戳，`unpin` 对不存在的会话幂等。每次实质变更发出 `session-pins/changed` 事件（已加入浏览器白名单），已加载的表面收到它以及 `connection/reset` 时重拉。客户端包 `@deepseek-ai/dsh-client-ui-session-pins` 在同一 controller 上渲染两个表面：`conversation.session.header.actions` 的星钮（置顶时填充），以及 `sidebar.pinned` 区块——ui-sidebar 新声明的、位于侧栏控件与浏览区之间的槽位——按置顶顺序列出，跳过归档行，点击直达，悬停取消置顶。

**解除归档。** `WorkspaceRegistry.unarchiveSession` 与 `archiveSession` 镜像：幂等、拒绝未知会话，并——因为归档保留记账槽位——恢复会话在工作区记录的位置。线路增加 `workspace.unarchiveSession`（同一 `host/archived-sessions-changed` 帧经域全局差异免费下发）。工作区浏览器在会话列表下方渲染可折叠的“已归档（N）”区块：每行带标题、点击打开、悬停恢复；失败只作为控制台诊断，与重排拒绝的姿态一致。

无 key 的 web 旅程经组装应用钉住两个表面（`apps/web/tests/session-pins.e2e.ts`）与归档区块（`apps/web/tests/workspace-management.e2e.ts` 的解除归档段）。单元套件钉住服务语义（`packages/session/session-pins/tests/session-pins.spec.ts`，含重启持久与死 id 拒绝），workspace 注册表的解除归档镜像沿用其既有归档测试的形状。

## 考虑过的替代方案

- **把置顶并入 workspace 注册表。** 未采纳：归档集是注册表全局的，但置顶是正交的用户状态——独立域保持注册表写面干净，也让该功能拥有自己的版本边界（workspace 域已走过 v1→v2；置顶不该搭那趟车）。
- **置顶在工作区分组内前移（置顶先出）。** 推迟而非否决：排序归属树的属主（ui-workspace）；本轮置顶区块就是规范落点，组内重排可以作为树的纯增量改动落地。
- **浏览器树内的行级置顶钮。** 同理推迟——头部星钮覆盖了操作入口，无需改动行渲染器。
- **同提交一并做会话删除。** 作为范围否决：被延后的 domain-KV 笔记拥有 `SessionPersistence.delete` 原语与边车级联（反馈、待办、置顶）；在这里只做“删文件”式删除会违背那个设计的理由。

## 后果

- 已归档会话终于可在产品内看到并恢复；归档/恢复往返各一次注册表变更，无需边车清理。
- 头部星钮出现在每个会话上——截取会话头部的黄金快照会多出该按钮行。
- 被删除会话的置顶记录保留但停止渲染；留存语义已记录，等待删除原语落地。
- `sidebar.pinned` 从此成为“位于浏览器上方的区块”类表面的文档化座位，无占用者时不渲染。

## 风险

- **黄金刷新面宽。** 头部星钮影响所有会话视图快照；本次只刷新了差异恰为按钮行的黄金，其余以 CI 回放钉住。
- **置顶区块跨窗口陈旧。** 没有白名单事件时第二个窗口会隐形置顶；推送事件加变更重拉已接线，并由旅程的 reload 段覆盖。
- **未知 id 拒绝与改期。** 为已删除会话置顶在写侧失败；会话删除落地时，置顶表需要删除笔记所指定的同级联。
