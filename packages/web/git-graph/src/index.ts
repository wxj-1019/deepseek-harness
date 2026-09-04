/**
 * Git commit-history reading for the web UI: a `/git-graph/api` prefix route
 * serving parent-aware log rows and branch names. The route is read-only by
 * construction — no command in this surface mutates a repository — so a web
 * client can render the commit rail without any model tool involvement.
 *
 * Git runs through a direct `spawn('git', …)` rather than the shell seam: the
 * seam wraps every command in an interactive shell (PowerShell on Windows),
 * whose ~1–2 s cold start dominates a UI request that git itself serves in
 * milliseconds. There is no injection surface — the argv is a fixed template
 * plus a validated absolute `cwd` — and the spawn carries its own timeout and
 * output caps.
 */
import { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import type { IncomingMessage } from 'node:http'
import { isAbsolute } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the ctx.sessionController declaration merge into this program.
import type {} from '@deepseek-ai/dsh-api-session-controller'
// The local import is required: the type-only re-export below does not create
// a module-scope binding, and GraphLogPage's entries field names it locally.
import type { GraphLogEntry } from './parse.ts'
import { GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from './parse.ts'

export type { GraphLogEntry } from './parse.ts'
export { GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from './parse.ts'

export const name = 'git-graph'

/** Services required by this plugin. */
export const inject = ['webServer', 'sessionController']

/** Default history page size (mirrors the web panel's lazy paging). */
export const DEFAULT_LOG_COUNT = 30

/** Upper bound on one history page, so a request can never flood the UI. */
export const MAX_LOG_COUNT = 200

/** Per-request git timeout and captured-stdout budget. */
const GIT_TIMEOUT_MS = 30_000
const GIT_STDOUT_MAX_BYTES = 4 * 1024 * 1024

/** Route method and body shape of one history/branch request. */
interface GraphRequest {
  /** Durable Session identity; the host resolves the session's working directory when cwd is absent. */
  sessionId?: string
  /** Absolute repository working directory (overrides the session resolution). */
  cwd?: string
  /** `log`: how many newest commits to return (default 30, capped 200). */
  count?: number
  /** `log`: commits to skip (client paging). */
  skip?: number
  /** `branch`: list branch names instead of history. */
  action?: 'log' | 'branch'
}

/** Validate a caller-supplied working directory: absolute, non-empty, no shell metacharacters. */
function requireGraphCwd(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('git-graph: cwd must be a non-empty string')
  }
  if (!isAbsolute(value)) {
    throw new Error(`git-graph: cwd must be an absolute path: ${value}`)
  }
  if (/[\n\r]/.test(value)) {
    throw new Error('git-graph: cwd must not contain line breaks')
  }
  return value
}

/** One wire failure; the client renders its message as the panel error. */
class GraphError extends Error {
  constructor(
    message: string,
    readonly code = 'git-graph-error',
  ) {
    super(message)
  }
}

/**
 * Run one git read as a direct `git` subprocess (no shell layer), with a kill
 * timeout and a captured-stdout budget; rejects with GraphError on failure.
 */
function runGitRead(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn('git', ['-C', cwd, '--no-pager', '-c', 'color.ui=false', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    let stdout = ''
    let stdoutBytes = 0
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new GraphError(`git ${args[0] ?? ''} timed out after ${GIT_TIMEOUT_MS}ms`))
    }, GIT_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      stdout += chunk.toString('utf8')
      if (stdoutBytes > GIT_STDOUT_MAX_BYTES) {
        child.kill('SIGKILL')
        reject(new GraphError(`git ${args[0] ?? ''} output exceeded ${GIT_STDOUT_MAX_BYTES} bytes`))
      }
    })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new GraphError(`cannot run git: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise(stdout)
      else reject(new GraphError(`git ${args[0] ?? ''} failed: ${stderr.trim() || `exit ${String(code)}`}`))
    })
  })
}

/** One request's history page: rows plus whether an older page exists. */
export interface GraphLogPage {
  entries: GraphLogEntry[]
  /** True when skipping `skip` more rows would still find commits (client "load more"). */
  hasMore: boolean
}

/** Fetch one history page for a repository working directory. */
async function logPage(cwd: string, count: number, skip: number): Promise<GraphLogPage> {
  const raw = await runGitRead(cwd, [
    'log', '-n', String(count), '--skip', String(skip), '--decorate=short',
    `--pretty=format:${GRAPH_LOG_FORMAT}`,
  ])
  const entries = parseGraphLogLines(raw)
  return { entries, hasMore: entries.length === count }
}

/** List local branch names (current branch included). */
async function branchList(cwd: string): Promise<string[]> {
  const raw = await runGitRead(cwd, ['branch', '--list', '--no-color'])
  return parseBranchNames(raw)
}

/** Shared JSON envelope the client unwraps (`{ok,value}` / `{ok:false,error}`). */
function writeOk(res: { writeHead: (code: number) => void; end: (body: string) => void }, value: unknown): void {
  res.writeHead(200)
  res.end(JSON.stringify({ ok: true, value }))
}

function writeError(res: { writeHead: (code: number) => void; end: (body: string) => void }, status: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const code = error instanceof GraphError ? error.code : 'git-graph-error'
  res.writeHead(status)
  res.end(JSON.stringify({ ok: false, error: { code, message } }))
}

/** Read one JSON request body (bounded, so a hostile client cannot OOM the host). */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new GraphError('git-graph: request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new GraphError('git-graph: request body must be JSON'))
      }
    })
  })
}

/**
 * Register the git-graph route. The handler is POST-only; the body carries
 * `{sessionId | cwd, action?, count?, skip?}` and the response is the wire
 * envelope.
 * @param ctx - Host context with sessionController and webServer services.
 */
export function apply(ctx: Context): void {
  const handler: WebRoute['handler'] = async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    let body: GraphRequest
    try {
      body = (await readBody(req)) as GraphRequest
      let cwd = body.cwd
      if (cwd === undefined) {
        if (typeof body.sessionId !== 'string' || body.sessionId === '') {
          throw new GraphError('git-graph: cwd or sessionId is required')
        }
        const { meta } = await ctx.sessionController.inspect(body.sessionId as never)
        if (meta.cwd === undefined || meta.cwd === '') {
          throw new GraphError('git-graph: the session has no working directory')
        }
        cwd = meta.cwd
      }
      const resolvedCwd = requireGraphCwd(cwd)
      if (body.action === 'branch') {
        writeOk(res, await branchList(resolvedCwd))
        return
      }
      const count = Math.min(Math.max(Number(body.count) || DEFAULT_LOG_COUNT, 1), MAX_LOG_COUNT)
      const skip = Math.max(Number(body.skip) || 0, 0)
      writeOk(res, await logPage(resolvedCwd, count, skip))
    } catch (error) {
      writeError(res, error instanceof GraphError ? 400 : 500, error)
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/git-graph/api', handler }), 'git-graph: /git-graph/api route')
}
