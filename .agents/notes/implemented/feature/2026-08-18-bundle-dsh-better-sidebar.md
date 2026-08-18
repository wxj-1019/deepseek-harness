# Bundle dsh-better-sidebar into the web-app composition

Date: 2026-08-18
Area: `packages/bundle/web-app`

English | [中文](2026-08-18-bundle-dsh-better-sidebar.zh.md)

## Decision

The community workbench plugin `dsh-better-sidebar` (VSCode-style right
sidebar: explorer / editor / terminal / Git / browser, bottom panels, and the
`ctx.betterSidebar` service for third-party tabs) joins the repository's web
composition instead of the user-profile channel its README documents. The
profile route (`dsh plugin --profile web add`) installs only on one machine and
never reaches the fork; the bundle route makes the plugin ship with every
`dsh web` boot of this repository and land in the remote on push. The change is
two rows: `"dsh-better-sidebar": "^0.13.0"` in the web-app dependencies (the
published npm package, prebuilt `lib/` — no repo build step) and one `insert`
row (`id: better-sidebar`) in the web-app `cordis.patch.yml`, which satisfies
the `verify-cordis-config` rule that bare plugin rows resolve from the owning
manifest's dependencies.

## Consequences

- The web profile stack stays `dsh-base + dsh-web-app`; the profile's own
  `cordis.patch.yml` carries no better-sidebar row, so the bundle mount cannot
  double-mount with a leftover manual line. `dshmarket` in the profile bundle
  list is unrelated and untouched.
- pnpm installed a second `node-pty` copy (the plugin's `^1.1.0` against the
  workspace's patched `1.2.0-beta.15`); `allowBuilds` already covers it. If the
  terminal surface reports "node-pty 加载失败", rebuild that copy in the
  plugin's `.pnpm` store dir — the sidebar itself mounts either way.
- The aqua glass adaptation for this plugin (scoped `[data-dsh-better-sidebar]`
  overrides + `blur(var(--dsh-aqua-blur))`, see the third-party-panel-glass
  note) now has its target in the repo composition, so the workbench follows
  the aqua skin out of the box.
- Version pinned at `^0.13.0`; updating means bumping the dependency and the
  lockfile, plus re-running `gen-third-party-notices` (the notices gate tracks
  the shipped dependency).
