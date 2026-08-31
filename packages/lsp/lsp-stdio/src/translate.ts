/**
 * Pure protocol translation for the local host: what the server's capabilities allow, and how its
 * `Location`/`LocationLink`/`Hover` payloads normalize into the seam's closed result unions. No I/O
 * or process state — every function here is a pure transform, which the fake-stdio tests pin exactly.
 * @module @deepseek-ai/dsh-lsp-stdio/translate
 */

import type {
  LspDiagnostic,
  LspCallRow,
  LspFileEdits,
  LspHover,
  LspLocation,
  LspOperation,
  LspRange,
  LspSymbolInfo,
} from '@deepseek-ai/dsh-lsp'
import { LspError } from '@deepseek-ai/dsh-lsp'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type {
  WireHover,
  WireLocation,
  WireLocationLink,
  WireMarkedString,
  WireProviderCapability,
  WireRange,
  WireServerCapabilities,
  WireTextDocumentSyncKind,
} from './protocol.ts'

/**
 * The `textDocument/*` request method for each LSP operation.
 * @param operation - the LSP operation to map.
 * @returns the LSP request method name.
 */
export function requestMethod(operation: LspOperation): string {
  switch (operation) {
    case 'goToDefinition': return 'textDocument/definition'
    case 'findReferences': return 'textDocument/references'
    case 'goToImplementation': return 'textDocument/implementation'
    case 'hover': return 'textDocument/hover'
    case 'documentSymbol': return 'textDocument/documentSymbol'
    case 'workspaceSymbol': return 'workspace/symbol'
    case 'diagnostics': return 'textDocument/diagnostic'
    case 'rename': return 'textDocument/rename'
    case 'formatting': return 'textDocument/formatting'
    case 'incomingCalls': return 'callHierarchy/incomingCalls'
    case 'outgoingCalls': return 'callHierarchy/outgoingCalls'
    /* v8 ignore next -- exhaustive over the closed LspOperation union; unreachable. */
    default: return assertNever(operation, 'requestMethod')
  }
}

/** The `ServerCapabilities` provider field backing each operation. */
function capabilityValue(capabilities: WireServerCapabilities, operation: LspOperation): WireProviderCapability {
  switch (operation) {
    case 'goToDefinition': return capabilities.definitionProvider
    case 'findReferences': return capabilities.referencesProvider
    case 'goToImplementation': return capabilities.implementationProvider
    case 'hover': return capabilities.hoverProvider
    case 'documentSymbol': return capabilities.documentSymbolProvider
    case 'workspaceSymbol': return capabilities.workspaceSymbolProvider
    case 'diagnostics': return capabilities.diagnosticProvider
    case 'rename': return capabilities.renameProvider
    case 'formatting': return capabilities.documentFormattingProvider
    case 'incomingCalls': return capabilities.callHierarchyProvider
    case 'outgoingCalls': return capabilities.callHierarchyProvider
    /* v8 ignore next -- exhaustive over the closed LspOperation union; unreachable. */
    default: return assertNever(operation, 'capabilityValue')
  }
}

/** A provider capability is present when the server sent `true` or an options object (not `false`/absent). */
function supportsCapability(value: WireProviderCapability): boolean {
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  return true
}

/**
 * Whether the server advertises the requested operation.
 * @param capabilities - the server's `initialize` capabilities.
 * @param operation - the LSP operation to check.
 * @returns true when the corresponding provider capability is present.
 */
export function supportsOperation(capabilities: WireServerCapabilities, operation: LspOperation): boolean {
  return supportsCapability(capabilityValue(capabilities, operation))
}

/**
 * Whether a `textDocumentSync` value permits the transient `didOpen`/`didClose` this host relies on.
 * The legacy enum form implies open/close for `Full`/`Incremental`; the options form requires an
 * explicit `openClose: true`, because the protocol defaults an omitted `openClose` to false.
 * @param sync - the server's advertised `textDocumentSync` capability.
 * @returns true when transient open/close is supported.
 */
export function supportsTransientOpen(sync: WireServerCapabilities['textDocumentSync']): boolean {
  if (sync === undefined) return false
  if (typeof sync === 'number') return isOpenCloseKind(sync)
  return sync.openClose === true
}

/** Legacy enum: `Full` (1) or `Incremental` (2) imply open/close support; `None` (0) does not. */
function isOpenCloseKind(kind: WireTextDocumentSyncKind): boolean {
  return kind === 1 || kind === 2
}

