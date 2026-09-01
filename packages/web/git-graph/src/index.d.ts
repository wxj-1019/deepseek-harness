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
import { GraphLogEntry } from './parse.ts'
export { GraphLogEntry, GRAPH_LOG_FORMAT, parseBranchNames, parseGraphLogLines } from './parse.ts'
export declare const name = 'git-graph'
/** Services required by this plugin. */
export declare const inject: string[]
/** Default history page size (mirrors the web panel's lazy paging). */
export declare const DEFAULT_LOG_COUNT = 30
/** Upper bound on one history page, so a request can never flood the UI. */
export declare const MAX_LOG_COUNT = 200
/** One request's history page: rows plus whether an older page exists. */
export interface GraphLogPage {
  entries: GraphLogEntry[]
  /** True when skipping `skip` more rows would still find commits (client "load more"). */
  hasMore: boolean
}
/**
 * Register the git-graph route. The handler is POST-only; the body carries
 * `{cwd, action?, count?, skip?}` and the response is the wire envelope.
 * @param ctx - Host context with webServer and shell services.
 */
export declare function apply(ctx: Context): void
//# sourceMappingURL=index.d.ts.map
