# Agent Note: Composer pinning must not ride main-axis free space

Status: implemented

English | [中文](2026-08-24-webview-composer-free-space-bug.zh.md)

## Problem

The active conversation column pins the composer to the bottom of the scrollport. The original mechanism let `.viewArea` fill the scrollport (`flex: 1 0 auto`) so the sticky seat lands at the bottom; a bisect experiment (TEMP-DIAG-2026-08-24) instead pinned the seat with `margin-top: auto`. Both mechanisms allocate the flex container's main-axis **free space** — flex-grow distributes it, auto margins absorb it.

In the embedded webview (the in-app browser's Electron webview, one of the native webviews where the `html/body/#root` height chain breaks), the column flex scroll container computes that free space against the **scrollable content height** instead of the scrollport height. The free space therefore stays positive after the history overflows: `flex-grow` expands `.viewArea` past its content into a blank band above the sticky composer, and `margin-top: auto` keeps a positive margin — measured at 459px of phantom scroll space between the last message and the composer, growing the scrollbar on every sent message. The failure looks like the transcript being counted twice; the transcript is single, the free space is the double.

## Decision

Pin the composer without main-axis free-space distribution:

- `.viewArea` gets `flex: 0 0 auto; min-height: 100%`. A percentage `min-height` resolves against the scrollport's content box (a definite height), not through free-space allocation: short transcripts fill the scrollport so the sticky seat lands at the bottom, overflowing transcripts are unaffected, and no phantom space can appear.
- `.composerSeat` drops `margin-top: auto`.
- `.root[data-phase='active']` restores `flex: 1 1 auto; min-height: 0` — the fallback constraint that still caps the root when the height chain breaks and `height: 100%` resolves against auto content.

The same change lands the two related scroll fixes it was bisected with: `AppFrame`'s `height: 100vh` (frame-level height-chain fallback for native webviews) and the `heroGlowClip` wrapper (clips the hero glow's decorative bleed so it never creates scrollable overflow).

## Alternatives considered

- **Keep `flex: 1 0 auto` on `.viewArea`** — rejected: flex-grow distributes the same wrongly-computed free space, recreating the blank band the bisect was hunting.
- **Keep `margin-top: auto` on `.composerSeat`** — rejected: auto margins absorb the same free space, which is exactly the 459px phantom space measured.
- **`justify-content: flex-end` on the scroll body** — rejected: justify-content also allocates the same free space, so it shares the engine behavior.

## Consequences

- Composer pinning no longer depends on main-axis free-space allocation, which the embedded webview computes against the wrong height.
- Behavior is identical in standard browsers: a short transcript fills the scrollport, an overflowing one scrolls, and the seat stays sticky.
- A `min-height: 100%` on the transcript area adds at most one seat height of scroll range on short transcripts (the sticky seat is in-flow and always occupies that range by design), matching the pre-bisect behavior.
- Reintroduction condition: anyone restoring flex-grow or auto-margin pinning must re-verify in the embedded webview, not only in a standard browser.