/**
 * Normalize the negotiated position encoding. An omitted encoding defaults to `utf-16`; any value
 * other than `utf-16` is a protocol error this host does not support.
 * @param encoding - the server's advertised `positionEncoding`, if any.
 * @returns the string `'utf-16'`.
 * @throws Error for any non-`utf-16` encoding.
 */
export function negotiatePositionEncoding(encoding: string | undefined): 'utf-16' {
  if (encoding === undefined || encoding === 'utf-16') return 'utf-16'
  throw new Error(`server negotiated unsupported position encoding "${encoding}"; this host requires utf-16`)
}

/** Convert a wire range to the seam's range (structurally identical, but re-shaped as `readonly`). */
function toRange(range: WireRange): LspRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  }
}

/** Whether a record is a `LocationLink` (has `targetUri` + `targetSelectionRange`). */
function isLocationLink(value: Record<string, unknown>): boolean {
  return typeof value.targetUri === 'string' && isRange(value.targetSelectionRange)
}

/** Whether a record is a `Location` (has string `uri` + a range). */
function isLocation(value: Record<string, unknown>): boolean {
  return typeof value.uri === 'string' && isRange(value.range)
}

/** Structural range guard used by both location shapes. */
function isRange(value: unknown): value is WireRange {
  if (value === null || typeof value !== 'object') return false
  const range = value as Record<string, unknown>
  return isPosition(range.start) && isPosition(range.end)
}

/** Structural position guard. */
function isPosition(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const position = value as Record<string, unknown>
  return isProtocolCoordinate(position.line) && isProtocolCoordinate(position.character)
}

/** Whether a wire coordinate is a valid nonnegative integer. */
function isProtocolCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Normalize a navigation result (`Location`, `Location[]`, `LocationLink[]`, or `null`) to the seam's
 * locations. `Location` maps directly; `LocationLink` maps `targetUri` + `targetSelectionRange`.
 * @param payload - the raw `textDocument/definition|references|implementation` result.
 * @returns the normalized locations (empty for `null`/`[]`).
 * @throws Error when an element is neither a `Location` nor a `LocationLink`.
 */
export function normalizeLocations(payload: unknown): LspLocation[] {
  if (payload === null) return []
  if (payload === undefined) throw malformedResponse('LSP navigation result was missing')
  const elements = Array.isArray(payload) ? payload : [payload]
  const locations: LspLocation[] = []
  for (const element of elements) {
    if (element === null || typeof element !== 'object') {
      throw malformedResponse('LSP navigation result contained a non-object entry')
    }
    const record = element as Record<string, unknown>
    if (isLocationLink(record)) {
      const link = record as unknown as WireLocationLink
      locations.push({ uri: link.targetUri, range: toRange(link.targetSelectionRange) })
    } else if (isLocation(record)) {
      const location = record as unknown as WireLocation
      locations.push({ uri: location.uri, range: toRange(location.range) })
    } else {
      throw malformedResponse('LSP navigation result contained neither a Location nor a LocationLink')
    }
  }
  return locations
}

/** Render one `MarkedString` (string form verbatim; object form as a language-tagged fenced block). */
function renderMarkedString(value: WireMarkedString): string {
  if (typeof value === 'string') return value
  return `\`\`\`${value.language}\n${value.value}\n\`\`\``
}

/**
 * Normalize a `Hover` (or `null`) to the seam's hover. `MarkupContent` uses its `value`; a string
 * `MarkedString` is verbatim; a language-tagged `MarkedString` becomes a fenced code block; an array
 * joins its rendered parts with one blank line. The model-facing tool owns the complete result cap.
 * @param payload - the raw `textDocument/hover` result.
 * @returns the normalized hover, or `null` when there is no content.
 * @throws Error when the payload is a non-null, non-object, or structurally invalid hover.
 */
export function normalizeHover(payload: unknown): LspHover | null {
  if (payload === null) return null
  if (payload === undefined) throw malformedResponse('LSP hover result was missing')
  if (typeof payload !== 'object') throw malformedResponse('LSP hover result was not an object')
  const hover = payload as unknown as WireHover
  const contents = renderHoverContents(hover.contents)
  if (contents === '') return null
  const range = hover.range
  if (range === undefined) return { contents }
  if (!isRange(range)) throw malformedResponse('LSP hover result contained a malformed range')
  return { contents, range: toRange(range) }
}

