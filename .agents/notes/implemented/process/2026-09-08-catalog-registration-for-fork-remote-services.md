# Agent Note: Catalog registration for fork remote services

Status: implemented

English | [中文](2026-09-08-catalog-registration-for-fork-remote-services.zh.md)

## Problem

The fork's five `TypertRemoteService` packages — component-library, notification-center, session-pins, usage-ledger, and user-todo — shipped without any entry in the Cordis catalog generator's policy maps. Every `pnpm run gen-cordis-catalog` run failed loudly on the partition check (`has no SERVICE_PAGE entry`), which meant no generated catalog could be refreshed at all: `verify-cordis-catalog` was unpassable, the services' public API was invisible to the model-facing runtime catalog (`tool-cordis/src/api-catalog.ts`), and the LSP subsystem page had drifted from the seam's expanded operation union because nobody could regenerate anything.

## Decision

Each service gets its own bilingual subsystems page under `docs/subsystems/` with the cordis-surface markers, and the generator's three maps gain the corresponding entries: `SERVICE_PAGE` and `EVENT_SCOPE_PAGE` point each service key and `domain/*` event scope at its page, while `TYPE_LINK_EXEMPTIONS` classifies the packages' request/result vocabulary as owned by each package's `src/types.ts` (the established pattern for package-owned vocabulary, e.g. `AgentPreset*`). The five page pairs and the touched `README` index pair are re-recorded in their `.i18n.yaml` files. The LSP page's `type-equiv` blocks and prose were resynced with the 11-operation union, and three stale source JSDoc comments in `packages/lsp/lsp/src/types.ts` ("four operations", "Every field is required") were corrected so the gated documentation copies are accurate.

## Consequences

`gen-cordis-catalog` runs clean and the generated regions of the five new pages, `attachment`, `workspace`, `lsp`, and `tool-cordis/src/api-catalog.ts` are fresh, so `verify-cordis-catalog` and `verify-type-equiv` pass again. Future remote services must register in all three maps (or justify a walk exemption) in the same PR that adds the service — the partition check now fails loudly at generation time instead of letting a service go undocumented.

## Alternatives considered

- **Point `LINK_MAP` at the packages' READMEs instead of exemptions** — rejected: `linkedTypePages` values are `docs/subsystems/*.md` pages by convention, and re-typing the map to package paths would rework the projector for no gain over the existing exemption form.
- **Exempt the five services from the catalog entirely** — rejected: they are real user-facing remote API; hiding them would recreate the invisibility this fix removes.
