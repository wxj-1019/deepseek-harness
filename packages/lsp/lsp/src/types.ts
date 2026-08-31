/**
 * LSP seam vocabulary: the normalized request, provider, and result contracts. Types only — the
 * {@link LspError} taxonomy and the {@link LspProviderId} brand factory are runtime and live in
 * `index.ts`. Positions and ranges are zero-based UTF-16, matching the protocol; the model-facing
 * tool owns the one-based cursor convention. The seam exposes no protocol types, process or document
 * controls, or generic JSON-RPC escape hatch — only the four semantic operations.
 * @module @deepseek-ai/dsh-lsp/types
 */

import type { LspProviderId } from './brand.ts'

/**
 * The semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Cursor operations
 * (`goToDefinition`, `findReferences`, `goToImplementation`, `hover`) require a position;
 * `documentSymbol` and `diagnostics` read a whole file; `workspaceSymbol` searches by query text;
 * `rename` returns a normalized workspace-edit plan the model applies with its file-edit tools;
 * `formatting` returns the same plan shape for one document.
 */
export type LspOperation =
  | 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
  | 'documentSymbol' | 'workspaceSymbol' | 'diagnostics' | 'rename' | 'formatting'

/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
export interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}

/** A zero-based UTF-16 half-open range `[start, end)`. */
export interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}

/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
export interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath?: string
  /** The zero-based UTF-16 cursor position to query at; required by cursor operations only. */
  readonly position?: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
  /** The query text for `workspaceSymbol`; ignored elsewhere. */
  readonly query?: string
  /** The new identifier for `rename`; ignored elsewhere. */
  readonly newName?: string
  /** Indentation options for `formatting`; ignored elsewhere. */
  readonly formatting?: LspFormattingOptions
}

/** Indentation options for `formatting`, forwarded as LSP `FormattingOptions`. */
export interface LspFormattingOptions {
  /** Spaces per indentation level. */
  readonly tabSize: number
  /** Indent with spaces rather than tabs. */
  readonly insertSpaces: boolean
}

/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
export interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}

/** One resolved location: a document URI and the range within it. */
export interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}

/** Normalized hover content, or `null` for no hover at the position. */
export interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}

/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
export type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
  | { readonly kind: 'symbols'; readonly symbols: readonly LspSymbolInfo[] }
  | { readonly kind: 'diagnostics'; readonly diagnostics: readonly LspDiagnostic[] }
  | { readonly kind: 'workspaceEdit'; readonly edits: readonly LspFileEdits[] }

/** One text edit within a renamed document. */
export interface LspTextEdit {
  readonly range: LspRange
  readonly newText: string
}

/** One symbol row of an outline or workspace symbol search. */
export interface LspSymbolInfo {
  /** Symbol display name. */
  readonly name: string
  /** LSP `SymbolKind` number (1 File, 12 Function, 6 Method, ...). */
  readonly kind: number
  /** The immediate container name for a nested symbol, when known. */
  readonly container?: string
  /** The document URI the symbol lives in. */
  readonly uri: string
  /** The symbol's full range. */
  readonly range: LspRange
}

/** One published or pulled diagnostic for a document. */
export interface LspDiagnostic {
  readonly range: LspRange
  /** The diagnostic message, verbatim from the server. */
  readonly message: string
  /** LSP severity (1 error, 2 warning, 3 information, 4 hint) when the server reports it. */
  readonly severity?: number
  /** The diagnostic's source tag (e.g. `typescript`), when supplied. */
  readonly source?: string
}

/** The edits for one document of a rename plan, applied top-to-bottom. */
export interface LspFileEdits {
  readonly uri: string
  readonly edits: readonly LspTextEdit[]
}

/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
export interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}

/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
export interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
