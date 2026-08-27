# @deepseek-ai/dsh-session-pins

[English](README.md) | 中文

用户的置顶会话集合：一组持久的会话 id，存放在自己的 [`storage-domain`](../../storage/storage-domain/README.zh.md) 域 `session_pins` 中，由 web 会话头部星钮与侧栏置顶区块（[`dsh-client-ui-session-pins`](../../client/ui-session-pins/README.zh.md)）经生成的 `sessionPins` Remote 命名空间读写。该集合只面向用户——这里的任何内容都不会进入会话日志、模型请求或工具 schema。

置顶只是引用：会话 id 是表键，`pinnedAt`（宿主盖戳）决定顺序。`pin` 对已置顶会话幂等且不重盖戳；`unpin` 对不存在的会话幂等。每次实质变更发出 `session-pins/changed` 事件（已加入浏览器白名单），消费方重拉整表而非回放增量。置顶一个既非存活也非已持久化的会话会以 `session-not-found` 响亮失败，而不是把死 id 停进表里。

已归档的置顶会话保留其置顶（归档是可见性而非成员关系）；侧栏置顶区块会跳过归档行，使区块只反映浏览器实际可见的内容。

## Configuration

服务没有组合配置：集合没有任何随部署变化的选项。

## Model Experience

None；该域是用户拥有的应用数据，不进入任何请求组装；模型看不到置顶，投影词汇也不新增成员。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **无 compare-and-set** —— pin/unpin 只会与自身跨窗口竞争；输掉的竞争在下一次重拉时收敛。
- **会话删除不级联** —— 被删除会话的置顶仍存留，只是不再渲染；连带清理边车的删除原语是另行延后的工作。
- **置顶顺序仅追加** —— 没有手动重排；置顶按最旧在前列出。
