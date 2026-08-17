# Agent Note: 携带图片请求的识图模型路由

Status: implemented

[English](2026-08-17-vision-model-routing.md) | 中文

## Problem

纯文本会话模型（DeepSeek 路由声明 `inputModalities: ['text']`）会在宿主预检处拒绝一切携带图片的请求，因此理解图片需要手动把会话切换到支持图片的模型再切回来。此前没有命名识图模型的部署级设置，也没有自动路由：附加图片是一次全有或全无的手动换模型操作。

## Decision

新的 `@deepseek-ai/dsh-llm-vision-route` 插件拥有 `vision-model` 设置命名空间（`provider` + `model`，空 = 关闭），并通过 agent 循环的 `agent/pre-step` + `agent/request` 瀑布把第一个携带图片的回合路由到配置的识图模型。路由从不修改消息；循环在 `request/header` 与每条 `assistant/message` 的 source 中记录生效的 provider/model，保持"模型可见 ⟺ 已记录"规则。宿主 prompt 预检与 `read_image` 工具门禁咨询该插件提供的 `visionRoute` 服务（由 `dsh-llm` 声明的可选槽位），使携带图片的请求被接受并重路由而非拒绝。新的 `@deepseek-ai/dsh-client-ui-settings-vision-model` 页面编辑该命名空间，只列出声明了图片输入模态的模型（wire 目录通过 zod 响应 schema 增加了可选 `inputModalities` 字段）。插件挂载在 base bundle（LLM 栈层）使所有表面受益；设置页挂载在 web-app bundle。

首个图片之后路由为会话级持久：会话历史此后永远携带该图片，纯文本适配器会拒绝基于该历史的后续请求（`UNSUPPORTED_CONTENT`）——与既有 `selectModel` 护栏（"会话已包含图片"）是同一不变量。开发期间曾实现并否决了切回逻辑（见 Alternatives）。

## Alternatives considered

- **纯文本回合切回会话模型。** 先实现：插件记住会话模型并在后续文本回合重新应用。真实 DeepSeek 适配器随即以 `UNSUPPORTED_CONTENT` 拒绝该回合，因为请求的消息历史仍包含早先的图片。切回被移除；会话持久是纯文本会话模型唯一可服务的行为。
- **从后续请求剥离图片。** `agent/request` 瀑布不能修改消息，且从 wire 丢弃图片而日志保留会破坏"模型可见 ⟺ 已记录"规则。
- **以压缩作为重置机制。** 把图片压缩出历史可恢复纯文本模型，但压缩与内容相关且超出路由范围；记为后续工作。
- **通过 UI 选择的会话模型路由而非部署设置。** 用户需求是可在设置中修改的部署级设置，而非按会话手动切换；设置页是产品表面。

## Consequences

- 携带图片的会话从首个图片回合起迁移到识图提供方；纯文本会话不受影响。
- `visionRoute` 服务槽位于 `dsh-llm`，使 `tool-fs`（read-image 门禁）与 `dsh-host-apiproxy`（预检）无需依赖路由包即可咨询。
- wire 模型目录携带可选的 `inputModalities`，能力过滤的选择器成为可能；未声明的保持纯文本，与既有规则一致。
- vision-route 包发布刻意为空的 `./invariant` 伴生插件：路由不拥有任何持久事件关系。
- 识图模型随后被取消配置的会话保留其已路由 header；只有新会话观察到变化。

## Testing

- 单元（`packages/llm/llm-vision-route/tests/vision-route.spec.ts`，agent-loop 测试套件 + 脚本适配器）：未配置惰性、图片回合路由、会话持久、会话模型已支持图片时不操作、配置非识图模型时不操作、同一回合多步骤路由。
- 单元（`packages/fs/tool-fs/tests/read-image.spec.ts`）：配置的识图路由可解析图片时门禁放行，不能时继续拒绝。
- Web e2e（`apps/web/tests/vision-route.e2e.ts`，无 key 回放）：设置页配置识图模型（aria golden），携带图片的 prompt 路由到识图模型且会话保持，针对真实 DashScope qwen3-vl-plus 路由录制并无 key 回放。
