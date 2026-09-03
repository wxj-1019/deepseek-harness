# Agent Note: git-graph rail rendering — stretched-viewBox curves and a chart-hue palette

Status: implemented

English | [中文](2026-09-02-git-graph-rail-render-polish.zh.md)

## Problem

The first-party commit rail rendered lane changes as straight diagonal lines, colored lanes with semantic state tokens (a red rail reads as a failure, not a branch), drew bare dots, and sat directly on the transparent aqua surface — the wallpaper competed with the graph and hashes were near-invisible.

## Decision

- **Curve rendering under unknown row height.** The SVG keeps the stretched-row contract but switches from percentage `line` attributes to a `0–{laneWidth}×100` `viewBox` with `preserveAspectRatio="none"`: y units stay percent-equivalent (rows still connect at their shared border), x units stay lane pixels, and `non-scaling-stroke` holds every stroke at screen width under the non-uniform stretch — which is what makes cubic S-curve merge edges (`C` with control points at 72/78% of the row height) render smoothly instead of aliased.
- **Palette.** Lanes use the app's chart series hues (the same set as the usage charts). Semantic state colors are deliberately excluded — a red rail reads as a failure; distinct hues carry lane identity without loading the graph with meaning. Rails dim to 75% opacity so dots lead.
- **Ref pills tier.** The HEAD target fills with the accent (the checked-out branch reads at a glance), tags take a warm outline, other refs keep the subtle inset pill.
- **Surface.** The view sits on a near-opaque rounded panel with the aqua glass recipe's inset top highlight; hashes move to label-secondary (from tertiary, which vanished on the wallpaper).

## Consequences

- Row height still drives nothing but the stretch; the assignment algorithm is unchanged.
- The dot's background ring samples `--dsw-alias-bg-base`, so switching the panel fill requires updating the ring color with it.
