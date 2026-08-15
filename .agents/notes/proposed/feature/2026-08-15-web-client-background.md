# Agent Note: User-configurable background for the Web client

Status: proposed

English | [中文](2026-08-15-web-client-background.zh.md)

## Problem

The Web client renders one flat page background: `body` and the AppFrame root both paint `--dsw-alias-bg-base` (`packages/client/web/src/base.css`, `packages/client/ui-layout/src/client/AppFrame.module.css`), and no wallpaper or background concept exists anywhere in the client. The theme plugin owns the color-scheme preference (light/dark/system), but nothing lets a user personalize the space behind the conversation.

A long-lived chat workspace is a reasonable place for a personal background: the user picks an image or a built-in gradient, the client renders it behind the conversation area with a readability scrim, and the choice survives reload. The durable-preferences path already exists (`settingsScope` → settings RPC → `$DSH_HOME/settings.yaml`), so the missing pieces are a background preference, an upload path for the image bytes, and a rendering surface in the layout.

## Proposal

Add a `ui-background` client plugin — new package `packages/client/ui-background` (`@deepseek-ai/dsh-client-ui-background`) — mirroring `ui-theme`'s two-half layout and owning the whole feature:

- a durable settings namespace `ui-background` (schema below), persisted through the existing settings capability;
- an upload path: a `/backgrounds` webServer route (POST stores one image through the existing `attachments` content-addressed store; GET streams stored bytes), so settings hold an opaque id, never image bytes;
- a `ctx.background` client service with a `background/change` event, consumed optionally by `ui-layout`, which gains inert backdrop and scrim layers in AppFrame;
- a boot-time index transform mirroring `injectBootTheme`, so the background is present on first paint with no flash;
- a Background settings section with preset thumbnails, image upload, and a dimming slider.

V1 scope is `none` / built-in presets / one uploaded image. URL-pasted images, per-workspace backgrounds, animated backgrounds, sidebar translucency, and garbage-collecting replaced images are out of scope (see Risks).

## Settings model

Namespace `ui-background`, flat fields like `ui-theme` with one discriminant to switch on:

```ts
interface BackgroundSettings {
  /** Discriminant for the active background kind. */
  preference: 'none' | 'preset' | 'image'
  /** Preset id; required and only read when preference is 'preset'. */
  preset?: string
  /** Stored-image reference; required and only read when preference is 'image'. */
  image?: { id: string; mediaType: string }
  /** Scrim strength over the background, 0–90 percent. */
  dimming?: number
}
```

`setBackground` validates the pairing — `preset` requires a registered preset id, `image` requires a complete reference — and rejects everything else; consumers switch on `preference` with `assertNever` on the default, per the closed-union convention. Presets are a fixed exported registry: `id`, localized label, and `{ light, dark }` CSS `background-image` values with both modes mandatory, matching the theme override convention. V1 ships three gradients. `dimming` defaults to 45; the default and the final preset set are open product decisions listed under Risks.

## Storage and upload route

The Host half reuses the existing attachment store (`ctx.attachments` `saveImage`/`readImage`; objects land content-addressed under `$DSH_HOME/attachments/v1`) instead of owning a second store, and registers one webServer prefix route `/backgrounds`, the same pattern as the client-modules `/plugins` route:

