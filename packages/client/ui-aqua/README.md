---
description: "Aqua glass theme plugin for the dsh web client: mica/compat modes, blur and brightness knobs, WebGL fluid or wallpaper backdrop, and durable ui-aqua settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-aqua

English | [中文](README.zh.md)

## Summary

Aqua theme plugin: the leading glass visual system for the Web surface. Absorbed from the third-party [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) v1.3.0 (MIT, © upstream authors; `LICENSE` kept in this package) and rewired onto the harness's durable seams. Mica (frosted floating cards) and compatibility (stock layout, generic glass material) modes; adjustable blur, frost, and background brightness; a WebGL fluid backdrop or a custom wallpaper — image or video — served from the attachments store through `/backgrounds` (POST admission with the same-origin fence, GET with ETag revalidation and video byte ranges). Every knob and the master switch persist in the `ui-aqua` settings namespace, so preferences and wallpapers survive browser storage resets and follow the account; a boot `tapIndex` transform paints the glass tokens before the client tree activates. Cross-tab flips arrive as settings invalidations; a one-shot migration adopts the absorbed upstream's localStorage knobs (uploading its data-URL wallpaper) on first run.

Rendering is effect-only: token overrides ride the theme service's override stack (`overrideTokens`), the stylesheet keys off a `data-dsh-aqua` attribute on `<html>`, and the ambient scene mounts with the layer — switching the master switch off restores the stock UI exactly. The Space Grotesk variable font is self-hosted inline (no shell dependency).

## Table of Contents

- [Surfaces that opt in](#surfaces-that-opt-in)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="surfaces-that-opt-in"></a>
## Surfaces that opt in

Feature surfaces (drawers, panels) join the glass skin through two stable seams this layer styles wherever they appear: `data-dsh-glass-panel` on a floating card and `data-dsh-glass-tab` on an edge trigger. Both get the composer-card recipe — light/dark glass, frost multiplier, composer blur, hairline borders, inner highlight — and translucent row/input tints, so the wallpaper stays visible through them. Gated on `data-dsh-aqua` only (not float mode), so compat mode glasses too; off == stock. Current occupants: the daily-todo drawer and the notification-center panel.

-----

<a id="model-experience"></a>
## Model Experience

None, as the service manages a browser preference; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Video admission proves container well-formedness (magic bytes), not codec decodability; a stored video may still fail to play in a client.
- Replaced wallpapers are not garbage-collected; orphaned store objects accumulate, bounded by the upload size cap.
- The absorbed rendering engines keep their unguarded array indexing: the package compiles with `noUncheckedIndexedAccess` off locally, and the host-faced tsconfig (the host half owns the route, the settings namespace, and the boot tap) adds the client overrides — jsx and DOM lib — on top of the base host config.
- The absorbed stylesheet addresses stock surfaces through `[class*=…]` substring selectors and a seam-stamping MutationObserver; renames in sibling packages can require follow-ups here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Rendering is effect-only: switching the master switch off restores the stock UI exactly. The absorbed engines keep their local tsconfig overrides (noUncheckedIndexedAccess off) and their substring-selector stylesheet, so sibling-package renames can require follow-ups here.

</details>
