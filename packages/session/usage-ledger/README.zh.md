# @deepseek-ai/dsh-usage-ledger

[English](README.md) | 中文

每会话用量台账：在自己的 [`storage-domain`](../../storage/storage-domain/README.zh.md) 域 `usage_ledger` 中，每个会话一行持久记录，由会话事件流上的采集器累积。每条带用量的 `assistant/message` 事件把 provider 上报的各桶（输入、输出、缓存读、缓存写）累加进该会话的行，递增样本数、盖下墙钟时间，并把样本折入按事件模型溯源键分的每模型切片，以及按宿主本地日历日 × 模型的交叉切片。由 web 的“用量”标签页（[`dsh-client-ui-usage`](../../client/ui-usage/README.zh.md)）经生成的 `usageLedger` Remote 命名空间渲染。台账只面向用户——这里的任何内容都不会进入会话日志、模型请求或工具 schema。

每次累加都会发出白名单事件 `usage-ledger/changed`；已加载表面收到它以及 `connection/reset` 时重拉。同会话样本经每会话写链串行化，`list()` 会等待在途链，因此样本之后立即发出的读取绝不会漏掉它。

## Configuration

`pricing` —— 可选价格表（USD / 1M token），按 provider 模型 id 键控，`*` 为回退键。配置后 `list()` 会发布该表，具备成本能力的表面据此推导并显示成本；未配置（或空表）时任何地方都不显示成本。价格是部署事实，绝不臆测。

## Model Experience

None；该域是用户拥有的应用数据，只观察用量而不产生它。

#### KV Cache effect

None；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- **无重置或保留** —— 行单调累积；按会话或全局的重置动词与保留策略是延后工作。
- **替换样本理论上会重复计数** —— token-meter 的排序性质（后一步的用量替换更早的 (turn, step) 样本）保证合法日志安全；手写的敌意日志可能抬高某行。
- **无按模型或按天细分** —— 每会话一行扁平求和；切分属于带自身 schema 版本的后续工作。
