# @deepseek-ai/dsh-client-ui-background

English | [中文](README.zh.md)

Background plugin: the durable none / built-in preset / one uploaded image preference for the Web client. The Host half registers the `ui-background` settings namespace, serves `/backgrounds` (POST admission through the attachments store's image policy, GET/HEAD the current image with ETag revalidation), and injects the backdrop body variables into the index HTML so the first paint already carries the background. The browser half provides `ctx.background` (`BackgroundRuntime`): validated preference writes through the Host settings scope, immutable `BackgroundSnapshot`s on the `background/change` event, raw-byte uploads, and the Background settings section. Presentation is three body-level CSS variables (`--dsw-specific-backdrop-image/-scrim/-surface`); `ui-layout` renders the inert layers that consume them and stays correct without this plugin.

Upload admission reuses `ctx.attachments.imageLimits` (media types, byte cap), so one deployment policy governs chat images and backgrounds. Stored images are content-addressed objects in the attachments store; settings hold only the reference. Both `/backgrounds` methods carry the same browser-trust fence as `/api` through `@deepseek-ai/dsh-client-connection/trust`; the host row's `trustedHosts` config mirrors the connection row's list (each entry validated at load, absent meaning loopback-only, the safe standalone default). The scrim resolves `color-mix()` against `--dsw-alias-bg-base`, so it follows light/dark without extra state, and presets ship both palette modes as one `body` + `body[data-ds-dark-theme]` rule pair.

## Model Experience

None, as the service manages a browser preference; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Replaced images are not garbage-collected; orphaned store objects accumulate, bounded by the upload size cap.
- URL-pasted images, per-workspace backgrounds, animated backgrounds, and sidebar translucency are out of scope by design.
