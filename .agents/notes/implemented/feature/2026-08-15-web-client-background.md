# Agent Note: User-configurable background for the Web client

Status: implemented

English | [中文](2026-08-15-web-client-background.zh.md)

## Problem

The Web client renders one flat page background: `body` and the AppFrame root both paint `--dsw-alias-bg-base` (`packages/client/web/src/base.css`, `packages/client/ui-layout/src/client/AppFrame.module.css`), and no wallpaper or background concept exists anywhere in the client. The theme plugin owns the color-scheme preference (light/dark/system), but nothing lets a user personalize the space behind the conversation.

A long-lived chat workspace is a reasonable place for a personal background: the user picks an image or a built-in gradient, the client renders it behind the conversation area with a readability scrim, and the choice survives reload. The durable-preferences path already exists (`settingsScope` → settings RPC → `$DSH_HOME/settings.yaml`), so the missing pieces are a background preference, an upload path for the image bytes, and a rendering surface in the layout.

## Decision

Amended while planning and implementing: `/backgrounds/current` with ETag revalidation instead of `GET /backgrounds/<id>`; the presenter lives in `ui-background`; upload admission reuses `ctx.attachments.imageLimits`; both route methods carry the full `/api` trust fence; HEAD answers the current-image route; explicit-null image handling hardens the route; the section's availability probe was inverted during implementation and is fixed.

The `ui-background` client plugin — new package `packages/client/ui-background` (`@deepseek-ai/dsh-client-ui-background`) — mirrors `ui-theme`'s two-half layout and owns the whole feature:

- a durable settings namespace `ui-background` (schema below), persisted through the existing settings capability;
- an upload route: `/backgrounds` — POST stores one image through the existing `attachments` content-addressed store and answers its reference, and `GET /backgrounds/current` serves the current image — so settings hold a content-addressed reference, never image bytes;
- a `ctx.background` client service with a `background/change` event; `ui-layout` gains inert backdrop and scrim layers in AppFrame but never consumes the service;
- a boot-time index transform mirroring `injectBootTheme`, so the background is present on first paint with no flash;
- a Background settings section with preset thumbnails, image upload, and a dimming slider.

The scope is `none` / built-in presets / one uploaded image. URL-pasted images, per-workspace backgrounds, animated backgrounds, sidebar translucency, and garbage-collecting replaced images are out of scope.

## Settings model

Namespace `ui-background`, flat fields like `ui-theme` with one discriminant to switch on:

```ts ignore-check
interface BackgroundSettings {
  /** Active background kind. */
  preference: 'none' | 'preset' | 'image'
  /** Preset id; read only while the preference is `preset`. */
  preset?: string
  /** Stored-image reference; read only while the preference is `image`. An explicit `null` counts as missing. */
  image?: BackgroundImageRef
  /** Scrim strength over the background, 0-90 percent. */
  dimming: number
}
```

The schemastery schema resolves the defaults (`none`, dimming 45) and validates every write at the settings boundary; the union-wrapped `image` member carries no default, so an absent image survives resolution as undefined, and a hand-edited explicit `null` resolves to null — which both the route and resolution treat as missing. The runtime setters (`setNone`/`setPreset`/`setImage`/`setDimming`) each validate before the scope write (`setPreset` throws on an unregistered id) and emit `background/change`; continuous sync goes through settings-scope adoption. Consumers switch on `preference` through `resolveBackdrop`, with `assertNever` on the default per the closed-union convention. Presets are a fixed exported registry (`aurora`/`dusk`/`mist`): `id` and `{ light, dark }` CSS `background-image` values with both modes mandatory, matching the theme override convention; labels come from the `settings.background` locale keys (`preset.<id>`). `dimming` defaults to 45.

## Storage and upload route

The Host half reuses the existing attachment store (`ctx.attachments` `saveImage`/`readImage`; objects land content-addressed) instead of owning a second store, and registers one webServer prefix route `/backgrounds`, the same pattern as the client-modules `/plugins` route. The route exists only while the webServer, attachments, and settings services all compose; a composition without them fails the load rather than degrading the route.

