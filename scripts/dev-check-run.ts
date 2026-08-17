/**
 * Dev-check gate wrapper: runs the wrapped command only when the named
 * dev-check toggle is enabled in the local settings document (see
 * scripts/dev-checks.ts). Wired into the routine entry points in
 * package.json (`test:e2e`, `test:coverage`, `test:snapshot`, `doc-sync`) and
 * the lefthook pre-push job; a disabled gate prints a skip notice and exits 0.
 * Explicit full entry points (`check:all`, `test:snapshot:record/refresh`)
 * never go through this wrapper.
 *
 * Usage: `tsx scripts/dev-check-run.ts <check> -- <command...>`.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEV_CHECK_KEYS,
  findDevChecksDocument,
  isDevCheckEnabled,
  type DevCheckKey,
} from './dev-checks.ts'

const root = resolve(import.meta.dirname, '..')

/** A parsed wrapper invocation: the gate key plus the command to run when enabled. */
export interface DevCheckInvocation {
  /** The dev-check toggle guarding the command. */
  key: DevCheckKey
  /** Executable of the wrapped command. */
  command: string
  /** Arguments of the wrapped command. */
  args: string[]
}

const USAGE = `usage: tsx scripts/dev-check-run.ts <${DEV_CHECK_KEYS.join('|')}> -- <command...>`

/**
 * Parse the wrapper argv.
 * @param argv - argv after the script path: `<check> -- <command...>`.
 * @returns the parsed invocation.
 * @throws on a missing or unknown check key, a missing `--` separator, or an empty command.
 */
export function parseInvocation(argv: readonly string[]): DevCheckInvocation {
  const [key, separator, ...command] = argv
  if (key === undefined) throw new Error(`dev-check-run: missing check key. ${USAGE}`)
  if (!DEV_CHECK_KEYS.includes(key as DevCheckKey)) {
    throw new Error(`dev-check-run: unknown check key ${JSON.stringify(key)}; expected one of ${DEV_CHECK_KEYS.join(', ')}.`)
  }
  if (separator !== '--' || command.length === 0) {
    throw new Error(`dev-check-run: expected "--" followed by the wrapped command. ${USAGE}`)
  }
  const [executable, ...args] = command as [string, ...string[]]
  return { key: key as DevCheckKey, command: executable, args }
}

/**
 * Build the skip notice printed when a gate is switched off.
 * @param key - the disabled gate.
 * @param invocation - the wrapped command, rendered for the notice.
 * @param documentDisplay - symbolic settings-document path, when one was found.
 * @returns the single-line notice.
 */
export function formatSkipNotice(key: DevCheckKey, invocation: string, documentDisplay: string | undefined): string {
  const source = documentDisplay ?? '$DSH_HOME/settings.yaml'
  return `dev-checks: "${key}" is off in ${source}; skipped: ${invocation} (local-only switch — CI and explicit full runs always run the gate)`
}

/** Windows cmd re-parses the command line; only whitespace-bearing tokens need quotes. */
function quoteToken(token: string): string {
  return /\s/.test(token) ? JSON.stringify(token) : token
}

/**
 * Execute the wrapper and report the process exit code without setting it.
 * @param argv - argv after the script path.
 * @param env - environment used for the toggle read; the child inherits the real process environment.
 * @returns the exit code the entry point should adopt.
 */
export function main(argv: readonly string[], env: Record<string, string | undefined> = process.env): number {
  let invocation: DevCheckInvocation
  try {
    invocation = parseInvocation(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  if (!isDevCheckEnabled(invocation.key, env)) {
    console.log(formatSkipNotice(
      invocation.key,
      [invocation.command, ...invocation.args].join(' '),
      findDevChecksDocument(env)?.display,
    ))
    return 0
  }

  // Node refuses to spawn Windows `.cmd` shims directly, so Windows re-parses
  // a quoted command line through cmd.exe; POSIX executes the extensionless
  // shim found on PATH (node_modules/.bin inside pnpm scripts).
  const result = process.platform === 'win32'
    ? spawnSync([invocation.command, ...invocation.args].map(quoteToken).join(' '), [], { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync(invocation.command, invocation.args, { cwd: root, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.signal !== null) process.kill(process.pid, result.signal)
  return result.status ?? 1
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
