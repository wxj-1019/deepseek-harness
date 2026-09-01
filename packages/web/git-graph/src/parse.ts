/**
 * Parsing for the git-graph history route. Output shapes come from `git`
 * with porcelain-style separators (`\x1f` unit separators), so parsing never
 * depends on locale, color config, or quoting: every field is a fixed slot.
 */

/** One history row as the graph rail needs it. */
export interface GraphLogEntry {
  /** Short hash (7+ chars, display). */
  hash: string
  /** Full 40-char hash (uniqueness and advanced operations). */
  hashFull: string
  subject: string
  author: string
  /** ISO 8601 author date (`%ai`), e.g. `2024-01-01 10:00:00 +0800`. */
  date: string
  /** Ref decorations (`%D` with --decorate=short), e.g. `HEAD -> main, origin/main`; '' when none. */
  refs: string
  /** Parent full hashes (`%P`, space-separated); `[]` on a root commit. Drives the rail lanes. */
  parents: string[]
  /** Commit time as unix seconds (`%ct`); `0` when unparseable. */
  commitTime: number
}

/** The shared `--pretty=format` spec; the client mirrors the field order for its row types. */
export const GRAPH_LOG_FORMAT = '%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D%x1f%P%x1f%ct'

/**
 * Parse `git log --pretty=format:` rows per {@link GRAPH_LOG_FORMAT}.
 * @param output - the raw log stdout.
 * @returns one entry per non-empty line; a line with fewer than six fields
 *   is skipped defensively (an unknown git version's format drift).
 */
export function parseGraphLogLines(output: string): GraphLogEntry[] {
  const rows: GraphLogEntry[] = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [hash, subject, author, date, hashFull, refs, parentsRaw, commitTimeRaw] = line.split('\x1f')
    if (hash === undefined || subject === undefined) continue
    rows.push({
      hash,
      subject,
      author: author ?? '',
      date: date ?? '',
      hashFull: hashFull ?? hash,
      refs: refs ?? '',
      parents: parentsRaw === undefined || parentsRaw === '' ? [] : parentsRaw.split(' '),
      commitTime: Number(commitTimeRaw) || 0,
    })
  }
  return rows
}

/**
 * Parse `git branch --list --no-color` lines into a branch-name list. The
 * current branch carries a `* ` prefix, which is stripped.
 * @param output - the raw git branch stdout.
 */
export function parseBranchNames(output: string): string[] {
  return output.split('\n')
    .map(line => line.replace(/^\*\s*/, '').trim())
    .filter(line => line !== '')
}
