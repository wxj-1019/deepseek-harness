# Agent Note: Remove the vision-model settings page

Status: implemented

English | [中文](2026-08-27-remove-vision-model-settings-page.zh.md)

## Problem

The web Settings page (`@deepseek-ai/dsh-client-ui-settings-vision-model`) was the only editor of the `vision-model` settings namespace: one image-capable provider/model pair that `dsh-llm-vision-route` reroutes image-bearing requests to. The deployment stopped routing image requests through a separate vision model, so the page would hold permanent unconfigured state in the Settings nav — while the routing plugin reads its namespace straight from the settings document and never needed a browser surface to exist.

## Decision

`@deepseek-ai/dsh-client-ui-settings-vision-model` is removed from the repo and from the web-app bundle patch; the Settings nav renders only the remaining shipped sections. The `vision-model` namespace keeps its owner (`dsh-llm-vision-route`, still mounted by the base bundle) and is configured directly in `$DSH_HOME/settings.yaml`. Routing behavior and its prompt-preflight / `read_image` consumers are unchanged; the web e2e journey now writes the namespace host-side instead of through the page ([vision-model routing](../feature/2026-08-17-vision-model-routing.md)).

## Alternatives considered

- **Keep the page behind a bundle or per-deployment toggle.** Lost: composition already selects surfaces by editing the bundle patch file, so a runtime toggle adds a knob whose only job is hiding dead UI.
- **Remove the whole routing feature (`dsh-llm-vision-route`).** Lost: the requested scope was the configuration surface. Routing stays a working composable capability with its own unit and replay coverage; deleting it would also rewrite the preflight/`read_image` gate seams for no stated need. If routing itself ever goes, this note marks what a full removal must additionally cover.

## Consequences

- Configuring the vision route now means hand-editing yaml; nothing filters text-only models out at edit time. A route naming a model without declared image input fails at the adapter boundary exactly as before.
- One fewer client package, bundle dependency row, and Settings section; the regenerated slot catalog and refreshed Settings-nav goldens pin five sections where there were six.
- Reintroducing an editor is additive again: any client package can register a `settings.section` occupant over the unchanged namespace.
