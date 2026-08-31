/**
 * Model-facing structured `git` tool. ONE tool with an `action` enum over the
 * ordinary `git` CLI, executed through `ctx.shell` in the session workspace:
 *
 * - reads: `status` (porcelain v1 + branch head), `diff`, `log`, `show`, `branch` (list);
 * - local writes: `add`, `commit` (message rides stdin, never a shell quote), `checkout` (ref), `stash` (push/pop/list);
 * - network: `push` / `pull` / `fetch`, registered only when the deployment sets `network: true`.
 *
 * The model never sees raw argv: this module validates every ref and path
 * against a strict metacharacter ban, commits pass `-F -` with the message on
 * stdin, and destructive `restore`/`checkout` of tracked changes require the
 * deployment's explicit `allowDiscard`. The shell seam owns execution, output
 * caps, sandboxing, and timeouts.
 * @module @deepseek-ai/dsh-tool-git
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the ctx.shell declaration merge into this program.
import type {} from '@deepseek-ai/dsh-shell'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-git'

/** Services required by the git tool. `shell` is read at execute time from the
 *  plugin context (the executor provisions after registration; a hard inject
 *  would pend schema registration where no shell is mounted at all). */
export const inject = ['tools', 'systemPrompt']

/** Every git action the tool accepts. */
export type GitAction =
  | 'status' | 'diff' | 'log' | 'show' | 'branch'
  | 'add' | 'commit' | 'checkout' | 'restore' | 'stash'
  | 'push' | 'pull' | 'fetch'

/** Model-facing git tool configuration. */
export interface Config {
  /** Register the network actions (`push`, `pull`, `fetch`). Defaults to false. */
  network?: boolean
  /** Allow `restore` / `checkout` to DISCARD tracked working-tree changes. Defaults to false. */
  allowDiscard?: boolean
  /** Entries one `log` returns by default. */
  logMaxCount?: number
  /** Cooperative tool-call timeout budget (ms). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  network: z.boolean().default(false),
  allowDiscard: z.boolean().default(false),
  logMaxCount: z.number().default(20),
  timeoutMs: z.number().default(120_000),
})

/** One constructed git invocation: the shell command plus optional stdin. */
export interface GitCommand {
  readonly command: string
  readonly stdin?: string
}

/** The model-facing parameters, validated per action. */
export interface GitRequest {
  readonly action: GitAction
  readonly paths: readonly string[]
  readonly message?: string
  readonly ref?: string
  readonly staged: boolean
}

/** Characters that must never appear in a model-supplied ref or path. */
const METACHARS = /[`$;&|<>{}[\]!*"\\\s]/

/**
 * Validate one model-supplied ref or path: non-blank, no metacharacters, and
 * no leading dash or tilde (a flag or home-expansion can never hide in a value).
 * @param value - the raw value.
 * @returns the validated value.
 * @throws Error when the value is blank, carries a metacharacter, or starts with a dash or tilde.
 */
export function validateRef(value: string): string {
  if (value.trim().length === 0) throw new Error('ref/path must be a non-empty string')
  if (value.startsWith('-') || value.startsWith('~')) {
    throw new Error(`ref/path must not start with a dash or tilde: ${value}`)
  }
  if (METACHARS.test(value)) throw new Error(`ref/path must not contain shell metacharacters: ${value}`)
  return value
}

/**
 * Build the shell command (and optional stdin) for one git action. The commit
 * message rides stdin through `-F -` so no quoting layer ever sees it.
 * @param request - the validated request.
 * @param caps - the resolved tool capabilities (log count, discard and network gates).
 * @returns the git invocation.
 * @throws Error when the action is not registered under the deployment's gates.
 */
export function buildGitCommand(request: GitRequest, caps: { logMaxCount: number; allowDiscard: boolean; network: boolean }): GitCommand {
  const { action, paths, staged } = request
  switch (action) {
    case 'status':
      return { command: 'git status --porcelain=v1 -b' }
    case 'diff': {
      const refs = paths.map(validateRef)
      const spec = refs.length > 0 ? ` -- ${refs.join(' ')}` : ''
      return { command: `git diff --numstat${staged ? ' --cached' : ''}${spec}` }
    }
    case 'log':
      return { command: `git log --oneline -n ${caps.logMaxCount}` }
    case 'show':
      return { command: `git show --stat ${validateRef(request.ref ?? 'HEAD')}` }
    case 'branch':
      return { command: 'git branch --list' }
    case 'add':
      if (paths.length === 0) throw new Error('add requires at least one path')
      return { command: `git add -- ${paths.map(validateRef).join(' ')}` }
    case 'commit': {
      if (request.message === undefined || request.message.trim().length === 0) {
        throw new Error('commit requires a non-empty message')
      }
      return { command: 'git commit -F -', stdin: request.message }
    }
    case 'checkout':
      if (request.ref === undefined) throw new Error('checkout requires a ref')
      if (paths.length === 0) return { command: `git checkout ${validateRef(request.ref)}` }
      if (!caps.allowDiscard) throw new Error('checkout with paths discards tracked changes; the deployment has not allowed discard')
      return { command: `git checkout -- ${paths.map(validateRef).join(' ')}` }
    case 'restore':
      if (!caps.allowDiscard) throw new Error('restore discards tracked working-tree changes; the deployment has not allowed discard (allowDiscard)')
      if (paths.length === 0) throw new Error('restore requires at least one path')
      return { command: `git restore -- ${paths.map(validateRef).join(' ')}` }
    case 'stash':
      return { command: request.ref === 'pop' ? 'git stash pop' : 'git stash push' }
    case 'push':
    case 'pull':
    case 'fetch':
      if (!caps.network) throw new Error(`${action} is a network action; enable the deployment's network gate to use it`)
      return { command: `git ${action}${request.ref !== undefined ? ` ${validateRef(request.ref)}` : ''}` }
    default: {
      throw new Error(`unsupported git action: ${String(action)}`)
    }
  }
}

