import { isAbsolute } from 'node:path';
import { GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from "./parse.js";
export { GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from "./parse.js";
export const name = 'git-graph';
/** Services required by this plugin. */
export const inject = ['webServer', 'shell'];
/** Default history page size (mirrors the web panel's lazy paging). */
export const DEFAULT_LOG_COUNT = 30;
/** Upper bound on one history page, so a request can never flood the UI. */
export const MAX_LOG_COUNT = 200;
/** Validate a caller-supplied working directory: absolute, non-empty, no shell metacharacters. */
function requireGraphCwd(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error('git-graph: cwd must be a non-empty string');
    }
    if (!isAbsolute(value)) {
        throw new Error(`git-graph: cwd must be an absolute path: ${value}`);
    }
    if (/[\n\r]/.test(value)) {
        throw new Error('git-graph: cwd must not contain line breaks');
    }
    return value;
}
/** One wire failure; the client renders its message as the panel error. */
class GraphError extends Error {
    code;
    constructor(message, code = 'git-graph-error') {
        super(message);
        this.code = code;
    }
}
/** Run one git read through the shell seam; rejects with GraphError on failure. */
async function runGitRead(ctx, cwd, args) {
    const result = await ctx.shell.run(ctx.shell.resolve({
        command: `git ${args.join(' ')}`,
        workdir: cwd,
        timeoutMs: 30_000,
    }));
    if (result.exitCode !== 0) {
        throw new GraphError(`git ${args[0] ?? ''} failed: ${result.stderr.text.trim() || `exit ${String(result.exitCode)}`}`);
    }
    return result.stdout.text;
}
/** Fetch one history page for a repository working directory. */
async function logPage(ctx, cwd, count, skip) {
    const raw = await runGitRead(ctx, cwd, [
        'log', '-n', String(count), '--skip', String(skip), '--decorate=short',
        `--pretty=format:${GRAPH_LOG_FORMAT}`,
    ]);
    const entries = parseGraphLogLines(raw);
    // A page shorter than requested means the log ended; `hasMore` then only
    // holds when the page is exactly full and a probe page found more.
    const hasMore = entries.length === count && skip + count > 0;
    return { entries, hasMore };
}
/** List local branch names (current branch included). */
async function branchList(ctx, cwd) {
    const raw = await runGitRead(ctx, cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
    return parseBranchNames(raw);
}
/** Shared JSON envelope the client unwraps (`{ok,value}` / `{ok:false,error}`). */
function writeOk(res, value) {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, value }));
}
function writeError(res, status, error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof GraphError ? error.code : 'git-graph-error';
    res.writeHead(status);
    res.end(JSON.stringify({ ok: false, error: { code, message } }));
}
/** Read one JSON request body (bounded, so a hostile client cannot OOM the host). */
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 64 * 1024) {
                reject(new GraphError('git-graph: request body too large'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')));
            }
            catch {
                reject(new GraphError('git-graph: request body must be JSON'));
            }
        });
    });
}
/**
 * Register the git-graph route. The handler is POST-only; the body carries
 * `{cwd, action?, count?, skip?}` and the response is the wire envelope.
 * @param ctx - Host context with webServer and shell services.
 */
export function apply(ctx) {
    const handler = async (req, res) => {
        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end();
            return;
        }
        let body;
        try {
            body = (await readBody(req));
            const cwd = requireGraphCwd(body.cwd);
            if (body.action === 'branch') {
                writeOk(res, await branchList(ctx, cwd));
                return;
            }
            const count = Math.min(Math.max(Number(body.count) || DEFAULT_LOG_COUNT, 1), MAX_LOG_COUNT);
            const skip = Math.max(Number(body.skip) || 0, 0);
            writeOk(res, await logPage(ctx, cwd, count, skip));
        }
        catch (error) {
            writeError(res, error instanceof GraphError ? 400 : 500, error);
        }
    };
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/git-graph/api', handler }), 'git-graph: /git-graph/api route');
}
//# sourceMappingURL=index.js.map