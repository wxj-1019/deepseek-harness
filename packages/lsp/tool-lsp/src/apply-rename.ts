/**
 * Host-side application of a rename plan. URI-to-path conversion, workspace
 * containment, in-memory text-edit folding, and version-guarded writes live
 * here so the `lsp` tool's schema stays plan-shaped; application is an opt-in
 * `apply` argument, never the default.
 * @module @deepseek-ai/dsh-tool-lsp/apply-rename
 */

import { join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { LspFileEdits } from '@deepseek-ai/dsh-lsp'

/** One edit inside a plan: zero-based UTF-16 half-open range plus replacement. */
export interface PlanEdit {
  readonly range: {
    readonly start: { readonly line: number; readonly character: number }
    readonly end: { readonly line: number; readonly character: number }
  }
  readonly newText: string
}

/**
 * Fold plan edits into `content`. Edits are applied end-of-document first so
 * earlier offsets stay valid; overlapping edits are rejected as ambiguous.
 * @param content - the current file content (zero-based UTF-16 coordinates).
 * @param edits - the plan's edits for one file.
 * @returns the folded content.
 * @throws Error for out-of-range or overlapping edits.
 */
export function applyTextEdits(content: string, edits: readonly PlanEdit[]): string {
  const lineStarts: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lineStarts.push(i + 1)
  }
  const offsetOf = (line: number, character: number): number => {
    if (line < 0 || line >= lineStarts.length) throw new Error(`edit line ${line} is outside the file`)
    const start = lineStarts[line]
    const lineEnd = line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : content.length
    const offset = start + character
    if (character < 0 || offset > lineEnd) throw new Error(`edit character ${character} is outside line ${line}`)
    return offset
  }
  const ordered = edits
    .map((edit, index) => {
      const start = offsetOf(edit.range.start.line, edit.range.start.character)
      const end = offsetOf(edit.range.end.line, edit.range.end.character)
      if (end < start) throw new Error('edit range ends before it starts')
      return { start, end, newText: edit.newText, index }
    })
    .sort((a, b) => b.start - a.start || b.end - a.end)
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]
    const current = ordered[i]
    if (previous === undefined || current === undefined) continue
    if (current.end > previous.start) throw new Error('plan contains overlapping edits')
  }
  let folded = content
  for (const edit of ordered) {
    folded = folded.slice(0, edit.start) + edit.newText + folded.slice(edit.end)
  }
  return folded
}

/**
 * Convert a plan URI to an absolute path contained in `workspaceRoot`.
 * @param uri - a `file:` URI from the plan.
 * @param workspaceRoot - the session workspace root.
 * @returns the absolute platform path.
 * @throws Error for non-`file:` schemes and paths outside the workspace.
 */
export function planUriToPath(uri: string, workspaceRoot: string): string {
  let path: string
  try {
    path = fileURLToPath(uri)
  } catch {
    throw new Error(`plan URI ${uri} is not a file: URI; the host only applies in-workspace file edits`)
  }
  const root = resolve(workspaceRoot)
  const abs = isAbsolute(path) ? resolve(path) : join(root, path)
  const rel = relative(root, abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`plan path ${path} is outside the session workspace`)
  }
  return abs
}

/**
 * Apply a rename plan: read every file, fold its edits, then write through the
 * version-guarded replace intent. A mid-apply write failure rolls already-
 * written files back to their pre-apply content (restores ride no signal —
 * they are bounded cleanup of this call's own partial write).
 * @param fs - the filesystem service.
 * @param plan - the normalized rename plan.
 * @param workspaceRoot - the session workspace root.
 * @param signal - aborts reads and the first write of each file; restores ride no signal.
 * @returns the applied absolute file paths in plan order.
 */
export async function applyRenamePlan(
  fs: Context['fs'],
  plan: readonly LspFileEdits[],
  workspaceRoot: string,
  signal: AbortSignal | undefined,
): Promise<{ readonly files: string[] }> {
  const prepared: { path: string; target: Awaited<ReturnType<Context['fs']['resolve']>>; version: unknown; next: string; original: string }[] = []
  for (const file of plan) {
    const path = planUriToPath(file.uri, workspaceRoot)
    const target = await fs.resolve(path, signal ? { signal } : {})
    const info = await fs.stat(target)
    if (info === undefined || info.type !== 'file') throw new Error(`${path}: not found`)
    const original = await fs.readText(target, signal)
    prepared.push({ path, target, version: info.version, next: applyTextEdits(original, file.edits), original })
  }
  const written: typeof prepared = []
  try {
    for (const entry of prepared) {
      const outcome = await fs.writeText(entry.target, entry.next, { kind: 'replaceIfVersion', version: entry.version }, signal)
      written.push(entry)
      void outcome
    }
  } catch (error) {
    const unrestored: string[] = []
    for (const entry of [...written].reverse()) {
      try {
        await fs.writeText(entry.target, entry.original, { kind: 'replaceIfVersion', version: entry.version })
      } catch {
        unrestored.push(entry.path)
      }
    }
    let message = `rename apply failed: ${(error as Error).message}; rolled back ${written.length - unrestored.length} of ${written.length} written file(s)`
    if (unrestored.length > 0) message += `; RESTORE FAILED — edited content remains in ${unrestored.join(', ')}`
    throw new Error(message)
  }
  return { files: written.map(entry => entry.path) }
}
