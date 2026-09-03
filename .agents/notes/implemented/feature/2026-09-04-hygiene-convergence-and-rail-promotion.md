# Agent Note: Post-merge hygiene convergence and the git rail promotion

Status: implemented

English | [中文](2026-09-04-hygiene-convergence-and-rail-promotion.zh.md)

## Problem

After the rc.8 upstream merge landed and the git-graph feature was promoted
into the first-party tree, the full hygiene gate (`pnpm run hygiene`) failed
on six sub-gates: package invariants, client UI i18n, Cordis config
validation, publint, workspace constraints, and package dependencies. The
failures were concentrated in the packages touched by the two-machine merge
(new tools, ui-usage/ui-user-todo, ui-git-graph) plus pre-existing Windows
issues. Separately, the modlens settings card threw a keyed-slot error on
every web console.

## Decision

- **Invariant companions**: every package exposing `src/invariant.ts` now
  declares the full contract — `exports["./invariant"]`, `files` whitelist
  entry, `dsh-invariants` peer+devDependency (host packages) or
  devDependency-only (client packages, per the dependency policy), and the
  tsconfig project reference to `runtime-diagnostics/invariants`. Applied
  across 17 packages via a batch script; the checker's policy distinction
  (host=peer, client=dev-only) is now satisfied everywhere.
- **Client dependency policy**: client packages must keep runtime imports in
  `dependencies` (connection/schemastery) and must not double-declare react as
  peer+dev. Moved per the gate's exact expected whitelists; `api/remotes`
  peers flattened to devDependencies-only per the non-Cordis peer rule.
- **i18n**: the MCP transport options moved into the locale dictionaries
  (`mcpCard.transportStdio/Http`); the usage heatmap month label
  de-localized to a bare number (language-neutral in both locales).
- **Cordis config**: the acp test profile's `cordis.yml` is a git symlink that
  Windows checkouts materialize as a text path stub, which the config
  validator cannot parse; replaced with a real content copy of the snapshot
  (functionally identical, loses only auto-sync with the snapshot).
- **Version alignment**: 22 client/host manifests re-aligned to the root
  version and the gate's exact `files` whitelists via the checker's own
  expected values.

## Alternatives considered

- **Fix publint's `exports["./src/*"]` mismatches** — deferred: the failure is
  the exports/files policy contradiction inherited from upstream manifests
  (`./src/*` export with a lib-only files whitelist). Upstream's Linux CI
  resolves the glob, so this is a Windows-local runner divergence; changing
  either the files policy or the exports map needs an upstream decision.
- **Restore `packages/client/runtime` from history for the git-graph imports**
  — rejected: the series removed Runtime deliberately; the store/cordis
  retarget satisfies the new packages.

## Consequences

- `constraints`, `verify-package-dependencies`, `verify-package-invariants`,
  `verify-cordis-config`, and `verify-client-ui-i18n` all pass; `publint`
  remains the only Windows-local hygiene divergence (upstream alignment
  pending).
- The modlens fix lives in the web profile's pnpm patch
  (`patches/@liustack__modlens.patch`) — environment-level, not part of this
  repository; an upstream PR to `@liustack/modlens` should follow.
- The full-suite Windows baseline (pty management, lsp-stdio PATH/spawn)
  failures are pre-existing and unrelated.
