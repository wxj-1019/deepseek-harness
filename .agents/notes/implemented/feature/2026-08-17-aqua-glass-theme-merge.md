# Aqua glass theme merged onto the durable seams

English | [中文](2026-08-17-aqua-glass-theme-merge.zh.md)

- Date: 2026-08-17
- Status: implemented; replaces the first-cut background feature (see supersession in [2026-08-15-web-client-background](2026-08-15-web-client-background.md))
- Scope: `packages/client/ui-aqua`, `packages/attachment/*`, web-app composition

## What shipped

The third-party glass theme [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin) v1.3.0 (MIT) is absorbed as `packages/client/ui-aqua` and becomes the leading visual system; the first-cut `ui-background` package is retired. Aqua's browser-local persistence (localStorage knobs, IndexedDB wallpaper blobs, Chromium File System Access handles) is rewired onto the harness seams:

- Every knob and the master switch persist in the `ui-aqua` settings namespace (flat scalar fields, schemastery-validated with the shipped defaults; cross-tab flips arrive as settings invalidations).
- Wallpapers upload through `/backgrounds` (same-origin fence, image limits or the new video limits, ETag revalidation, single byte ranges for `<video>` seeking) into the attachments store and render from `/backgrounds/current?v=<attachmentId>` — no media bytes live in the browser.
- A boot `tapIndex` transform paints the mode's dual-palette token overrides and the `data-dsh-aqua`/mode attributes before the client tree activates, killing the glass flash on reload.
- A one-shot migration adopts the upstream's localStorage knobs on first run, uploading its data-URL wallpaper; unsupported legacy wallpaper markers fall back to the fluid backdrop.
- The theme layer becomes a pure applier over durable sections; the absorbed Chromium-only FSA/IndexedDB paths and two dead modules are dropped.

The attachments seam gains video admission for this: `saveVideo`/`readVideo`/`videoLimits` on `AttachmentStore` with container magic-byte sniffing (MP4 `ftyp`, WebM EBML, Ogg) and a configurable byte cap. Video refs carry no intrinsic dimensions — the store owns no demuxer, so admission proves a well-formed container, never a decodable stream.

## Why absorb rather than compose at runtime

The upstream plugin exposes no cordis service and keeps its state in browser-local storage, so a runtime bridge could only poke its DOM internals — a fragile coupling with no contract. Absorbing the source (upstream itself develops by copying into `packages/client/ui-aqua` of a harness checkout; peer deps match `0.1.0-rc.5`) gives the merge one owner, one persistence story, and the repo's own gates. Placement under `packages/client/` rather than `vendor/` follows vendor/'s stated Cordis-framework scope; provenance lives in the package README and LICENSE.

## Consequences

- The repo owns a permanent fork: upstream updates are adopted by hand, with v1.3.0 as the recorded baseline.
- The absorbed rendering engines (WebGL fluid, canvas whale/mesh, spotlight, seam stamper) keep upstream code under a package-local `noUncheckedIndexedAccess: false` exception and the repo-wide GUI-debt coverage exemption; the rewired persistence seams (host half, runtime, layer state machine, stores, components) carry full specs, and an e2e journey pins boot paint, durable mode flips, wallpaper upload/reload, and master-switch retraction.
- The absorbed stylesheet addresses stock surfaces through `[class*=…]` substring selectors and a seam-stamping MutationObserver; renames in sibling packages can require follow-ups here.
- Users of the retired `ui-background` namespace lose nothing but the preference itself: stored images survive in the content-addressed attachments store for re-selection under aqua.