- `POST /backgrounds` — raw image body with the media type in `Content-Type`. Admission reuses `ctx.attachments.imageLimits`, so the same deployment policy that governs chat images sets both the accepted media types and the byte cap. A declared content-length over the cap refuses (413) before any body is read; a chunked body is capped while streaming. `saveImage` validates the bytes and answers the stored reference `{ attachmentId, mediaType, bytes, width, height }`. Failures — oversize, unsupported media type, store rejection — map to 4xx and surface as visible errors in the section UI.
- `GET /backgrounds/current` — serves the current stored image; `HEAD` answers the same route (the section's dangling-reference probe). The handler reads the `ui-background` section through `settings.get` and treats an absent or explicit-null image reference as 404 (`== null` presence, so a hand-edited settings document cannot crash the route). The response carries the stored media type, an ETag with the content address, and `cache-control: no-cache`: a switch paints the new image immediately, while an unchanged reload revalidates to 304 on an exact single-ETag `if-none-match` match. A reference whose store object is gone answers 404.

The route registration goes through `ctx.effect` (the returned disposer removes it). Upload and read authorization is the full `/api` browser-trust fence via the `@deepseek-ai/dsh-client-connection/trust` subpath — the same Host/Origin/Fetch-Metadata checks `isTrustedApiRequest` applies to `/api`, on both methods, so a rebound DNS name, a cross-site marker, or a foreign Origin cannot write or read backgrounds. The host row's `trustedHosts` config mirrors the connection row's list (a composition derives it the same way); each entry is validated at load, and absent means loopback-only, the safe standalone default.

## Rendering pipeline

Three body-level CSS variables are the single mechanism; the boot transform and the runtime presenter only set variables, and the stylesheet consumes them with inert defaults:

- `--dsw-specific-backdrop-image` — `url(...)` for stored images, or the preset's gradient; unset means none.
- `--dsw-specific-backdrop-scrim` — `color-mix(in srgb, var(--dsw-alias-bg-base) <dimming>%, transparent)`; resolving against the live token makes the scrim follow light/dark automatically.
- `--dsw-specific-backdrop-surface` — `transparent` while a background is active; unset otherwise.

`ui-layout` renders two inert layers at the bottom of the AppFrame stacking order (`position: absolute; inset: 0; pointer-events: none`, z-index −2 image and −1 scrim) and switches the AppFrame root and boot-page paints to `background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))`. Component fills — cards, bubbles, menus — keep their own tokens and stay opaque; the sidebar keeps its solid fill. `ui-layout` never consumes the background service — it has no dependency on the package at all — so the layout works unchanged without the plugin.

The Host half's `tapIndex` transform mirrors `injectBootTheme`: it reads the `ui-background` section host-side through `settings.get` (defaulting when no settings provider composes) and inserts a small `<style>` before `</head>` setting the three variables, so a reload shows the background on first paint. `backdropVarsCss` is the single source both callers share. At runtime `BackgroundPresenter` — in `ui-background`, owning one style element in head, disposed with the plugin fiber — sets the same variables from `ctx.background` snapshots; presets ship both palette modes as one `body` + `body[data-ds-dark-theme]` rule pair, so no theme subscription or `theme/change` re-apply is needed, and `none`/invalid sections retract the element so the inert defaults take over.

## Settings UI

A `settings.section` (id `background`, order 5, label zh 背景 / en Background) registered by the plugin's client half — the feature owns its settings surface. The section holds preference cards (none / presets / image), preset thumbnails rendered from the registry's CSS values as a split swatch of both palette modes, an upload control (file picker → `ctx.background.uploadImage(file)` → auto-select), the current image preview with a remove action, and the dimming slider. An invalid backdrop (unknown preset id, missing image reference) renders an error banner; a HEAD probe against `/backgrounds/current` drives the dangling-image error row. Locale strings register through `ctx.locale.register` zh/en like every other client plugin.

## Failure behavior

- Invalid settings — unknown preset id, dangling image reference, malformed pairing — fail loud: the schema rejects writes at the settings boundary and `resolveBackdrop` surfaces an `invalid` verdict, which the section renders as an error banner while the presenter retracts the variables so the inert defaults take over, instead of silently falling back.
- Upload failures surface in the section; nothing reaches settings unless the store accepted the bytes.
- A stored image that no longer resolves (store pruned by hand) paints no image — the route 404s — and shows an error state in the section, not a broken page.

## Testing

The package suite mirrors `ui-theme`'s: client apply wiring (service provision, section slot registration, settings sync), section component behavior in jsdom (preference switching, upload with stubbed fetch, dimming), boot injection via `node:vm` across each preference, host apply (namespace registration and disposal, route handlers with stubbed `attachments`/`webServer`, index transform), runtime service (snapshots, validation, revision guard), settings store, and a CSS contract test asserting AppFrame consumes the three variables with fallbacks. The product-user-visible surface ships a keyless `background-settings` snapshot in the web app's snapshot suite; `test:coverage` stays per-file 100% for the package.

## Alternatives considered

- **Extend `ui-theme` instead of a new package.** The theme service owns color-scheme tokens; upload routing, durable storage, and a picker section are not theme concerns, and folding them in bloats a focused plugin. Rejected.
- **Store image bytes in settings (data URL).** `settings.yaml` is a small revision-guarded config document; multi-megabyte base64 values make every write and review noisy. Rejected in favor of opaque ids plus a byte route.
- **A new typert RPC method for upload.** The `/api` typert surface would grow for one binary POST. The webServer prefix route mirrors the existing `/plugins` route and adds no protocol surface. Rejected the RPC form.
- **A dedicated `$DSH_HOME/backgrounds` store.** The attachment store already provides validated, content-addressed, durable image storage; reusing it deletes owned code and tests. Rejected the second store.

## Consequences

- The durable preference survives reload with no flash: the boot transform paints the section on first paint and the presenter re-owns the same variables after activation, both through one `backdropVarsCss` source.
- The three-variable contract keeps `ui-layout` correct without the plugin — it renders the inert layers and never consumes the background service.
- Upload admission reuses `ctx.attachments.imageLimits`, so one deployment policy governs chat images and backgrounds, and settings hold only the content-addressed reference.
- Both `/backgrounds` methods carry the full `/api` trust fence, resolving the second-write-surface risk with parity rather than a separate threat model.
- Replaced images are not garbage-collected; orphaned store objects accumulate, bounded by the upload size cap. GC is a follow-up on the store seam.
- Readability over busy images rests on one scalar scrim; there is no per-region or auto-contrast adaptation. If it proves insufficient, the follow-up is per-area translucency, not more scalars.
- The boot transform reads settings while the index HTML is rendered; a settings write racing a reload can show the previous background once — the same window `ui-theme`'s boot injection already accepts.
