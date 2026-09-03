---
description: "Component library settings card for browser operators: learned component count, search, and model-record review over the component_library domain's Remote face."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-component-library

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-component-library` renders the component library card in the Plugins settings section's configurable tab: the learned-component count, a search box over the loaded records, and the approve/discard review controls that keep hallucinated model-contributed records out of the durable set. The card reads through `@deepseek-ai/dsh-component-library`'s Remote face, loads lazily on first render, and converges on the pushed `component-library/changed` event and on connection resets. Compose it together with the Host package; alone it renders nothing.

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

The card appears in the Plugins settings tab only while the Host serves the `component-library` settings namespace. It loads the record list on first render, refreshes silently on every Host-side committed change, filters rows client-side by name, package, or jsdoc keyword, and shows approve/discard buttons on unreviewed model-contributed rows.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half follows the settings-card convention: a slot registration on `settings.plugin.item` keyed `component-library`, a controller-owned snapshot store injected through the `hooks` compartment, and copy routed through the package's bilingual locale dictionary.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin: locale registration, pushed-invalidation subscriptions, slot registration |
| [`src/client/controller.ts`](src/client/controller.ts) | Remote-face projection: lazy list read, review writes, client-side filter |
| [`src/client/ComponentLibraryCard.tsx`](src/client/ComponentLibraryCard.tsx) | Card component: summary count, search box, record rows, review controls |
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

- **Search is client-side substring filtering** — the card filters the already-loaded list and never re-queries the Host; the ranked `query` Remote method serves the model tool, not this panel.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above and the linked design document.

#### Future: conversation view promotion

The design document sketches promoting the library to a `conversation.view` browsing tab modeled on the Git commit-rail view; the settings card remains the review surface either way.

</details>
