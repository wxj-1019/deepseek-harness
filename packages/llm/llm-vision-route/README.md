# `@deepseek-ai/dsh-llm-vision-route`

English | [中文](README.zh.md)

Function plugin that routes image-bearing requests to a deployment-configured vision model through the agent loop's `agent/pre-step` and `agent/request` waterfalls. It does not wrap `ctx.llm.stream()` and never mutates messages: the loop logs the effective provider/model in `request/header` and each `assistant/message` source, so routing stays reconstructable from the session log.

The configuration is the `vision-model` settings namespace (`provider` + `model`), edited by the Web UI's Vision model page (`@deepseek-ai/dsh-client-ui-settings-vision-model`). While unconfigured, the plugin is inert and image-bearing requests keep the existing refusal behavior (`MODEL_DOES_NOT_SUPPORT_IMAGES`).

Once configured, the first turn whose step messages carry an image block routes the request to the vision model — the plugin resolves the exact route through `ctx.llm` and refuses to route to a model that does not declare image input, keeping the session model otherwise. The session then stays on the vision model: the session history now contains the image, and a text-only adapter rejects any later request over that history (`UNSUPPORTED_CONTENT`), the same invariant as the `selectModel` guard ("session already contains images"). A session model that already declares image input needs no routing; a fresh session without images starts on its own model.

```yaml
- name: '@deepseek-ai/dsh-llm-vision-route'
```

```yaml
vision-model:
  provider: qwen-dashscope
  model: qwen3-vl-plus
```

The host image preflight (`dsh-host-apiproxy`'s prompt admission) and the `read_image` tool gate consult the `visionRoute` service this plugin provides (declared as an optional slot by `@deepseek-ai/dsh-llm`): with a configured image-capable vision route, an image-bearing prompt is accepted and rerouted instead of refused, and a `read_image` call on a text-only route is allowed to proceed because its image result enters a step the routing waterfall sends to the vision model.

The separately published `./invariant` companion is intentionally empty: routing owns no durable event relationship — the loop logs every effective provider/model through channels the agent package validates.

## Model Experience

### Vision-route request switching

#### What the model sees

The request's provider/model change on a routed turn; the conversation content is untouched. The session's logged `request/header` and each `assistant/message` source record the vision model, so the UI's model seat follows the routed session.

#### Token effect

A routed session bills its requests to the vision provider from the first image-bearing turn onward. Text-only sessions are unaffected.

#### KV Cache effect

Routed requests preserve the conversation prefix and are eligible for provider cache reuse under the vision provider's rules; the routed provider/model change may split the cache identity at the first image turn.

## Known Limitations and Deferred Work

- **Routing is session-persistent after the first image** — a later request always carries the image in its message history, so a text-only session model cannot serve the session again; switch the session to an image-capable model instead.
- **The vision route is one provider/model pair** — the Web UI page lists image-capable models from the live catalog; there is no per-session vision override.
- **Capability is a declaration, not a probe** — a model that declares image input but whose endpoint refuses images fails at the adapter boundary, matching the general pi-ai contract.