/** Render the three `Hover.contents` encodings into one string (input is untrusted wire data). */
function renderHoverContents(contents: unknown): string {
  if (contents === null || contents === undefined) {
    throw malformedResponse('LSP hover result had no contents')
  }
  if (typeof contents === 'string') return contents
  if (Array.isArray(contents)) {
    return contents.map((value) => {
      if (isMarkedString(value)) return renderMarkedString(value)
      throw malformedResponse('LSP hover contents contained a malformed MarkedString')
    }).join('\n\n')
  }
  if (typeof contents !== 'object') {
    throw malformedResponse('LSP hover contents were not MarkupContent, MarkedString, or an array')
  }
  const record = contents as Record<string, unknown>
  if (record.kind === 'markdown' || record.kind === 'plaintext') {
    if (typeof record.value !== 'string') {
      throw malformedResponse('LSP hover MarkupContent value was not a string')
    }
    return record.value
  }
  if (typeof record.language === 'string' && typeof record.value === 'string') {
    return renderMarkedString({ language: record.language, value: record.value })
  }
  throw malformedResponse('LSP hover contents were not MarkupContent, MarkedString, or an array')
}

/** Whether an untrusted value is either form of `MarkedString`. */
function isMarkedString(value: unknown): value is WireMarkedString {
  if (typeof value === 'string') return true
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.language === 'string' && typeof record.value === 'string'
}

/** LSP SymbolKind numbers for the names the outline view renders. */
export const SYMBOL_KIND_NAMES: readonly string[] = [
  'File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property', 'Field',
  'Constructor', 'Enum', 'Interface', 'Function', 'Variable', 'Constant', 'String',
  'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember', 'Struct',
  'Event', 'Operator', 'TypeParameter',
]

/** The display name for a numeric SymbolKind, falling back to the number. */
export function symbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind - 1] ?? String(kind)
}

/** Structural guard for a `Location`-shaped value used by symbol payloads. */
function symbolLocation(value: unknown): { uri: string; range: LspRange } | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.uri !== 'string' || !isRange(record.range)) return undefined
  return { uri: record.uri, range: toRange(record.range) }
}

/**
 * Normalize a `textDocument/documentSymbol` result (hierarchical
 * `DocumentSymbol[]`, flat `SymbolInformation[]`, or `null`) into flat symbol
 * rows. Hierarchical children flatten with their container chain as the
 * `container` field; every row's URI is the queried document's.
 * @param payload - the raw documentSymbol result.
 * @param uri - the queried document URI (DocumentSymbol rows carry no URI).
 * @returns the flattened symbol rows.
 * @throws Error when a payload entry is structurally invalid.
 */
export function normalizeDocumentSymbols(payload: unknown, uri: string): LspSymbolInfo[] {
  if (payload === null) return []
  if (payload === undefined || !Array.isArray(payload)) {
    throw malformedResponse('LSP documentSymbol result was missing or not an array')
  }
  const rows: LspSymbolInfo[] = []
  const walk = (value: unknown, container: string | undefined): void => {
    if (value === null || typeof value !== 'object') {
      throw malformedResponse('LSP documentSymbol contained a non-object entry')
    }
    const record = value as Record<string, unknown>
    if (typeof record.name !== 'string' || typeof record.kind !== 'number') {
      throw malformedResponse('LSP documentSymbol entry lacked a name or kind')
    }
    const range = isRange(record.range) ? toRange(record.range) : undefined
    if (range === undefined) throw malformedResponse('LSP documentSymbol entry lacked a range')
    rows.push({ name: record.name, kind: record.kind, ...(container !== undefined ? { container } : {}), uri, range })
    if (Array.isArray(record.children)) {
      for (const child of record.children) walk(child, record.name)
    }
  }
  for (const entry of payload) {
    // A SymbolInformation entry carries a location instead of a range + children.
    const record = entry as Record<string, unknown>
    if (record.location !== undefined) {
      const located = symbolLocation(record.location)
      if (located === undefined || typeof record.name !== 'string' || typeof record.kind !== 'number') {
        throw malformedResponse('LSP documentSymbol contained a malformed SymbolInformation entry')
      }
      rows.push({ name: record.name, kind: record.kind, uri: located.uri, range: located.range })
      continue
    }
    walk(entry, undefined)
  }
  return rows
}

