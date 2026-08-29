/**
 * Model-facing task runner: `task_list` discovers the npm scripts of the
 * session workspace's `package.json`, and `task_run` executes one through the
 * configured package manager via `ctx.shell`, reporting the exit code and a
 * bounded output tail. The shell seam owns execution, output caps, sandbox,
 * and timeouts; this package owns discovery, command construction, and the
 * model-facing report.
 * @module @deepseek-ai/dsh-tool-tasks
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the ctx.fs and ctx.shell declaration merges into this program.
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-shell'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-tasks'

/** Services required by the task tools. `shell` is read at execute time from the
 *  plugin context: the executor resolves after registration, so a hard inject
 *  would pend schema registration (the tool-catalog boot has no shell at all). */
export const inject = ['tools', 'systemPrompt', 'fs']

/** Model-facing task tool configuration. */
export interface Config {
  /** Package manager whose `run` executes scripts (e.g. `npm`, `pnpm`, `yarn`). */
  packageManager?: string
  /** Cooperative tool-call timeout budget (ms) for one `task_run`. */
  timeoutMs?: number
  /** Max characters of combined output retained in the report. */
  outputMaxChars?: number
}

export const Config: z<Config> = z.object({
  packageManager: z.string().default('npm'),
  timeoutMs: z.number().default(300_000),
  outputMaxChars: z.number().default(12_000),
})

/** The parsed script-name list, or the rejection reason. */
export type ScriptsParsed =
  | { readonly ok: true; readonly scripts: readonly string[] }
  | { readonly ok: false; readonly reason: string }

/** The result of reading the workspace package.json. */
export type PackageJsonRead =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string }

/** Extract the npm script names from a `package.json` text, in declaration order. */
export function parseScripts(packageJsonText: string): ScriptsParsed {
  let parsed: unknown
  try {
    parsed = JSON.parse(packageJsonText)
  } catch {
    return { ok: false, reason: 'package.json is not valid JSON' }
  }
  const scripts = (parsed as { scripts?: unknown }).scripts
  if (scripts === undefined || scripts === null) return { ok: true, scripts: [] }
  if (typeof scripts !== 'object' || Array.isArray(scripts)) return { ok: false, reason: 'package.json scripts is not an object' }
  return { ok: true, scripts: Object.keys(scripts) }
}

/** The tail of a text: the LAST `maxChars` characters, with a truncation note. */
export function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `…(truncated)\n${text.slice(-maxChars)}`
}

/**
 * Register the `task_list` and `task_run` tools.
 * @param ctx - the plugin context; registrations are effects scoped to it.
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const packageManager = config.packageManager ?? 'npm'
  const timeoutMs = config.timeoutMs ?? 300_000
  const outputMaxChars = config.outputMaxChars ?? 12_000

  ctx.systemPrompt.section({
    name: 'tool:tasks',
    order: 105,
    text: 'Use task_list to discover the npm scripts of the session workspace, and task_run to run one through '
      + `the configured package manager (${packageManager}) instead of composing shell commands. task_run reports `
      + 'the exit code and a bounded combined-output tail; a nonzero exit is a normal report, not a transport failure.',
  })

  const readWorkspacePackageJson = async (exec: ToolExecution): Promise<PackageJsonRead> => {
    const cwd = exec.agent?.session.header.cwd
    try {
      const target = await ctx.fs.resolve('package.json', { ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })
      return { ok: true, text: await ctx.fs.readText(target, exec.signal) }
    } catch {
      return { ok: false, reason: 'no package.json in the session workspace (or it could not be read)' }
    }
  }

  const listTool = defineTool({
    name: 'task_list',
    description: 'List the npm scripts defined in the session workspace\'s package.json — the runnable task names for task_run.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { scripts: { type: 'array', required: true, items: { type: 'string' } } },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.scripts.length === 0 ? 'No npm scripts defined.' : value.scripts.join('\n'),
      }],
    },
    async execute(args, exec: ToolExecution) {
      void args
      const file = await readWorkspacePackageJson(exec)
      if (!file.ok) return { scripts: [] }
      const parsed = parseScripts(file.text)
      if (!parsed.ok) throw new Error(parsed.reason)
      return { scripts: [...parsed.scripts] }
    },
  })
  ctx.tools.register(listTool)

  const runTool = defineTool({
    name: 'task_run',
    description: `Run one npm script from the session workspace's package.json through ${packageManager}. `
      + 'Reports the exit code and a bounded combined-output tail (stdout, then stderr). '
      + 'A nonzero exit is reported as a normal result — read the tail to diagnose it.',
    parameters: {
      script: { type: 'string', required: true, description: 'The npm script name to run (see task_list).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          script: { type: 'string', required: true },
          exitCode: { type: 'number', required: true },
          output: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: tail(`script: ${value.script}\nexit code: ${value.exitCode}\n\n${value.output}`, outputMaxChars),
      }],
    },
    async execute(args, exec: ToolExecution) {
      const script = args.script
      if (typeof script !== 'string' || script.trim().length === 0 || /[^A-Za-z0-9:@_./-]/.test(script)) {
        throw new Error('script must be a non-empty npm script name (letters, digits, :, @, _, ., /, -)')
      }
      const cwd = exec.agent?.session.header.cwd
      // Execute-time lookup: the shell executor provisions after registration.
      const result = await ctx.shell.run(ctx.shell.resolve({
        command: `${packageManager} run ${script}`,
        ...(cwd !== undefined ? { workdir: cwd } : {}),
        timeoutMs,
        signal: exec.signal,
      }))
      const combined = tail(`${result.stdout.text}${result.stderr.text.length > 0 ? `\n${result.stderr.text}` : ''}`, outputMaxChars)
      return { script, exitCode: result.exitCode ?? -1, output: combined }
    },
  })
  ctx.tools.register(runTool)
}
