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

Two fragment-matching gaps surfaced when the rendered result was measured on
the live page, and both are closed in the same rules:

- The blur selector's `panel` substring is case-sensitive, so the camelCase
  `bottomPanel` fragment missed it: the bottom panel kept a translucent fill
  without blur and read as an unfrosted wash. It is matched explicitly.
- The interior `pane` sheet paints `bg-base` inside the blurred, filled
  `panel`, so the two translucent fills stacked into one near-opaque wash
  with the unfrosted layer on top. The pane family (minus `paneCard`, whose
  empty-pane welcome cards keep their fill like the settings-page inner
  cards; and minus the `panel` family, whose name contains the `pane`
  fragment) now goes transparent — the panel alone is the glass sheet, the
  trajectory-view treatment of inner surfaces.

The panels then took the stock floating-card material to match the page's
own cards: the frost-scaled `--dsh-aqua-glass-card-*` fill, the inset top
highlight plus the soft outer shadow, the hairline border (the side panel
carries the sidebar column's luminous right edge), and 12px floating insets
with a 20px radius. Margins carry the floating geometry — the plugin writes
width/left/right inline, and the bottom panel's inline right tracks the side
panel's width, so both panels' insets move together and the shared corner
stays flush. `overflow: hidden` clips the content to the rounded corners
(the app's own sidebar card does the same); the drag handles that
straddled the borders (`panelResize`, `bottomResize`, `cornerHandle`) move
fully inside so the clip keeps them reachable, and the fixed toggle cluster
follows the side panel's insets with the title-bar strip variable preserved
for position-compat mode.

## Consequences

- The adaptation lives in the repo's own theme bundle, so plugin updates keep
  it (class-fragment and attribute seams only, never full hashed names), and
  the aqua master switch or plugin removal drops it with the stylesheet.
- The scoped token list also overrides `--dsw-alias-bg-base` (the plugin's
  workbench panes, editor/tree/terminal wraps paint that token, and neither
  the floating nor the compat lists touch it because it is the app-root
  fill). The terminal keeps an opaque xterm background through the plugin's
  own opacity floor (`effectiveTokenValue`), so only the chrome turns glass.
- Values mirror `COMPAT_SURFACE_OVERRIDES` in `aqua-settings.ts` (plus the
  bg-base pane fill); changing the compat palette must update both homes.
- Verified against the running web app (dark, floating, wallpaper on): every
  workbench surface's computed background and backdrop-filter sampled from
  the live DOM, before and after the rebuild — the side and bottom panels
  each carry exactly one translucent fill plus the knob's blur, the interior
  sheets are transparent, and a screenshot review confirms the material
  matches the page's own glass cards. The repo's aqua e2e journey cannot
  cover this — the plugin exists only in the user profile layer, not the
  repo composition.
