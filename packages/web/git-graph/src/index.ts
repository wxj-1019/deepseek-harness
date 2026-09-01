/**
 * Git commit-history reading for the web UI: a `/git-graph/api` prefix route
 * serving parent-aware log rows and branch names over the shell seam. The
 * route is read-only by construction — no command in this surface mutates a
 * repository — so a web client can render the commit rail without any model
 * tool involvement. Working directories are validated absolute paths, and
 * every invocation goes through {@link Shell.run} with the seam's own
 * timeout/output limits.
 */
import { Context } from '@deepseek-ai/cordis'
import { isAbsolute } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the ctx.shell declaration merge into this program.
import type {} from '@deepseek-ai/dsh-shell'
// Type-only: pulls the ctx.sessionController declaration merge into this program.
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { GraphLogEntry, GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from './parse.ts'

export type { GraphLogEntry } from './parse.ts'
export { GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from './parse.ts'

export const name = 'git-graph'

/** Services required by this plugin. */
export const inject = ['webServer', 'shell', 'sessionController', 'sessions']

/** Default history page size (mirrors the web panel's lazy paging). */
export const DEFAULT_LOG_COUNT = 30

/** Upper bound on one history page, so a request can never flood the UI. */
export const MAX_LOG_COUNT = 200

/** Route method and body shape of one history/branch request. */
interface GraphRequest {
  /** Durable Session identity; the host resolves the session working directory when cwd is absent. */
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

/** Run one git read through the shell seam; rejects with GraphError on failure. */
async function runGitRead(
  ctx: Context,
  cwd: string,
  args: readonly string[],
): Promise<string> {
  const result = await ctx.shell.run(ctx.shell.resolve({
    command: `git ${args.join(' ')}`,
    workdir: cwd,
    timeoutMs: 30_000,
  }))
  if (result.exitCode !== 0) {
    throw new GraphError(
      `git ${args[0] ?? ''} failed: ${result.stderr.text.trim() || `exit ${String(result.exitCode)}`}`,
    )
  }
  return result.stdout.text
}

/** One request's history page: rows plus whether an older page exists. */
export interface GraphLogPage {
  entries: GraphLogEntry[]
  /** True when skipping `skip` more rows would still find commits (client "load more"). */
  hasMore: boolean
}

/** Fetch one history page for a repository working directory. */
async function logPage(
  ctx: Context,
  cwd: string,
  count: number,
  skip: number,
): Promise<GraphLogPage> {
  const raw = await runGitRead(ctx, cwd, [
    'log', '-n', String(count), '--skip', String(skip), '--decorate=short',
    `--pretty=format:${GRAPH_LOG_FORMAT}`,
  ])
  const entries = parseGraphLogLines(raw)
  // A page shorter than requested means the log ended; `hasMore` then only
  // holds when the page is exactly full and a probe page found more.
  const hasMore = entries.length === count && skip + count > 0
  return { entries, hasMore }
}

/** List local branch names (current branch included). */
async function branchList(ctx: Context, cwd: string): Promise<string[]> {
  const raw = await runGitRead(ctx, cwd, ['branch', '--list', '--no-color'])
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
 * `{cwd, action?, count?, skip?}` and the response is the wire envelope.
 * @param ctx - Host context with webServer and shell services.
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
        // The attached SessionStore read is O(1); inspect() replays the whole
        // event log and stalls on long conversations.
        const attached = ctx.sessions.get(body.sessionId as never)
        const header = attached?.header ?? (await ctx.sessionController.inspect(body.sessionId as never)).meta
        if (header.cwd === undefined || header.cwd === '') {
          throw new GraphError('git-graph: the session has no working directory')
        }
        cwd = header.cwd
      }
      const resolvedCwd = requireGraphCwd(cwd)
      if (body.action === 'branch') {
        writeOk(res, await branchList(ctx, resolvedCwd))
        return
      }
      const count = Math.min(Math.max(Number(body.count) || DEFAULT_LOG_COUNT, 1), MAX_LOG_COUNT)
      const skip = Math.max(Number(body.skip) || 0, 0)
      writeOk(res, await logPage(ctx, resolvedCwd, count, skip))
    } catch (error) {
      writeError(res, error instanceof GraphError ? 400 : 500, error)
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/git-graph/api', handler }), 'git-graph: /git-graph/api route')
}
