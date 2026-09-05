# Agent Note: Component library record-path normalization and unresolved-props visibility

Status: implemented

English | [中文](2026-09-05-component-library-record-path-and-props-visibility.zh.md)

## Problem

The component library's `component_record` write path derived the record id from the model-supplied `path` with a silent fallback to the npm package name whenever the `/packages\/client\/([^/]+)/` extraction missed. Any path shape outside the regex — backslash separators, which models emit naturally on Windows hosts, or an absolute checkout prefix — produced an id outside the scanner's `<package directory>/<Name>` id space. The scanner-collision rejection then missed those contributions: a model could record an already-scanned component as a near-duplicate, and the divergent record survived rescans indefinitely, because the rescan only drops stale *scanned* records. The package's declared postcondition — scanned records are authoritative, and a model write to a scanner-covered id is rejected loudly — was unenforceable for exactly the inputs the boundary exists for.

Separately, the query projection dropped the record's `propsInferred` and `rawProps` fields. Checker-free extraction resolves no members for most of this checkout's learned components (props types imported from another file, heritage clauses, and the repo's `PropsRuntime`/`PropsLocale`/`InjectFace` intersection pattern), so `component_query` presented those components as `props: (none)` — false information that invites the model to consume components without their real props.

## Decision

`ComponentLibraryService.contribute` normalizes the model-supplied path before deriving anything from it: backslashes become separators, the path is cut at the first `packages/client/` segment, and a path that does not name a file under that tree returns `invalid-record` — the package-name fallback is gone. The record stores the normalized repository-relative path, so the derived id always lands in the scanner's id space and the collision rejection covers every input shape.

`ComponentMatch` carries `propsInferred` and `rawProps`, the `component_query` wire schema includes both, and the tool render presents unresolved props as `unresolved: <raw type text>` instead of `(none)`. Resolved-but-empty props still render `(none)`.

## Alternatives considered

**Keep the fallback and document it.** The scanner-authority postcondition would stay unenforceable, and divergent model records would keep polluting the durable set with no cleanup path short of manual review.

**Reject any non-canonical path outright.** Strict validation, but models on Windows hosts emit backslash paths naturally, and normalization is deterministic and cheap; tolerance costs nothing while keeping one id space, so rejection would only add failures without adding guarantees.

**Resolve props with the TypeScript checker (`ts.createProgram`).** The right long-term answer for the unresolved share, including the `PropsRuntime` intersection pattern, but it abandons the documented checker-free design concept and its cold-start cost is unmeasured. Deferred; the raw type text already carries what the model needs to use a component.

**Leave `rawProps` out of matches and rely on the source path.** The model would have to read every component file to learn its props, which negates the library's purpose, and `(none)` was active misinformation rather than missing information.

## Consequences

The scanner-authority postcondition now holds for every path shape a model can emit, and model records store paths directly comparable with scanned ones. Query results surface the real type text for the unresolved majority instead of denying its props. In exchange, `component_record` rejects free-form paths outside `packages/client` — a component written elsewhere never had a learnable record anyway, since the scanner walks only that tree — and each match grew two bounded fields on the wire.

## Testing

`service.spec.ts` pins the normalization of a backslash absolute path onto the scanner id space, the collision rejection reached through a backslash path, and the rejection of paths that do not name the client tree. `tools.spec.ts` pins the `propsInferred: false` match fields and the `unresolved:` render against the fixture's cross-file `Panel`.
