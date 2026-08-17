# `@deepseek-ai/dsh-llm-vision-route`

[English](README.md) | 中文

功能插件：通过 agent 循环的 `agent/pre-step` 与 `agent/request` 瀑布，把携带图片的请求路由到部署配置的识图模型。它不包装 `ctx.llm.stream()`，也从不修改消息：循环在 `request/header` 和每条 `assistant/message` 的 source 中记录实际生效的 provider/model，因此路由始终可从会话日志重建。

配置位于 `vision-model` 设置命名空间（`provider` + `model`），由 Web UI 的"识图模型"页面（`@deepseek-ai/dsh-client-ui-settings-vision-model`）编辑。未配置时插件保持惰性，携带图片的请求维持原有的拒绝行为（`MODEL_DOES_NOT_SUPPORT_IMAGES`）。

配置后，第一个步骤消息携带图片块的回合会把请求路由到识图模型——插件通过 `ctx.llm` 解析精确路由，拒绝路由到未声明图片输入的模型，其余情况保持会话模型不变。会话随后停留在识图模型上：会话历史已包含图片，纯文本适配器会拒绝基于该历史的后续请求（`UNSUPPORTED_CONTENT`），这与 `selectModel` 的既有护栏（"会话已包含图片"）是同一不变量。会话模型本身已声明图片输入时无需路由；不含图片的新会话仍从自身模型开始。

```yaml
- name: '@deepseek-ai/dsh-llm-vision-route'
```

```yaml
vision-model:
  provider: qwen-dashscope
  model: qwen3-vl-plus
```

宿主图片预检（`dsh-host-apiproxy` 的 prompt 准入）与 `read_image` 工具门禁都会咨询本插件提供的 `visionRoute` 服务（由 `@deepseek-ai/dsh-llm` 声明为可选槽位）：配置了可用识图路由时，携带图片的 prompt 会被接受并重路由而非拒绝；纯文本路由上的 `read_image` 调用也被允许继续，因为其图片结果会进入路由瀑布送往识图模型的步骤。

单独发布的 `./invariant` 伴生插件刻意保持为空：路由不拥有任何持久事件关系——循环通过 agent 包校验的通道记录每次生效的 provider/model。

## 模型体验

### 识图路由的请求切换

#### 模型看到什么

被路由的回合中，请求的 provider/model 发生变化；对话内容保持不变。会话的已记录 `request/header` 与每条 `assistant/message` 的 source 都记录识图模型，因此 UI 的模型席位会跟随被路由的会话。

#### Token 影响

被路由的会话从第一个携带图片的回合起，请求都计入识图提供方。纯文本会话不受影响。

#### KV 缓存影响

被路由的请求保留对话前缀，在识图提供方的规则下可复用其缓存；路由的 provider/model 变化可能在首个图片回合处拆分缓存身份。

## 已知限制与待办

- **首个图片之后路由为会话级持久**——后续请求的消息历史始终携带该图片，纯文本会话模型无法再次服务该会话；请将会话切换到支持图片的模型。
- **识图路由是单个 provider/model 对**——Web UI 页面从实时目录列出支持图片的模型；没有按会话的识图覆盖。
- **能力是声明而非探测**——声明支持图片但端点拒绝图片的模型会在适配器边界失败，与 pi-ai 的通用契约一致。
