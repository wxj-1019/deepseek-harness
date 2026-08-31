/**
 * Pure formatting and coordinate conversion for the `lsp` tool: one-based↔zero-based UTF-16 cursor
 * conversion, workspace-grouped location rendering with `file:`-URI resolution, complete-result
 * capping, and UI presentation. No I/O — a UI may call the presenter on live streaming and on
 * replay, so it depends only on the tool arguments.
 * @module @deepseek-ai/dsh-tool-lsp/render
 */

import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type { LspDiagnostic, LspHover, LspLocation, LspOperation, LspPosition } from '@deepseek-ai/dsh-lsp'
import type { LspCallRow, LspFileEdits, LspSymbolInfo } from '@deepseek-ai/dsh-lsp'
import { posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The eight operations the tool exposes, as a runtime tuple for schema enum + validation. */
export const LSP_OPERATIONS: readonly LspOperation[] = [
  'goToDefinition', 'findReferences', 'goToImplementation', 'hover',
  'documentSymbol', 'workspaceSymbol', 'diagnostics', 'rename', 'formatting',
  'incomingCalls', 'outgoingCalls',
]

/** Operations anchored to a cursor position. */
const CURSOR_OPERATIONS: readonly LspOperation[] = ['goToDefinition', 'findReferences', 'goToImplementation', 'hover', 'rename']

/** Whether the operation requires a cursor position. */
export function isCursorOperation(operation: LspOperation): boolean {
  return CURSOR_OPERATIONS.includes(operation)
}

/** Whether the operation reads a whole file without a cursor. */
export function isFileOperation(operation: LspOperation): boolean {
  return operation === 'documentSymbol' || operation === 'diagnostics'
}

/** LSP SymbolKind numbers for the names the outline view renders. */
const SYMBOL_KIND_NAMES: readonly string[] = [
  'File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property', 'Field',
  'Constructor', 'Enum', 'Interface', 'Function', 'Variable', 'Constant', 'String',
  'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember', 'Struct',
  'Event', 'Operator', 'TypeParameter',
]

/** The display name for a numeric SymbolKind, falling back to the number. */
export function symbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind - 1] ?? String(kind)
}

/** Default cap on rendered locations before an omission marker is appended. */
export const DEFAULT_MAX_LOCATIONS = 100

/** Default cap on the complete rendered tool result, including truncation metadata. */
export const DEFAULT_MAX_RESULT_CHARS = 16_000

/** The cursor operations. */
type CursorOperation = Extract<LspOperation, 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'>

/** Validated `lsp` arguments after per-operation checks: a discriminated union. */
export type LspToolInput =
  | { readonly operation: CursorOperation; readonly filePath: string; readonly position: LspPosition }
  | { readonly operation: 'documentSymbol' | 'diagnostics' | 'formatting'; readonly filePath: string }
  | { readonly operation: 'incomingCalls' | 'outgoingCalls'; readonly filePath: string; readonly position: LspPosition }
  | { readonly operation: 'workspaceSymbol'; readonly query: string }
  | { readonly operation: 'rename'; readonly filePath: string; readonly position: LspPosition; readonly newName: string; readonly apply: boolean }

/** The raw, schema-typed argument shape (line/character only for cursor operations). */
export interface LspToolArgs {
  readonly operation: string
  readonly file_path?: string
  readonly line?: number
  readonly character?: number
  readonly query?: string
  readonly new_name?: string
}

/**
 * Validate and convert model arguments: `operation` must be one of the four; `line`/`character` are
 * positive one-based integers converted to the seam's zero-based position.
 * @param args - the schema-validated raw arguments.
 * @returns the validated input with a zero-based position.
 * @throws Error when the operation is unknown or a coordinate is not a positive integer.
 */