/** One parsed `git status --porcelain` entry. */
export interface StatusEntry {
  readonly index: string
  readonly worktree: string
  readonly path: string
}

/**
 * Parse `git status --porcelain=v1` lines (XY + space + path) into entries;
 * the `-b` branch head line is dropped.
 * @param text - the raw status output.
 * @returns the parsed entries.
 */
export function parseStatusPorcelain(text: string): readonly StatusEntry[] {
  return text.split('\n').flatMap((line) => {
    if (line.length < 4 || line.startsWith('##')) return []
    const index = line[0] ?? ' '
    const worktree = line[1] ?? ' '
    return [{ index, worktree, path: line.slice(3) }]
  })
}

/** One parsed `git log --oneline` row. */
export interface CommitEntry {
  readonly hash: string
  readonly subject: string
}

/**
 * Parse `git log --oneline` lines (hash + space + subject) into rows.
 * @param text - the raw log output.
 * @returns the parsed commits in server order (newest first).
 */
export function parseLogOneline(text: string): readonly CommitEntry[] {
  return text.split('\n').flatMap((line) => {
    const at = line.indexOf(' ')
    if (at <= 0) return []
    return [{ hash: line.slice(0, at), subject: line.slice(at + 1) }]
  })
}

/** One parsed `git diff --numstat` row; binary files carry null counts. */
export interface NumstatEntry {
  readonly path: string
  readonly additions: number | null
  readonly deletions: number | null
}

/**
 * Parse `git diff --numstat` rows (additions TAB deletions TAB path).
 * @param text - the raw numstat output.
 * @returns one entry per changed file.
 */
