# Agent Note: VS Code-style per-type file icons

Status: implemented

English | [中文](2026-08-19-vscode-file-icons.zh.md)

Date: 2026-08-19 · Area: `packages/client/ui-primitives`, `patches/dsh-better-sidebar@0.13.0.patch`

## Problem

Every file row in the web workspace tree carried the same "#" glyph, so the tree read as an undifferentiated wall of hashes. The hash was `IconCodeOutline16` — the ic_ds_* set's generic "code" glyph, whose path draws a pound sign — applied by `dsh-better-sidebar`'s FileTree and produced-file chips to every file regardless of type. Folder rows already render real folder glyphs; only file rows lost their type identity.

## Decision

File rows now carry a per-type glyph, resolved and drawn in two halves.

`dsh-client-ui-primitives` gains `FileIcon` plus the pure `fileIconKind(name)` resolver: a lowercase pass, an extensionless-name table (dotfiles and build files), then an extension table, falling to `generic`. Rendering follows VS Code icon themes — rounded letter plates in a per-type identity color (TS/JS/HTML/CSS/PY/PS/PDF…), prompt glyphs for shell dialects, drawn shapes for images, archives, and lined documents, and a currentColor dog-eared page for the untyped fallback. The identity colors live in the glyph table, not in `--dsw-*` tokens: a file type's color is brand identity, not theme state — the same choice VS Code ships as static icon-theme SVGs. `FileIcon` is therefore outside the ic_ds_* monochrome contract by design; its own spec pins the mapping, purity, color distinctness, and the currentColor fallback.

The plugin swap ships as `patches/dsh-better-sidebar@0.13.0.patch` (pnpm patchedDependencies, the same mechanism as the existing node-pty patch): the two per-file sites — the FileTree row and the produced-file chip — render `FileIcon name=…`; `IconCodeOutline16` stays where it means "code" (the context-menu open actions, the code viewer, the editor/explorer layout toggle).

## Alternatives considered

- **Redraw `IconCodeOutline16` itself as a file shape** — rejected: menus, the code viewer, and the layout toggle use it as a "code" intent glyph; the hash reads correctly there and those surfaces own it as much as the tree does.
- **Depend on an icon-theme package instead of drawing glyphs** — deferred: the candidate packages are not typed-ESM-clean under the repo's NodeNext and publint gates, and the curated table (20 kinds) covers the harness's own surfaces; consumers only see `fileIconKind` + `FileIcon`, so swapping the drawing backend later is local.
- **Fork or vendor the plugin into `vendor/`** — rejected: a two-site swap does not carry the maintenance burden of vendoring an actively developed plugin.

## Consequences

- The name and extension tables are the single expansion point; a new kind is one table row plus (for plate kinds) one plate entry. Label length drives the plate font size, so three-character labels stay legible at the 14px tree size.
- Coverage: `packages/client/ui-primitives/tests/file-icons.client.spec.tsx` pins the resolver (case-insensitivity, last-dot extension, name table, generic fallthrough) and the render (kind attribute, purity, distinct colors, the currentColor fallback, size/className plumbing). The assembled-surface check is a headless render of the live web app against the operator's real workspace folder (the four files from the original report map to text/text/html/powershell). A committed web e2e for the panel is deliberately absent: it would pin an external plugin's internals, the plugin owns its own test surface, and the repo gates cover the primitive it consumes.
- The patch edits the plugin's `src/` and both prebuilt `lib/` bundles, so the swap survives reinstalls and the served bundles carry it without a plugin rebuild. Upstreaming the swap to `dsh-better-sidebar` retires the patch; until then a plugin version bump needs the patch rebased or re-derived.
