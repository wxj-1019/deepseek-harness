/**
 * The model-facing `ls` tool: one directory listing over `ctx.fs.listDir`,
 * directories first, with per-entry type and (when the backend reports it)
 * byte size. This package owns the model-facing schema, sorting, dotfile
 * policy, the entry cap, and formatting; the filesystem seam owns path
 * resolution and provider IO. Session-relative paths resolve against the
 * calling agent's workspace, mirroring the `read`/`write`/`edit` tools.
 * @module @deepseek-ai/dsh-tool-ls
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the ctx.fs declaration merge (the filesystem service) into this program.
import type {} from '@deepseek-ai/dsh-fs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-ls'

/** Services required by the listing tool. */
export const inject = ['tools', 'fs', 'systemPrompt']

/** Model-facing ls tool configuration. */
export interface Config {
  /** Max entries one `ls` call retains inline; later entries drop with a count note. */
  maxEntries?: number
  /** Deepest recursion `depth` may request for the tree mode (default 8). */
  maxDepth?: number
}

export const Config: z<Config> = z.object({
  maxEntries: z.number().default(500),
  maxDepth: z.number().default(8),
})

/** Validated `ls` arguments. */
export interface LsInput {
  path?: string
  all: boolean
  depth: number
}

/**
 * Validate value constraints the schema DSL can't express: a non-blank `path`
 * when given. Throws a plain `Error` (an ordinary tool argument error).
 * @param args - the schema-validated `ls` arguments.
 * @returns the accepted input.
 */
export function parseLsArgs(args: { path?: string; all?: boolean; depth?: number }): LsInput {
  if (args.path !== undefined && args.path.trim().length === 0) {
    throw new Error('path must be a non-empty string when given')
  }
  const depth = args.depth === undefined ? 0 : args.depth
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error('depth must be a non-negative integer; omit it for a flat listing')
  }
  const base = { all: args.all === true, depth }
  return args.path === undefined ? base : { path: args.path, ...base }
}

/** One formatted listing line: directories carry a trailing separator. */
export interface LsLine {
  readonly name: string
  readonly type: string
  readonly size?: number
}

/**
 * Order listing entries the way `ls` conventions do: directories first, then
 * everything else, each group name-ascending (case-insensitive). All other
 * fields pass through untouched.
 * @param entries - the provider entries in backend order.
 * @returns sorted entries, directories first.
 */
export function sortEntries<T extends { name: string; type: string }>(entries: readonly T[]): readonly T[] {
  const rank = (type: string): number => (type === 'directory' ? 0 : 1)
  return [...entries].sort((left, right) => {
    const byRank = rank(left.type) - rank(right.type)
    return byRank !== 0 ? byRank : left.name.toLowerCase().localeCompare(right.name.toLowerCase())
  })
}

/**
 * Format one listing as model-facing text: one entry per line, directories
 * with a trailing `/`, files with their byte size when the backend reports it.
 * @param entries - sorted entries.
 * @param maxEntries - the inline cap; later entries drop with a count note.
 * @returns the listing text.
 */
export function formatListing(entries: readonly { name: string; type: string; size?: number }[], maxEntries: number): string {
  if (entries.length === 0) return '(empty directory)'
  const shown = entries.slice(0, maxEntries).map((entry) => {
    const name = entry.type === 'directory' ? `${entry.name}/` : entry.name
    return entry.size === undefined ? name : `${name} (${entry.size} bytes)`
  })
  const hidden = entries.length - shown.length
  return hidden > 0 ? `${shown.join('\n')}\n\n(+${hidden} more entries not shown)` : shown.join('\n')
}

/** One tree row: the entry plus its relative path from the listed root ("src/util/x.ts"). */
export interface TreeRow {
  readonly name: string
  readonly type: string
  readonly size?: number
  readonly path: string
}

/**
 * Recursively collect a tree as flat rows carrying relative paths. The entry
 * budget counts every row; once exhausted the walk stops descending and
 * reports truncation. Depth 0 lists only the root's direct entries.
 * @param dir - the relative directory to list ('' is the root).
 * @param depth - how many levels below `dir` to descend.
 * @param all - include dot-prefixed entries.
 * @param maxEntries - the total row budget.
 * @param listDir - lists one relative directory's entries.
 * @returns the rows and whether the budget cut the walk short.
 */