export function parseLspArgs(args: LspToolArgs): LspToolInput {
  if (!isOperation(args.operation)) {
    throw new Error(`operation must be one of ${LSP_OPERATIONS.join(', ')}`)
  }
  const operation = args.operation
  // Per-operation validation: cursor operations need a file and one-based
  // coordinates; outline and diagnostics need only the file; the workspace
  // search needs query text; rename needs a file, position, and new name.
  if (isCursorOperation(operation)) {
    if (args.file_path === undefined || args.file_path.trim().length === 0) {
      throw new Error('file_path must be a non-empty string')
    }
    return { operation, filePath: args.file_path, position: toPosition(args) } as LspToolInput
  }
  if (operation === 'documentSymbol' || operation === 'diagnostics') {
    if (args.file_path === undefined || args.file_path.trim().length === 0) {
      throw new Error('file_path must be a non-empty string')
    }
    return { operation, filePath: args.file_path } as LspToolInput
  }
  if (operation === 'workspaceSymbol') {
    if (args.query === undefined || args.query.trim().length === 0) {
      throw new Error('query must be a non-empty string for workspaceSymbol')
    }
    return { operation, query: args.query } as LspToolInput
  }
  if (args.file_path === undefined || args.file_path.trim().length === 0) {
    throw new Error('file_path must be a non-empty string')
  }
  return {
    operation,
    filePath: args.file_path,
    position: toPosition(args),
    newName: args.new_name ?? '',
    apply: args.apply === true,
  } as LspToolInput
}

/** Whether a string is one of the operations. */
function isOperation(value: string): value is LspOperation {
  return (LSP_OPERATIONS as readonly string[]).includes(value)
}

