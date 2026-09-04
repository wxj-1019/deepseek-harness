# Agent Note：DeepSeek 上下文溢出改道压缩，v4 目录对齐 API 窗口

Status: implemented

[English](2026-09-02-deepseek-context-overflow-compaction.md) | 中文

## 问题

一个长会话死于 `400 … request (264029 tokens) exceeds the available context size (262144 tokens), type: exceed_context_size_error`，而两道安全网全部落空：

1. **压力压缩按虚幻窗口计算。** llm-deepseek 目录给 v4 模型声明 `contextWindow: 1_000_000`，而 API 强制 `n_ctx: 262144`（提供商自己的 400 响应体写明了）。步间压力检查（`compaction-basic` 按 `resolveModelInfo().context` 计价）因此在实际窗口已被超越的时刻仍看到 ~26% 的占用，从不压缩。UI 的上下文百分比显示的也是同一个错误值。
2. **溢出恢复从未分类到这个错误。** `compaction-basic` 只在请求失败携带 `CONTEXT_WINDOW_EXCEEDED` 时恢复。DeepSeek 适配器的非 OK 分支只解析 `{error:{…}}` 包装形态，然后把扁平的 DeepSeek 400 体（`{code:400, type:'exceed_context_size_error', message:…}`——`code` 是 HTTP 状态）交给通用 HTTP 状态映射，产出一个恢复逻辑忽略的通用码。本轮直接失败，而不是压缩后重试。

## 决策

- **目录**：内置 v4 模型条目声明 `contextWindow: 262_144`——来自提供商自身错误的 API 强制值——替换这些模型的 1,000,000 默认。部署更大档位的账号可在 settings 中按模型覆盖。
- **适配器**：非 OK 分支同时解析扁平形态（顶层的 `type`/`message`），把这些字段纳入分类 detail，并在扁平 `type` 为 `exceed_context_size_error` 或共享分类器 `isContextWindowExceededError` 命中 detail 时，以 `CONTEXT_WINDOW_EXCEEDED_CODE` 抛出，让压缩恢复（压缩 → 重试）触发。

## 已否决的替代方案

- **在请求中传 `n_ctx` 抬高 API 限制** —— 否决：该 API 不存在此参数；窗口是账号侧强制的。
- **只修恢复逻辑，保留 1M 窗口** —— 否决：压力路径是主安全网；只靠恢复每次溢出都烧掉一个失败请求，且 UI 百分比持续说谎。
- **只修窗口，跳过错误分类** —— 否决：未来任何溢出（例如单个超大的工具结果）仍会杀死本轮而不是压缩。

## 后果

- 上下文计量显示真实占用；压力压缩在 API 上限之前启动。
- 溢出现在自动压缩并重试（按配置的重试次数），而不是让本轮失败。
- 扁平体解析也让非溢出的 400 显示提供商自己的 `message` 文本，而不是原始 JSON 体。