export async function collectTree(
  dir: string,
  depth: number,
  all: boolean,
  maxEntries: number,
  listDir: (relativeDir: string) => Promise<readonly { name: string; type: string; size?: number }[]>,
): Promise<{ readonly rows: readonly TreeRow[]; readonly truncated: boolean }> {
  const rows: TreeRow[] = []
  let budget = maxEntries
  let truncated = false
  const walk = async (current: string, remaining: number): Promise<void> => {
    if (budget <= 0) { truncated = true; return }
    const entries = await listDir(current)
    // Breadth-first per level: list every sibling before descending into
    // directories, so a budget cut keeps the top of the tree complete.
    const dirs: string[] = []
    for (const entry of entries) {
      if (budget <= 0) { truncated = true; return }
      if (!all && entry.name.startsWith('.')) continue
      budget -= 1
      const path = current === '' ? entry.name : current + '/' + entry.name
      rows.push({
        name: entry.name,
        type: entry.type,
        ...entry.size !== undefined ? { size: entry.size } : {},
        path,
      })
      if (entry.type === 'directory' && remaining > 0) dirs.push(path)
    }
    for (const dir of dirs) await walk(dir, remaining - 1)
  }
  await walk(dir, depth)
  return { rows, truncated }
}

/** The display name for one entry (directories carry the trailing separator). */
function displayName(name: string, type: string): string {
  return type === 'directory' ? `${name}/` : name
}

/**
 * Register the `ls` tool and its system-prompt guidance.
 * @param ctx - the plugin context; registrations are effects scoped to it.
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const maxEntries = config.maxEntries ?? 500
  const maxDepth = config.maxDepth ?? 8
  ctx.systemPrompt.section({
    name: 'tool:ls',
    order: 103,
    text: 'Use the ls tool — not shell commands — to list a directory\'s entries. '
      + 'Directories render with a trailing slash; files show their byte size when available. '
      + 'Entries are capped, so prefer narrowing to a subdirectory over listing a huge tree. '
      + 'Set depth to a positive integer to recurse that many levels; rows then carry their relative path.',
  })

  const tool = defineTool({
    name: 'ls',
    description: 'List a directory\'s direct entries — subdirectories (trailing "/") and files (with byte size when '
      + `available) — sorted directories-first then by name. At most ${maxEntries} entries are returned; a larger `
      + 'directory reports how many entries were not shown. Dotfiles are hidden unless `all` is set. '
      + 'Use this to see WHAT is in a directory; use glob to find files by pattern anywhere in the tree.',
    parameters: {
      path: { type: 'string', description: 'Directory to list. Defaults to the session workspace; a relative path resolves against it.' },
      all: { type: 'boolean', description: 'Include dot-prefixed entries (e.g. ".git", ".env"). Defaults to false.' },
      depth: { type: 'number', description: 'Recurse this many levels below the listed directory (a tree); 0 or omitted lists only direct entries. Capped by the deployment maximum.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                type: { type: 'string', required: true },
                size: { type: 'number' },
                path: { type: 'string', description: 'Relative path from the listed directory (tree mode only).' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatListing(
          value.entries.map(entry => ({
            name: displayName(entry.name, entry.type),
            type: entry.type,
            ...entry.size !== undefined ? { size: entry.size } : {},
          })),
          maxEntries,
        ),
      }],
    },
    async execute(args, exec: ToolExecution) {
      const input = parseLsArgs(args)
      if (input.depth > maxDepth) {
        throw new Error(`depth ${input.depth} exceeds the deployment maximum of ${maxDepth}`)
      }
      const path = input.path ?? '.'
      const cwd = exec.agent?.session.header.cwd
      const target = await ctx.fs.resolve(path, { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })
      const listDir = async (relativeDir: string): Promise<readonly { name: string; type: string; size?: number }[]> => {
        const listed = relativeDir === ''
          ? await ctx.fs.listDir(target, exec.signal)
          : await ctx.fs.listDir(await ctx.fs.resolve(relativeDir, {
            ...(cwd !== undefined ? { cwd } : {}),
            signal: exec.signal,
          }), exec.signal)
        return input.all ? listed : listed.filter(entry => !entry.name.startsWith('.'))
      }
      if (input.depth > 0) {
        const { rows, truncated } = await collectTree('', input.depth, input.all, maxEntries, listDir)
        return { path, entries: rows.map(row => ({
          name: row.name,
          type: row.type,
          ...row.size !== undefined ? { size: row.size } : {},
          path: row.path,
        })), ...(truncated ? { truncated: true } : {}) }
      }
      const listed = await listDir('')
      const entries = sortEntries(listed).map(entry => ({
        name: entry.name,
        type: entry.type,
        ...entry.size !== undefined ? { size: entry.size } : {},
      }))
      return { path, entries }
    },
  })
  ctx.tools.register(tool)
}
