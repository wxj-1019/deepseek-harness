# Agent Note: usage heatmap cells render transparent — css-module class picked by string concat

Status: implemented

English | [中文](2026-09-01-usage-heatmap-level-class-lookup.zh.md)

## Problem

Every cell of the usage dashboard's token-activity heatmap rendered with a transparent background regardless of data. The cell class was built by string concatenation — `` `${css.heatmapCell} ${css.heatmapLevel}${level(cell.total)}` `` — but a css-modules mapping exports one hashed name per declared class, and no class named `heatmapLevel` exists. `css.heatmapLevel` is `undefined`, so the DOM carried the literal class `undefined0`…`undefined4` and none of the `.heatmapLevel0`–`.heatmapLevel4` background rules ever matched. The bug predates the rc.8 merge; the heatmap had never shown colors.

## Decision

Pick the level class from a module-level array indexed by the computed level — `[css.heatmapLevel0, …, css.heatmapLevel4][level]` — the same pattern used for enumerated style variants elsewhere in the codebase. A bounds guard maps an out-of-range level to no extra class.

## Consequences

- Cells with data render their intensity color; zero days render the level-0 inset gray, so the grid reads as a lattice with the active days highlighted.
- The general rule: a css-modules class can never be assembled from a shared prefix plus a runtime suffix — enumerated variants must be selected from the exported mapping.
