# @deepseek-ai/dsh-client-ui-aqua

English | [中文](README.zh.md)

Aqua theme plugin: the leading glass visual system for the Web surface. Absorbed from the third-party [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) v1.3.0 (MIT, © upstream authors; `LICENSE` kept in this package) and rewired onto the harness's durable seams. Mica (frosted floating cards) and compatibility (stock layout, generic glass material) modes; adjustable blur, frost, and background brightness; a WebGL fluid backdrop or a custom wallpaper — image or video — served from the attachments store through `/backgrounds` (POST admission with the same-origin fence, GET with ETag revalidation and video byte ranges). Every knob and the master switch persist in the `ui-aqua` settings namespace, so preferences and wallpapers survive browser storage resets and follow the account; a boot `tapIndex` transform paints the glass tokens before the client tree activates. Cross-tab flips arrive as settings invalidations; a one-shot migration adopts the absorbed upstream's localStorage knobs (uploading its data-URL wallpaper) on first run.

Rendering is effect-only: token overrides ride the theme service's override stack (`overrideTokens`), the stylesheet keys off a `data-dsh-aqua` attribute on `<html>`, and the ambient scene mounts with the layer — switching the master switch off restores the stock UI exactly. The Space Grotesk variable font is self-hosted inline (no shell dependency).

## Model Experience

None, as the service manages a browser preference; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Video admission proves container well-formedness (magic bytes), not codec decodability; a stored video may still fail to play in a client.
- Replaced wallpapers are not garbage-collected; orphaned store objects accumulate, bounded by the upload size cap.
- The absorbed rendering engines keep their unguarded array indexing: the package compiles with `noUncheckedIndexedAccess` off locally, and the host-faced tsconfig (the host half owns the route, the settings namespace, and the boot tap) adds the client overrides — jsx and DOM lib — on top of the base host config.
- The absorbed stylesheet addresses stock surfaces through `[class*=…]` substring selectors and a seam-stamping MutationObserver; renames in sibling packages can require follow-ups here.
