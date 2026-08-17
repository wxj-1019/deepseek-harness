/**
 * Shared fixture for the dev-checks script specs: temporary harness homes
 * holding caller-supplied settings documents, so each spec points the toggle
 * reader at an isolated `$DSH_HOME`. Homes register internally at creation;
 * specs call {@link cleanupDevChecksHomes} from an `afterEach`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const homes: string[] = []

/**
 * Create a temporary harness home holding the given files.
 * @param files - filename → content map written into the home root (e.g. `settings.yaml`).
 * @returns the environment mapping pointing `DSH_HOME` at the temp home, for the reader's env parameter.
 */
export function makeDevChecksHome(files: Record<string, string> = {}): Record<string, string | undefined> {
  const home = mkdtempSync(join(tmpdir(), 'dsh-dev-checks-'))
  homes.push(home)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(home, name), content)
  }
  return { DSH_HOME: home }
}

/** Remove every home created since the last cleanup; safe to call with none pending. */
export function cleanupDevChecksHomes(): void {
  while (homes.length > 0) rmSync(homes.pop() as string, { recursive: true, force: true })
}
