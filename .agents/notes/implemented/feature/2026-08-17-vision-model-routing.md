# Agent Note: Vision-model routing for image-bearing requests

Status: implemented

English | [中文](2026-08-17-vision-model-routing.zh.md)

## Problem

A text-only session model (the DeepSeek route declares `inputModalities: ['text']`) refuses every image-bearing request at the host preflight, so image understanding required manually switching the session to an image-capable model and back. There was no deployment-level setting naming a vision model, and no automatic routing: attaching an image was an all-or-nothing manual model change.

## Decision

A new `@deepseek-ai/dsh-llm-vision-route` plugin owns a `vision-model` settings namespace (`provider` + `model`, empty = off) and routes the first image-bearing turn to the configured vision model through the agent loop's `agent/pre-step` + `agent/request` waterfalls. Routing never mutates messages; the loop logs the effective provider/model in `request/header` and every `assistant/message` source, preserving the model-visible ⟺ logged rule. The host prompt preflight and the `read_image` tool gate consult the plugin's `visionRoute` service (an optional slot declared by `dsh-llm`) so image-bearing requests are accepted and rerouted instead of refused. The namespace is edited directly in the settings document (`$DSH_HOME/settings.yaml`); until its removal the editor was a dedicated client page listing only models whose declared modalities include image input (see [remove-vision-model-settings-page](../simplification/2026-08-27-remove-vision-model-settings-page.md); the wire catalog's optional `inputModalities` field through the zod response schema stays). The plugin is mounted in the base bundle (the LLM stack layer) so every surface benefits.

Routing is session-persistent after the first image: the session history then carries the image forever, and a text-only adapter rejects any later request over that history (`UNSUPPORTED_CONTENT`) — the same invariant as the existing `selectModel` guard ("session already contains images"). Switching back was implemented and rejected during development when the real adapter proved it (see Alternatives).

## Alternatives considered

- **Route back to the session model on text-only turns.** Implemented first: the plugin remembered the session model and re-applied it on later text turns. The real DeepSeek adapter then rejected the turn with `UNSUPPORTED_CONTENT` because the request's message history still contained the earlier image. The route-back was removed; session-persistence is the only behavior a text-only session model can serve.
- **Strip images from later requests.** The `agent/request` waterfall cannot mutate messages, and dropping the image from the wire while it stays in the log would break the model-visible ⟺ logged rule.
- **Compaction as the reset mechanism.** Compacting the image out of history could restore a text-only model, but compaction is content-aware and out of scope for routing; noted as future work.
- **Route through the UI-selected session model instead of a deployment setting.** The user's requirement was a deployment-level setting changeable in Settings, not a per-session manual switch; at decision time the deployment editor was the Settings page.

## Consequences

- Image-bearing sessions move to the vision provider from the first image turn onward; text-only sessions are unaffected.
- The `visionRoute` service slot lives in `dsh-llm` so `tool-fs` (read-image gate) and `dsh-host-apiproxy` (preflight) can consult it without depending on the routing package.
- The wire model catalog carries `inputModalities` (optional), so capability-filtered pickers are possible; absent declarations stay text-only, matching the existing rule.
- The vision-route package publishes an intentionally empty `./invariant` companion: routing owns no durable event relationship.
- A session whose vision model is later unconfigured keeps its routed header; only new sessions observe the change.

## Testing

- Unit (`packages/llm/llm-vision-route/tests/vision-route.spec.ts`, agent-loop testkit + scripted adapter): unconfigured inertness, image-turn routing, session persistence, session-model-already-vision no-op, misconfigured non-vision route no-op, multi-step same-turn routing.
- Unit (`packages/fs/tool-fs/tests/read-image.spec.ts`): the gate defers when a configured vision route resolves images and keeps refusing when it does not.
- Web e2e (`apps/web/tests/vision-route.e2e.ts`, keyless replay): the journey writes the `vision-model` namespace host-side in setup, then an image-bearing prompt routes to the vision model and the session stays there, recorded against the real DashScope qwen3-vl-plus route and replayed without keys.
