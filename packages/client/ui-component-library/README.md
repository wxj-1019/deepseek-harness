---
description: "Component library conversation-view gallery for browser operators: a searchable Components tab over the component_library domain's Remote face, with per-component contracts and live-preview stories."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-component-library

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-component-library` renders the **Components** conversation-view gallery over the learned library — a react-bits-style browsing tab with a searchable component list and a per-component contract pane (props table, raw props fallback, `--dsw-*` token chips, and the captured usage example). When a component has a story under its package's `tests/stories/`, the pane also mounts a live preview of the real component. The gallery reads through `@deepseek-ai/dsh-component-library`'s Remote face, loads lazily on first render, and converges on the pushed `component-library/changed` event and on connection resets. Compose it together with the Host package; alone it renders nothing.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose this package into the web client when the Host row `component-library` is present. The official web bundle already carries both rows.

### Observable behavior

The gallery appears as the **Components** tab in the conversation view. It loads the record list on first render, refreshes silently on every Host-side committed change, and filters rows client-side by name, package, or jsdoc keyword.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half follows the conversation-view convention: a slot registration on `conversation.view` ordered beside the Git rail, a controller-owned snapshot store injected through the `hooks` compartment, and copy routed through the package's bilingual locale dictionary.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin: locale registration, pushed-invalidation subscriptions, slot registration |
| [`src/client/controller.ts`](src/client/controller.ts) | Remote-face projection: lazy list read, review writes, client-side filter |
| [`src/client/ComponentLibraryGallery.tsx`](src/client/ComponentLibraryGallery.tsx) | Gallery tab: searchable component list and the per-component contract pane |
| [`src/client/locales.ts`](src/client/locales.ts) | The bilingual copy dictionary and its LocaleNamespaceMap merge |
| [`src/index.ts`](src/index.ts) | Host half (no registrations; the domain is owned by the Host package) |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion (no runtime invariant: write ordering is checked Host-side) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Component library plugin design](../../../docs/component-library-plugin.md) — the design document this panel implements.
- [Component library Host package](../../storage/component-library/README.md) — the domain owner, scanner, and model tools behind this card.
- [Client package map](../README.md) — the family's packages and their repository position.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders user-owned library data for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits are current package constraints, not a task backlog.

- **Search is client-side substring filtering** — the gallery filters the already-loaded list and never re-queries the Host; the ranked `query` Remote method serves the model tool, not this panel.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the linked design document.

#### Review surface

The design document originally sketched a settings card as the model-record review surface; the conversation-view gallery is the shipped surface, and model-record review flows through the model tools and the Host-side quarantine.

</details>