/**
 * Normalize a `workspace/symbol` result (`SymbolInformation[]` or `null`) into
 * flat symbol rows.
 * @param payload - the raw workspace symbol result.
 * @returns the symbol rows.
 * @throws Error when a payload entry is structurally invalid.
 */
export function normalizeWorkspaceSymbols(payload: unknown): LspSymbolInfo[] {
  if (payload === null) return []
  if (payload === undefined || !Array.isArray(payload)) {
    throw malformedResponse('LSP workspace symbol result was missing or not an array')
  }
  const rows: LspSymbolInfo[] = []
  for (const element of payload) {
    if (element === null || typeof element !== 'object') {
      throw malformedResponse('LSP workspace symbol contained a non-object entry')
    }
    const record = element as Record<string, unknown>
    const located = symbolLocation(record.location)
    if (typeof record.name !== 'string' || typeof record.kind !== 'number' || located === undefined) {
      throw malformedResponse('LSP workspace symbol contained a malformed SymbolInformation entry')
    }
    rows.push({
      name: record.name,
      kind: record.kind,
      ...(typeof record.containerName === 'string' ? { container: record.containerName } : {}),
      uri: located.uri,
      range: located.range,
    })
  }
  return rows
}

/** Structural guard for one wire `Diagnostic`. */
function isDiagnostic(value: unknown): value is { range: WireRange; message: string; severity?: number; source?: string } {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.message === 'string' && isRange(record.range)
}

/**
 * Normalize a `textDocument/diagnostic` pull result (`DiagnosticReport` or
 * `null`): `kind: 'full'` carries the items; `unchanged` and `null` yield an
 * empty list (this host pulls fresh every query, so nothing is cached).
 * @param payload - the raw pull-diagnostics result.
 * @returns the normalized diagnostics.
 * @throws Error when a `full` report contains a malformed item.
 */
export function normalizeDiagnostics(payload: unknown): LspDiagnostic[] {
  if (payload === null) return []
  if (typeof payload !== 'object') throw malformedResponse('LSP diagnostics result was not an object')
  const report = payload as Record<string, unknown>
  if (report.kind === 'unchanged') return []
  if (report.kind !== 'full' || !Array.isArray(report.items)) {
    throw malformedResponse('LSP diagnostics result was not a full report')
  }
  return report.items.map((item) => {
    if (!isDiagnostic(item)) throw malformedResponse('LSP diagnostics contained a malformed entry')
    return {
      range: toRange(item.range),
      message: item.message,
      ...item.severity !== undefined ? { severity: item.severity } : {},
      ...item.source !== undefined ? { source: item.source } : {},
    }
  })
}

/**
 * Normalize a `textDocument/publishDiagnostics` notification: the pushed
 * diagnostics array for one document URI.
 * @param params - the raw notification params.
 * @returns the document URI and its normalized diagnostics (empty when absent).
 * @throws Error for missing params/URI or a malformed diagnostics entry.
 */
export function normalizePublishDiagnostics(params: unknown): { uri: string; diagnostics: LspDiagnostic[] } {
  if (params === null || typeof params !== 'object') throw malformedResponse('LSP publishDiagnostics params were not an object')
  const record = params as Record<string, unknown>
  if (typeof record.uri !== 'string' || record.uri === '') {
    throw malformedResponse('LSP publishDiagnostics params carried no document URI')
  }
  const diagnostics = record.diagnostics === undefined
    ? []
    : normalizeDiagnostics({ kind: 'full', items: record.diagnostics })
  return { uri: record.uri, diagnostics }
}

/**
 * Normalize a `textDocument/rename` `WorkspaceEdit` (or `null`) into a flat
 * per-file edit plan. `documentChanges` (versioned entries) is a protocol
 * capability this host does not bridge and rejects loudly.
 * @param payload - the raw rename result.
 * @returns one entry per touched document, in server order.
 * @throws Error for a null plan, an unsupported `documentChanges` shape, or malformed edits.
 */
