# Agent Note: local-plugins vendors source-built external web plugins

Status: implemented

English | [中文](2026-08-27-local-plugins-source-vendoring.zh.md)

## Problem

The user's web profile needs a plugin the vanilla upstream bundle does not
carry (`dsh-git-graph`, the blank-session branch chip and graph dialog).
Installing it from npm ties the profile to a third-party publisher's release
cadence, and the fork has no GitHub token or `gh` CLI to automate pulls; the
machine is also short on disk (E: full, D: sandbox-denied), so accumulating
npm copies is not free. Meanwhile the fork already carries source-built local
plugins (the dsh-better-sidebar fork in a separate workspace), and the user
wants plugin sources to live in the fork repository they actually push to.

## Decision

Third-party plugins the user wants to own and evolve are vendored as source
under `local-plugins/<name>/` in this repository, built in place, and wired
into `~/.dsh/profiles/web/package.json` through a `file:` dependency plus the
`insert:` row in the profile's `cordis.patch.yml`. `local-plugins/` is
deliberately OUTSIDE the pnpm workspace (`packages/` semantics, hygiene, and
catalog rules stay untouched); each vendored package declares its own
`pnpm-workspace.yaml` (a stub `packages: []`) so pnpm stops walking up into
the repository root workspace, and its own `.npmrc` is machine-specific and
git-ignored.

The first vendor is `local-plugins/dsh-git-graph/` (Apache-2.0, upstream
`zhu1090093659/dsh-web` `packages/dsh-git-graph`), with the upstream
`shared/` build configs copied inside and the tsdown config import repointed
(`../../shared/…` → `./shared/…`), because the upstream package builds
against its monorepo root.

## Alternatives considered

- **Install from npm** — rejected for ownership: source in the fork means
  fixes (and revert-to-upstream) are one commit, not a release negotiation.
- **A separate plugin repository** — rejected for now: the user has no `gh`
  CLI, so a new GitHub repo is a manual web-UI step; hosting the source in
  the fork they already push keeps one remote to care about. Splitting later
  is a directory move.
- **Under `packages/`** — rejected: repository layout reserves `packages/`
  for the `@deepseek-ai/dsh-*` workspace with its own hygiene/catalog gates;
  a third-party plugin must not enter those semantics.

## Consequences

- Rebuild loop per vendored plugin: `pnpm build` inside its directory → copy
  `lib/` into the profile's node_modules (pnpm does not refresh a changed
  `file:` dep) → restart `dsh web`; stop the server before any
  `pnpm install` in the profile (Windows file locks).
- Vendored sources carry their upstream license files; provenance is stated
  in each package's README addition.
- Upstream syncs are manual: re-copy the package directory and re-apply the
  local diffs (documented import repoints, .npmrc ignore).
