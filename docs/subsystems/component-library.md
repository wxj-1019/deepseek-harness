# Component library

English | [中文](component-library.zh.md)

The storage-domain owner of the learned-component library: durable records with review state, ranked matches for a query, and the gallery's snapshot/list/summary reads. Every durable write — scan, watch, the model tool, panel review — broadcasts `component-library/changed` after the domain commits, which the panel uses to refetch.

## Service behavior

[`ComponentLibraryService`](../../packages/storage/component-library/src/index.ts) owns the durable set and its remote face; the package [README](../../packages/storage/component-library/README.md) and [`types.ts`](../../packages/storage/component-library/src/types.ts) define the callable API and record vocabulary.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcomponentlibrary--componentlibraryservice"></a>

### `ctx.componentLibrary` — `ComponentLibraryService`

Storage-domain owner of the component library. Durable writes — scan, watch, model tool, panel review — each broadcast `component-library/changed` after the domain commits, which the panel uses to refetch.

```ts cordis-catalog
/**
 * Read every durable record, most recently updated first.
 * @returns the frozen snapshot list.
 */
snapshotAll(): readonly ComponentRecord[]

/**
 * Rank matches for one free-text query. Unreviewed model records stay
 * quarantined unless the settings namespace opts in; when included they
 * rank below every scanned match.
 * @param request - the query, optional package filter, optional limit.
 * @returns the ranked match list.
 */
rankMatches(request: ComponentLibraryQueryRequest): readonly ComponentMatch[]

/**
 * Validate and store one model-contributed record: quarantined
 * (`reviewed: false`) until a human approves it on the panel. The path is
 * normalized into the scanner's repository-relative POSIX form, `pkg` must
 * match the owning directory's manifest name (the scanner's own
 * resolution), and a path that does not name a file under the client tree
 * is a loud rejection. An id already covered by the scanner is also a loud
 * rejection, not an overwrite.
 * @param request - the model's claim about the component it created.
 * @returns the stored id, or `invalid-record`.
 */
async contribute(request: ComponentLibraryRecordRequest): Promise<ComponentLibraryRecordResult>

/**
 * Ranked component retrieval for the panel and the skill body.
 * @param request - the query, optional package filter, optional limit.
 * @returns the ranked matches.
 */
@Remote('query') query(request: ComponentLibraryQueryRequest): Promise<ComponentLibraryQueryResult>

/**
 * Library counts for the panel header.
 * @returns total, scanned, and pending-review counts.
 */
@Remote('summary') summary(): Promise<ComponentLibrarySummaryResult>

/**
 * Read every record, most recently updated first.
 * @returns the frozen snapshot list.
 */
@Remote('list') list(): Promise<ComponentLibraryListResult>

/**
 * Store one model-contributed record (the panel-free write path of
 * {@link contribute}).
 * @param request - the record claim.
 * @returns the stored id, or `invalid-record`.
 */
@Remote('record') record(request: ComponentLibraryRecordRequest): Promise<ComponentLibraryRecordResult>

/**
 * Apply one panel review decision to a model-contributed record:
 * `approve` marks the record reviewed and lifts the quarantine; `discard`
 * deletes it. Scanned records are outside the review seam — they are born
 * reviewed and authoritative, so their id is a loud rejection.
 * @param request - the record and the decision.
 * @returns the ack, or `component-not-found` / `scanned-record`.
 */
@Remote('review') async review(request: ComponentLibraryReviewRequest): Promise<ComponentLibraryReviewResult>
```

Source: [`packages/storage/component-library/src/index.ts`](../../packages/storage/component-library/src/index.ts)

<a id="component-library-events"></a>

### `component-library/*` events

<a id="component-librarychanged--emit"></a>

#### `component-library/changed` — emit

The component library gained, changed, or dropped a record through the scanner, the watcher, the model tool, or a panel review. Emitted after the storage domain committed; arguments are intentionally empty — consumers refetch instead of replaying deltas.

```ts cordis-catalog
/**
 * The component library gained, changed, or dropped a record through the
 * scanner, the watcher, the model tool, or a panel review. Emitted after
 * the storage domain committed; arguments are intentionally empty —
 * consumers refetch instead of replaying deltas.
 * @mode emit
 */
'component-library/changed'(): void
```

Source: [`packages/storage/component-library/src/types.ts`](../../packages/storage/component-library/src/types.ts)
<!-- END GENERATED cordis-surface -->