export function parseNumstat(text: string): readonly NumstatEntry[] {
  return text.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    const parts = line.split('\t')
    if (parts.length < 3) return []
    const toCount = (value: string | undefined): number | null => value === '-' || value === undefined ? null : Number(value)
    return [{ path: parts.slice(2).join('\t'), additions: toCount(parts[0]), deletions: toCount(parts[1]) }]
  })
}
/** Register the `git` tool. */
export function apply(ctx: Context, config: Config): void {
  const caps = {
    network: config.network === true,
    allowDiscard: config.allowDiscard === true,
    logMaxCount: config.logMaxCount ?? 20,
  }
  const timeoutMs = config.timeoutMs ?? 120_000
  const gates = [
    caps.network ? undefined : 'network actions (push/pull/fetch) are disabled',
    caps.allowDiscard ? undefined : 'discard (restore / checkout-with-paths) is disabled',
  ].filter(Boolean).join('; ')

  ctx.systemPrompt.section({
    name: 'tool:git',
    order: 105,
    text: 'Use the git tool — not shell git — for repository operations: status/diff/log/show/branch to read, '
      + 'add/commit/checkout/stash to act. Every path and ref is validated (no shell metacharacters), commit '
      + 'messages ride stdin, and output is porcelain or bounded text.'
      + (gates.length > 0 ? ` This deployment disables: ${gates}.` : ''),
  })

  const tool = defineTool({
    name: 'git',
    description: 'Run a structured git operation in the session workspace. Actions: status (porcelain + branch), '
      + 'diff (working tree, or --cached with staged), log (oneline, newest first), show (a ref with stat), branch (list), '
      + 'add (stage paths), commit (message via stdin), checkout (a ref, or paths to discard when allowed), restore '
      + '(discard tracked changes when allowed), stash (push, or pop with ref="pop")'
      + (caps.network ? ', push, pull, fetch.' : '. Network actions (push/pull/fetch) are disabled in this deployment.'),
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'The git operation. One of: status, diff, log, show, branch, add, commit, checkout, restore, stash'
          + (caps.network ? ', push, pull, fetch.' : '.'),
      },
      paths: { type: 'array', items: { type: 'string' }, description: 'Paths for add / restore / checkout-with-paths / diff. No whitespace or shell metacharacters (quoting is unnecessary: values pass as plain arguments).' },
      message: { type: 'string', description: 'Commit message (commit only); rides stdin, never a shell quote.' },
      ref: { type: 'string', description: 'A ref for show / checkout / push / pull / fetch, or "pop" for stash.' },
      staged: { type: 'boolean', description: 'diff the staged index instead of the working tree. Defaults to false.' },
    },
    timeoutMs,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          exitCode: { type: 'number', required: true },
          output: { type: 'string', required: true },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'string', required: true },
                worktree: { type: 'string', required: true },
                path: { type: 'string', required: true },
              },
            },
          },
          commits: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                hash: { type: 'string', required: true },
                subject: { type: 'string', required: true },
              },
            },
          },
          files: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                additions: { oneOf: [{ type: 'number' }, { type: 'null' }] },
                deletions: { oneOf: [{ type: 'number' }, { type: 'null' }] },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.output.length === 0
          ? `${value.action}: ok (no output)`
          : value.output,
      }],
    },
    async execute(args, exec: ToolExecution) {
      const action = args.action as GitAction
      const request: GitRequest = {
        action,
        paths: Array.isArray(args.paths) ? args.paths.map(String) : [],
        ...(typeof args.message === 'string' ? { message: args.message } : {}),
        ...(typeof args.ref === 'string' ? { ref: args.ref } : {}),
        staged: args.staged === true,
      }
      const command = buildGitCommand(request, caps)
      const cwd = exec.agent?.session.header.cwd
      const result = await ctx.shell.run(ctx.shell.resolve({
        command: command.command,
        ...(cwd !== undefined ? { workdir: cwd } : {}),
        ...(command.stdin !== undefined ? { stdin: command.stdin } : {}),
        timeoutMs,
        signal: exec.signal,
      }))
      const output = [result.stdout.text, result.stderr.text].filter(part => part.length > 0).join('\n')
      // Annotation keeps the conditional spread free of `prop?: never` union
      // members, which exactOptionalPropertyTypes rejects against the output type.
      // The parsed rows are copied into mutable arrays: the output type's
      // inferred element objects are mutable while the parsed interfaces are readonly.
      const structured: {
        entries: StatusEntry[]
        commits: CommitEntry[]
        files: NumstatEntry[]
      } = {
        entries: action === 'status' ? [...parseStatusPorcelain(result.stdout.text)] : [],
        commits: action === 'log' ? [...parseLogOneline(result.stdout.text)] : [],
        files: action === 'diff' ? [...parseNumstat(result.stdout.text)] : [],
      }
      return { action, exitCode: result.exitCode ?? -1, output, ...structured }
    },
  })
  ctx.tools.register(tool)
}