export function normalizeWorkspaceEdit(payload: unknown): readonly LspFileEdits[] {
  if (payload === null) return []
  if (typeof payload !== 'object') throw malformedResponse('LSP rename result was not an object')
  const edit = payload as Record<string, unknown>
  if (edit.documentChanges !== undefined) {
    throw malformedResponse('LSP rename used documentChanges, which this host does not support')
  }
  const changes = edit.changes
  if (changes === undefined || changes === null || typeof changes !== 'object') {
    throw malformedResponse('LSP rename result carried no changes')
  }
  const rows: { uri: string; edits: { range: LspRange; newText: string }[] }[] = []
  for (const [uri, entries] of Object.entries(changes as Record<string, unknown>)) {
    if (!Array.isArray(entries)) throw malformedResponse('LSP rename edits for a document were not an array')
    const fileEdits = entries.map((entry) => {
      if (entry === null || typeof entry !== 'object' || !isRange((entry as Record<string, unknown>).range)
        || typeof (entry as Record<string, unknown>).newText !== 'string') {
        throw malformedResponse('LSP rename contained a malformed TextEdit')
      }
      const typed = entry as { range: WireRange; newText: string }
      return { range: toRange(typed.range), newText: typed.newText }
    })
    rows.push({ uri, edits: fileEdits })
  }
  return rows
}

/**
 * Normalize a `textDocument/formatting` result: an array of `TextEdit` for the
 * queried document (or `null` for no edits), wrapped as one file's edit plan
 * so the tool renders formatting exactly like a single-file rename.
 * @param payload - the server's raw formatting result.
 * @param uri - the queried document's URI; the plan's only file key.
 * @returns one `LspFileEdits` for the document, empty when the server returned `null`.
 * @throws Error for a non-array payload or a malformed `TextEdit`.
 */
export function normalizeFormattingEdits(payload: unknown, uri: string): readonly LspFileEdits[] {
  if (payload === null) return []
  if (!Array.isArray(payload)) throw malformedResponse('LSP formatting result was not an array')
  const edits = payload.map((entry) => {
    if (entry === null || typeof entry !== 'object' || !isRange((entry as Record<string, unknown>).range)
      || typeof (entry as Record<string, unknown>).newText !== 'string') {
      throw malformedResponse('LSP formatting contained a malformed TextEdit')
    }
    const typed = entry as { range: WireRange; newText: string }
    return { range: toRange(typed.range), newText: typed.newText }
  })
  return [{ uri, edits }]
}

/** Create the stable structured error used for malformed server result payloads. */
function malformedResponse(message: string): LspError {
  return new LspError(message, 'LSP_MALFORMED_RESPONSE')
}

/** Whether a record is a plausible `CallHierarchyItem`. */
function isCallItem(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.name === 'string' && typeof item.kind === 'number' && typeof item.uri === 'string' && isRange(item.range)
}

/** Fold one `CallHierarchyItem` into the row's identity fields. */
function toCallIdentity(item: Record<string, unknown>): {
  name: string
  kind: number
  uri: string
  range: LspRange
  container?: string
} {
  const selection = item.selectionRange
  if (typeof item.name !== 'string' || typeof item.kind !== 'number' || typeof item.uri !== 'string') {
    throw malformedResponse('LSP call hierarchy item lacked symbol identity fields')
  }
  return {
    name: item.name,
    kind: item.kind,
    uri: item.uri,
    range: isRange(selection) ? toRange(selection) : toRange(item.range as WireRange),
    ...(typeof item.containerName === 'string' && item.containerName !== '' ? { container: item.containerName } : {}),
  }
}

/**
 * Normalize an incoming/outgoing calls result. Each row pairs the far-end
 * symbol (`from` for incoming, `to` for outgoing) with its call-site ranges.
 * @param payload - the raw calls array, or `null` for no calls.
 * @param farField - `from` (incoming) or `to` (outgoing).
 * @returns one row per call.
 * @throws Error for a non-array payload or a malformed row.
 */
export function normalizeCalls(payload: unknown, farField: 'from' | 'to'): readonly LspCallRow[] {
  if (payload === null) return []
  if (!Array.isArray(payload)) throw malformedResponse('LSP call hierarchy result was not an array')
  return payload.map((entry) => {
    if (entry === null || typeof entry !== 'object') throw malformedResponse('LSP call hierarchy contained a malformed row')
    const row = entry as Record<string, unknown>
    const far = row[farField]
    if (!isCallItem(far)) throw malformedResponse('LSP call hierarchy row carried no far-end symbol')
    const spans = row[farField === 'from' ? 'fromRanges' : 'fromSpans']
    if (!Array.isArray(spans)) throw malformedResponse('LSP call hierarchy row carried no call-site ranges')
    return {
      ...toCallIdentity(far),
      callSites: spans.map((span) => {
        if (!isRange(span)) throw malformedResponse('LSP call hierarchy contained a malformed call-site range')
        return toRange(span)
      }),
    }
  })
}
