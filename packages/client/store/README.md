---
description: "Observable browser state stores with explicit snapshots, subscriptions, and lifecycle ownership."
kind: "package-library"
---
# @deepseek-ai/dsh-client-store

English | [中文](README.zh.md)

## Summary

React-free observable and snapshot-store primitives shared by Client controllers and renderer adapters. The package owns synchronous and animation-frame publication, Immer-backed updates, shallow equality, and optional browser persistence; React hook construction remains in `@deepseek-ai/dsh-client-ui-renderer`. Use it when Client state must publish stable snapshots without depending on React.

## Table of Contents

- [Remote Mirrors](#remote-mirrors)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="remote-mirrors"></a>
## Remote Mirrors

`RemoteMirrorController` (exported from `./remote-mirror`) is the shared skeleton for Client panels that mirror a Host-owned list through a generated Remote face. It owns the cold/loading/ready/error snapshot lifecycle, the read-once `ensure`, a `resync` that keeps the last good list on failure, and a verb wrapper that maps transport and business failures to display text before converging from the Host. Panel packages subclass it with their Remote face and list payload, then implement `read` and `applyReady`; divergent verbs (for example a review decision that publishes its own error field) stay in the subclass.

<a id="model-experience"></a>
## Model Experience

None, as this package provides browser-side state primitives and registers nothing model-facing.

#### KV Cache effect

None; the stores neither assemble nor send model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Persistence is browser-local** — persisted stores use JSON in `localStorage`; non-browser runtimes disable persistence, and the package provides no cross-device synchronization.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package exports a library engine and creates no process-global state; each store instance is covered by its owning tests.