- `POST /backgrounds` — raw image body with the media type in `Content-Type`. The handler enforces the size cap (`maxImageBytes`, a validated plugin Config field, default 8 MiB — not a hardcoded tunable) through content-length plus a streaming guard, delegates validation to `saveImage`, and answers `{ id, mediaType }`. Failures — oversize, unsupported media type, absent `attachments` capability — map to 4xx/5xx and surface as visible errors in the section UI.
- `GET /backgrounds/<id>` — streams stored bytes with immutable cache headers. `id` must match `^[0-9a-f]{64}$` (the store's sha256 addressing); anything else is 404, so no host path is ever derived from request input.

The route registration goes through `ctx.effect` (the returned disposer removes it). Upload authorization applies whatever checks the existing `/api` POST surface applies; if that surface adds loopback-origin checks, `/backgrounds` applies the same ones — verify at implementation.

## Rendering pipeline

Three body-level CSS variables are the single mechanism; the boot transform and the runtime presenter only set variables, and the stylesheet consumes them with inert defaults:

- `--dsw-specific-backdrop-image` — `url(...)` for stored images, or the preset's gradient; unset means none.
- `--dsw-specific-backdrop-scrim` — `color-mix(in srgb, var(--dsw-alias-bg-base) <dimming>%, transparent)`; resolving against the live token makes the scrim follow light/dark automatically.
- `--dsw-specific-backdrop-surface` — `transparent` while a background is active; unset otherwise.

`ui-layout` renders two inert layers at the bottom of the AppFrame stacking order (`position: absolute; inset: 0; pointer-events: none`, z-index −2 image and −1 scrim) and switches the AppFrame root and boot-page paints to `background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))`. Component fills — cards, bubbles, menus — keep their own tokens and stay opaque in V1; the sidebar keeps its solid fill. `ui-layout` consumes the background service through the optional `ctx.inject(['background'], …)` form (`ui-theme`'s host half is the canonical optional-consumption example; the codebase has no `optional: true` injects), so the layout works unchanged without the plugin.

The Host half's `tapIndex` transform mirrors `injectBootTheme`: read the `ui-background` section host-side through `settings.get`, resolve the image id to `/backgrounds/<id>`, and splice a small `<style>` setting the three variables, so a reload shows the background on first paint. At runtime `BackgroundPresenter` — in `ui-layout`, next to `theme-presenter.ts` — sets the same variables from `ctx.background` snapshots and re-applies on `background/change` and `theme/change` (preset variants are per color scheme).

## Settings UI

A new `settings.section` (id `background`, order 5, label zh 背景 / en Background) registered by the plugin's client half, following `ui-agent-preset`'s full-section pattern. The section holds preference cards (none / presets / image), preset thumbnails rendered from the registry's CSS values, an upload control (file picker → `ctx.background.uploadImage(file)` → auto-select), the current image preview with a remove action, and the dimming slider. Locale strings register through `ctx.locale.register` zh/en like every other client plugin.

## Failure behavior

- Invalid settings — unknown preset id, dangling image id, malformed pairing — fail loud: schema validation rejects writes, and the section shows an error state instead of silently falling back.
- Upload failures surface in the section; nothing reaches settings unless the store accepted the bytes.
- A stored image that no longer resolves (store pruned by hand) renders as the unset background plus an error state in the section, not a broken page.

## Testing plan

Mirror the `ui-theme` suite structure: client apply wiring (service provision, section slot registration, settings sync, HMR collapse recovery); section component behavior in jsdom (preference switching, upload with stubbed fetch, dimming); boot injection via `node:vm` across each preference; host apply (namespace registration and disposal, route handlers with stubbed `attachments`/`webServer`, index transform); runtime service (snapshots, validation, revision guard, theme-change re-apply); settings store; and a CSS contract test asserting AppFrame consumes the three variables with fallbacks. Product-user-visible behavior ships with a keyless snapshot through a real runnable example per the testing policy; where the snapshot harness lacks a settings-UI surface, the harness support lands in the same change. `test:coverage` stays per-file 100%.

## Alternatives considered

- **Extend `ui-theme` instead of a new package.** The theme service owns color-scheme tokens; upload routing, durable storage, and a picker section are not theme concerns, and folding them in bloats a focused plugin. Rejected.
- **Store image bytes in settings (data URL).** `settings.yaml` is a small revision-guarded config document; multi-megabyte base64 values make every write and review noisy. Rejected in favor of opaque ids plus a byte route.
- **A new typert RPC method for upload.** The `/api` typert surface would grow for one binary POST. The webServer prefix route mirrors the existing `/plugins` route and adds no protocol surface. Rejected the RPC form.
- **A dedicated `$DSH_HOME/backgrounds` store.** The attachment store already provides validated, content-addressed, durable image storage; reusing it deletes owned code and tests. Rejected the second store.

## Acceptance criteria

- Default settings render the client exactly as today: no visible backdrop layers, flat `--dsw-alias-bg-base` page.
- Selecting a preset or uploaded image shows it behind the conversation immediately, survives reload without a flash, and persists under `ui-background` in `$DSH_HOME/settings.yaml`.
- Uploaded bytes land in the attachments store; settings hold only `{ id, mediaType }`; `GET /backgrounds/<id>` serves them; oversized or unsupported uploads fail with a visible error and write nothing.
- Dimming changes scrim strength live; the scrim follows light/dark without a settings change.
- Removing the background (preference `none`) restores the flat page.
- The gates that own this surface pass: package tests plus coverage, snapshot per policy, `doc-sync` for the note and package docs, lint and hygiene.

## Risks

- Replaced images are not garbage-collected in V1; orphaned store objects accumulate, bounded by the upload size cap. GC is a follow-up on the store seam.
- Readability over busy images rests on one scalar scrim; there is no per-region or auto-contrast adaptation. If it proves insufficient, the follow-up is per-area translucency, not more scalars.
- The boot transform reads settings while the index HTML is rendered; a settings write racing a reload can show the previous background once — the same window `ui-theme`'s boot injection already accepts.
- `POST /backgrounds` is a second non-RPC write surface next to `/api`; it must inherit that surface's authorization checks, or the loopback threat model must explicitly cover it — checked during implementation, not assumed.
- Open product decisions before implementation: the final preset set, the dimming default (45 assumed), and the section order (5 assumed).