/** Validate a one-based coordinate is a positive integer. */
function oneBased(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer (one-based)`)
  }
  return value
}

/** Convert one-based model coordinates to the seam's zero-based position. */
function toPosition(args: LspToolArgs): LspPosition {
  if (args.line === undefined || args.character === undefined) {
    throw new Error('line and character are required for this operation')
  }
  return { line: oneBased(args.line, 'line') - 1, character: oneBased(args.character, 'character') - 1 }
}

/**
 * Render a locations result grouped by file, converting each zero-based location back to a one-based
 * `path:line:character` entry. A `file:` URI inside the workspace becomes a workspace-relative path;
 * outside it, a URI-derived absolute path; a non-`file:` URI is kept verbatim. Applies `maxLocations` and
 * appends an omission marker when it truncates by count, then applies the complete result cap.
 * @param locations - the seam's locations (possibly empty).
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @param maxLocations - the cap before truncation.
 * @param maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns the rendered text; a distinct no-result line when there are none.
 */
export function formatLocations(
  locations: readonly LspLocation[],
  workspaceUri: string,
  maxLocations: number,
  maxResultChars: number,
): string {
  if (locations.length === 0) return boundResult('No results.', maxResultChars, 'locations')
  const shown = locations.slice(0, maxLocations)
  const omitted = locations.length - shown.length
  const grouped = new Map<string, string[]>()
  for (const location of shown) {
    const path = renderUri(location.uri, workspaceUri)
    const line = location.range.start.line + 1
    const character = location.range.start.character + 1
    const entries = grouped.get(path) ?? []
    entries.push(`${path}:${line}:${character}`)
    grouped.set(path, entries)
  }
  const lines: string[] = []
  for (const entries of grouped.values()) lines.push(...entries)
  if (omitted > 0) {
    lines.push(`… ${omitted} more location${omitted === 1 ? '' : 's'} omitted (limit ${maxLocations}).`)
  }
  return boundResult(lines.join('\n'), maxResultChars, 'locations')
}

/**
 * Render a hover result, applying `maxResultChars` last and keeping its marker within the cap.
 * @param hover - the normalized hover, or `null` for no hover.
 * @param maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns the rendered hover text; a distinct no-result line for `null`.
 */
export function formatHover(hover: LspHover | null, maxResultChars: number): string {
  const text = hover === null ? 'No hover information.' : hover.contents
  return boundResult(text, maxResultChars, 'hover')
}

/** Bound a complete rendered result, including the truncation notice itself. */
function boundResult(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text
  const notice = `\n… ${label} truncated (limit ${maxChars} characters).`
  if (notice.length >= maxChars) return notice.slice(0, maxChars)
  return `${text.slice(0, maxChars - notice.length)}${notice}`
}

/**
 * Resolve a location URI without applying the harness host's path rules. A valid `file:` URI becomes
 * workspace-relative when it is under the provider's canonical workspace URI, or a URI-derived
 * absolute path otherwise; malformed and non-`file:` URIs remain verbatim.
 * @param uri - the target URI from the seam.
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @returns the display path or the verbatim URI.
 */
export function renderUri(uri: string, workspaceUri: string): string {
  if (!uri.startsWith('file:')) return uri
  let target: URL
  let workspace: URL
  try {
    target = new URL(uri)
    workspace = new URL(workspaceUri)
  } catch {
    return uri
  }
  if (workspace.protocol !== 'file:') return uri
  // A `file:` URI does not carry its world's OS, so a leading `/X:` segment is
  // read as a Windows drive. A POSIX workspace literally rooted at `/c:/...`
  // would mis-render (display only; edits and reads use the exact URI).
  const drivePath = /^\/[a-z](?::|%3A)/iu
  const windowsWorld = workspace.hostname.length > 0 || drivePath.test(workspace.pathname)
  const targetWindowsWorld = windowsWorld && (target.hostname.length > 0 || drivePath.test(target.pathname))
  const workspacePath = filePath(workspace, windowsWorld)
  const targetPath = filePath(target, targetWindowsWorld)
  if (workspacePath === undefined || targetPath === undefined) return uri
  if (windowsWorld !== targetWindowsWorld) return targetPath
  const path = windowsWorld ? win32 : posix
  const relative = path.relative(workspacePath, targetPath)
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  const rendered = relative === '' ? '.' : outside ? targetPath : relative
  return windowsWorld ? rendered.replaceAll('\\', '/') : rendered
}

/** Decode a file URL for its execution world while containing malformed URL failures. */
function filePath(url: URL, windows: boolean): string | undefined {
  try {
    const path = fileURLToPath(url, { windows })
    return path.includes('\0') ? undefined : path
  } catch {
    // `fileURLToPath` rejects malformed escapes, authorities, and encoded path separators.
    return undefined
  }
}

/**
 * UI presentation for a pending `lsp` call. Uses a generic search card; the title carries the
 * operation and one-based cursor, and `locations` focuses the queried line. The shared location
 * shape has no character, so the title preserves the column.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export function presentLspCall(args: LspToolArgs): GenericCallView {
  return {
    card: 'generic',
    kind: 'search',
    title: `LSP ${args.operation} ${args.file_path ?? ''}${args.query !== undefined ? ` "${args.query}"` : ''}${args.line !== undefined && args.character !== undefined ? `:${args.line}:${args.character}` : ''}`,
    locations: [{ path: args.file_path ?? '', line: args.line ?? 0 }],
  }
}

/**
 * Render symbol rows (outline or workspace search), one `path:line:col name (Kind)` line per row,
 * applying `maxLocations` and `maxResultChars` like formatLocations.
 * @param symbols - the flattened symbol rows.
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @param maxLocations - cap before an omission marker.
 * @param maxResultChars - complete rendered-text cap.
 * @returns the rendered symbol list.
 */
export function formatSymbols(
  symbols: readonly LspSymbolInfo[],
  workspaceUri: string,
  maxLocations: number,
  maxResultChars: number,
): string {
  if (symbols.length === 0) return boundResult('No symbols found.', maxResultChars, 'symbols')
  const shown = symbols.slice(0, maxLocations)
  const omitted = symbols.length - shown.length
  const lines = shown.map((symbol) => {
    const path = renderUri(symbol.uri, workspaceUri)
    const line = symbol.range.start.line + 1
    const character = symbol.range.start.character + 1
    const where = `${path}:${line}:${character}`
    const container = 'container' in symbol && typeof symbol.container === 'string' ? `${symbol.container}.` : ''
    return `${where} ${container}${symbol.name} (${symbolKindName(symbol.kind)})`
  })
  if (omitted > 0) lines.push(`… ${omitted} more symbol${omitted === 1 ? '' : 's'} omitted (limit ${maxLocations}).`)
  return boundResult(lines.join('\n'), maxResultChars, 'symbols')
}

/**
 * Render pulled diagnostics, one `path:line:col [severity] message (source)` line per row, with the
 * same caps as formatSymbols.
 * @param diagnostics - the pulled diagnostics.
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @param maxLocations - cap before an omission marker.
 * @param maxResultChars - complete rendered-text cap.
 * @returns the rendered diagnostic list.
 */
export function formatDiagnostics(
  diagnostics: readonly LspDiagnostic[],
  workspaceUri: string,
  maxLocations: number,
  maxResultChars: number,
): string {
  if (diagnostics.length === 0) return boundResult('No diagnostics.', maxResultChars, 'diagnostics')
  const severityNames = ['error', 'warning', 'information', 'hint']
  const shown = diagnostics.slice(0, maxLocations)
  const omitted = diagnostics.length - shown.length
  const lines = shown.map((diagnostic) => {
    const path = renderUri(uriOf(diagnostic), workspaceUri)
    const line = diagnostic.range.start.line + 1
    const character = diagnostic.range.start.character + 1
    const severity = severityNames[(diagnostic.severity ?? 1) - 1] ?? String(diagnostic.severity)
    const source = diagnostic.source !== undefined ? ` (${diagnostic.source})` : ''
    return `${path}:${line}:${character} ${severity}: ${diagnostic.message}${source}`
  })
  if (omitted > 0) lines.push(`… ${omitted} more diagnostic${omitted === 1 ? '' : 's'} omitted (limit ${maxLocations}).`)
  return boundResult(lines.join('\n'), maxResultChars, 'diagnostics')
}

/** The document URI of one diagnostic row. */
function uriOf(diagnostic: LspDiagnostic): string {
  return (diagnostic as unknown as { uri: string }).uri
}

/**
 * Render a rename plan: one line per file with its edit count, then each edit as
 * `line:col newText`.
 * @param plan - the per-file rename edits.
 * @param workspaceUri - the provider's canonical workspace `file:` URI.
 * @param maxResultChars - complete rendered-text cap.
 * @returns the rendered rename plan.
 */
export function formatWorkspaceEdit(plan: readonly LspFileEdits[], workspaceUri: string, maxResultChars: number): string {
  const lines: string[] = []
  for (const file of plan) {
    const path = renderUri(file.uri, workspaceUri)
    lines.push(`${path}:`)
    for (const edit of file.edits) {
      const line = edit.range.start.line + 1
      const character = edit.range.start.character + 1
      const text = edit.newText.includes('\n') ? edit.newText.replace(/\n/g, '\\n') : edit.newText
      lines.push(`  ${line}:${character} -> ${text}`)
    }
  }
  return boundResult(lines.join('\n'), maxResultChars, 'rename')
}

/**
 * Render call-hierarchy rows: one line per call with its first call site and
 * the total site count, bounded like every other renderer.
 * @param calls - the normalized call rows.
 * @param workspaceUri - the provider's canonical workspace URI for relativizing.
 * @param maxLocations - largest number of rows before an omission marker.
 * @param maxResultChars - largest rendered result in characters.
 * @returns the rendered call list.
 */
export function formatCalls(
  calls: readonly LspCallRow[],
  workspaceUri: string,
  maxLocations: number,
  maxResultChars: number,
): string {
  if (calls.length === 0) return boundResult('No calls found.', maxResultChars, 'calls')
  const shown = calls.slice(0, maxLocations)
  const omitted = calls.length - shown.length
  const lines = shown.map((call) => {
    const first = call.callSites[0]
    const where = first === undefined
      ? renderUri(call.uri, workspaceUri)
      : `${renderUri(call.uri, workspaceUri)}:${first.start.line + 1}:${first.start.character + 1}`
    const container = call.container !== undefined ? `${call.container}.` : ''
    return `${where} ${container}${call.name} — ${call.callSites.length} call site(s)`
  })
  if (omitted > 0) lines.push(`(+${omitted} more calls omitted)`)
  return boundResult(lines.join('\n'), maxResultChars, 'calls')
}
