# `@deepseek-ai/dsh-client-ui-settings-dev-checks`

English | [中文](README.zh.md)

Browser plugin that registers the **Dev checks** settings page: six per-machine switches over the `dev-checks` settings namespace that narrow the heavy routine quality gates on the local machine — the real-API e2e suite, the instrumented coverage run, the keyless snapshot replay, the doc-sync aggregate, agent-selected build/hygiene evidence, and the lefthook pre-push typecheck. The host half registers the namespace; the page renders one toggle row per gate and writes through the settingsScope transport, so every flip lands as a minimal `settings.mutate` path operation with the namespace revision.

The same settings document (`$DSH_HOME/settings.yaml`) is read by the repo-side gate wrapper (`scripts/dev-check-run.ts`), which the routine `test:e2e`, `test:coverage`, `test:snapshot`, and `doc-sync` scripts and the pre-push hook run through. Every switch defaults to on: a missing file or section keeps every gate running, `CI=true` forces every gate on, and explicit full entry points (`check:all`, `test:snapshot:record/refresh`) never consult the toggles — a local preference can never narrow CI evidence. The scripts-side key inventory is locked to this package's schema by `scripts/dev-checks.spec.ts`.

## Model Experience

None, as the page renders a browser configuration UI and the toggles gate developer-side quality checks; no provider request is involved.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Local-only semantics** — the toggles live in the per-machine settings document, not in the repository; a fresh machine runs every gate until the switches are flipped there.
- **Advisory build/hygiene switch** — `buildHygiene` guides agent check selection only; the build scripts stay unguarded because other gates depend on their outputs.
