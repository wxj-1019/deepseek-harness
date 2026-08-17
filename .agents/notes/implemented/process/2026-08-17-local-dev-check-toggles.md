# Agent Note: Local dev-check toggles

Status: implemented

English | [中文](2026-08-17-local-dev-check-toggles.zh.md)

## Problem

Finishing one feature or plugin triggered long local validation runs — the real-API e2e suite (over a hundred files of live model calls), the instrumented full-coverage run, the doc-sync aggregate, and the pre-push typecheck — because the only local check selection was the agent's judgment guided by [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md). There was no durable per-machine way to say "skip this lane locally": no `DSH_SKIP_*` env scheme exists, and keyless self-skip is a secretless-CI mechanism, not a cost signal (docs/testing.md). Developers paid the full wall-clock price on every routine run even on machines where a lane's evidence was not wanted.

## Decision

A `dev-checks` settings namespace holds six per-machine booleans, all defaulting to on, edited from the web settings page **Dev checks** (new package `packages/client/ui-settings-dev-checks`) and stored in the product settings document `$DSH_HOME/settings.yaml`:

- `e2e`, `coverage`, `snapshot`, `docSync`, and `prePushTypecheck` are enforced by a gate wrapper (`scripts/dev-check-run.ts`, reading `scripts/dev-checks.ts`) that the routine entry points run through: the `test:e2e`/`test:coverage`/`test:snapshot`/`doc-sync` package scripts and the lefthook pre-push typecheck. A switched-off gate prints a skip notice and exits 0.
- `buildHygiene` is advisory only: it guides agent check selection through the skill, and the build scripts stay unguarded because other gates depend on build outputs — hard-gating them would cascade into misleading skips.

The semantics protect CI evidence: every key defaults to on when the file or section is absent, `CI=true` short-circuits the reader to all-on before any filesystem access, and explicit full entry points (`check:all`, `test:snapshot:record/refresh`, CI gate modes) never consult the toggles. A malformed section (unknown key, non-boolean value, non-mapping section) fails loud in the wrapper rather than being silently ignored, so a typo never reads as a disabled gate. The scripts-side key inventory and the package schema are two declarations of one fact; `scripts/dev-checks.spec.ts` locks them together.

The web write path reuses the existing settings seams rather than inventing one: the client package's host half registers the namespace (the ui-aqua pattern), `WEB_SETTINGS_NAMESPACES` in the API proxy admits `dev-checks` (the deliberate chokepoint for remotely editable namespaces), and the page binds through `ctx.settingsScope` with plain `aria-pressed` toggle buttons.

## Alternatives considered

- **Environment variables (`DSH_SKIP_E2E=1` …)** — no persistence across shells, no GUI, and a new ad-hoc env dialect the repo has deliberately not grown; the settings document already is the durable per-machine store with a web editor.
- **A repo-local gitignored config file** — the web settings page can only write through the settings service, which owns `$DSH_HOME/settings.yaml`; reaching a repo file from the UI would need a bespoke RPC with a notion of "the repo", fragile from a host whose working directory is unrelated. The settings document is also the right scope: these are per-machine preferences, not repo policy.
- **Agent-only soft enforcement (skill prose without the wrapper)** — cheapest, but a forgotten read or a direct `pnpm run test:e2e` pays the full price anyway; the wrapper makes the toggle a fact of the entry point, with the skill as the second layer.
- **Hard-gating `build`/`hygiene` too** — `run-gates` aggregates depend on the build gate for downstream gates (`needs: ['build']`); switching it off would skip dependent gates and produce "I thought everything ran" false evidence. The advisory switch keeps the dependency graph honest.
- **Filtering gates inside `run-gates.ts` `gatesForMode()`** — rejected for the CI modes: `check:all` and the `ci-*` aggregates are the explicit full-rehearsal entry points and must never be narrowed by a local preference, so the toggle lives at the routine script boundary instead of inside the scheduler.

## Consequences

A developer flips one switch in the web settings (or edits the YAML) and the heavy lane stops consuming local wall clock immediately, while CI keeps owning the full matrix — the division docs/testing.md already states. The cost is a second consumer of the product settings document from repo tooling (kept honest by the schema-lock spec), one more process hop on the four wrapped scripts (negligible next to the lanes themselves), and the standing rule that a green local run with toggles off must be reported as partially skipped ([dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) carries the reporting wording).
