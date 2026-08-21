# 运行时诊断

[English](README.md) | 中文

DeepSeek Harness 的包级运行时诊断：不变量注册、健康断言和伴随插件所有权。该组下所有包仅暴露诊断服务，通过 `@deepseek-ai/dsh-invariants` 注册。

| 包 | 职责 |
|---|---|
| [`invariants/`](invariants/README.zh.md) | 不变量注册表服务：按包所有权保留、跨包健康断言和伴随插件接入 |
