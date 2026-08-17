# `@deepseek-ai/dsh-client-ui-settings-vision-model`

English | [中文](README.zh.md)

Browser plugin that registers the **Vision model** settings page: one provider/model pair that routes image-bearing requests, over the `vision-model` settings namespace and the session-free model catalog (`llm.models`). The page lists only models whose declared modalities include image input; a model entered by hand without a declaration stays invisible here, exactly as the routing gate treats it (text-only until it says otherwise). Writes land as minimal `settings.mutate` path operations with the namespace revision, so a concurrent edit fails loud instead of silently overwriting.

The page loads on open and refreshes on pushed invalidations (settings or provider-topology changes). While unconfigured it explains the routing behavior; the configured state shows the stored route and a Clear action that restores the empty composition base.

The host half is `@deepseek-ai/dsh-llm-vision-route`; this page only edits the namespace it owns.

## Model Experience

None, as the page renders a browser configuration UI; the routing it configures is owned by `@deepseek-ai/dsh-llm-vision-route`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One route, not a list** — the page holds a single provider/model pair; per-session vision overrides are out of scope.
- **Catalog advisory** — models come from the live `llm.models` catalog; a route that stops advertising a model keeps working but disappears from the page.
