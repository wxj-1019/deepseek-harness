# Third-party panel glass on the aqua floating mode

Date: 2026-08-18
Area: `packages/client/ui-aqua`

English | [中文](2026-08-18-third-party-panel-glass.zh.md)

## Decision

The `dsh-better-sidebar` profile plugin (third-party workbench: file explorer,
editor, terminal, bottom panel) paints every surface through the generic
`--dsw-alias-*` design tokens — its stylesheet documents this as the skinning
contract and expects skins to override those tokens. Aqua's floating mode
leaves the generic tokens stock-solid (only `COMPAT_SURFACE_OVERRIDES`, the
compat mode, turns them translucent), so the plugin's fixed panels rendered
opaque over the wallpaper. The theme layer now scopes the compat surface
values to `[data-dsh-better-sidebar]` (the stable attribute the plugin sets on
its mount host) in floating mode only, plus a `backdrop-filter:
blur(var(--dsh-aqua-blur))` on its hashed `panel` class fragment — the same
attribute-seam and class-fragment matching the rest of the layer uses. Compat
mode needs nothing: its global overrides already reach the tokens.

## Consequences

- The adaptation lives in the repo's own theme bundle, so plugin updates keep
  it (class-fragment and attribute seams only, never full hashed names), and
  the aqua master switch or plugin removal drops it with the stylesheet.
- Values mirror `COMPAT_SURFACE_OVERRIDES` in `aqua-settings.ts`; changing the
  compat palette must update both homes.
- Verified against the running web app (dark, floating, wallpaper on): the
  panel computed background is the scoped glass tint and the blur follows the
  knob; screenshot confirms the wallpaper shows through both panels. The
  repo's aqua e2e journey cannot cover this — the plugin exists only in the
  user profile layer, not the repo composition.
