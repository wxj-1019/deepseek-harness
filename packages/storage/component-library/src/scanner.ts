/**
 * Filesystem side of the learning pipeline: walk `packages/client` in a
 * checkout, turn every `.tsx` under a package's `src/client` into component
 * records, and read the theme stylesheet into the token inventory. Unknown or
 * unparseable files are skipped with a log line, never an abort.
 * @module @deepseek-ai/dsh-component-library/src/scanner
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { extractComponents, extractCssTokenRefs, type ExtractedComponent } from './extract.ts'
import { parseDesignTokens } from './tokens.ts'
import type { ComponentRecord, StyleToken } from './types.ts'

/** Repository-relative location of the client package tree, in POSIX separators. */
export const CLIENT_TREE = 'packages/client'

/** Repository-relative location of the theme token stylesheet. */
export const THEME_STYLESHEET = 'packages/client/ui-theme/src/styles/design-platform.css'

/** Upper bound on a kept usage snippet, so records stay prompt-sized. */
const EXAMPLE_MAX_CHARS = 400

/** Sink for one human-readable skip line. */
export type ScanLog = (line: string) => void

/**
 * Render an absolute path repository-relative with POSIX separators — the
 * form {@link ComponentRecord.path} stores.
 * @param root - checkout root the file lives under.
 * @param file - absolute file path.
 * @returns the repository-relative POSIX path.
 */
export function recordPath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

/** Read one file's text, or `undefined` when it does not exist. */
async function readIfPresent(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    // Only existence is probed here; a genuinely unreadable file resurfaces
    // when its owning package's scan reads it again below.
    return undefined
  }
}

/** Read one client package's manifest name, falling back to its directory name. */
async function packageName(clientRoot: string, directory: string, log: ScanLog): Promise<string> {
  const manifest = await readIfPresent(join(clientRoot, directory, 'package.json'))
  if (manifest === undefined) {
    log(`component-library: ${directory} has no readable package.json; using the directory name`)
    return directory
  }
  try {
    const parsed: unknown = JSON.parse(manifest)
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string') {
      return parsed.name
    }
  } catch {
    // Fall through to the loud-but-local fallback below.
  }
  log(`component-library: ${directory}/package.json has no string name; using the directory name`)
  return directory
}

/**
 * Find one component's first mount call inside its package's specs: the
 * self-closing element when present, else the opening tag alone (attributes
 * carry the informative part), bounded to {@link EXAMPLE_MAX_CHARS}.
 */
function exampleFromSpecs(specTexts: readonly string[], name: string): string {
  const selfClosing = new RegExp(`<${name}\\b[^>]*/>`)
  const opening = new RegExp(`<${name}\\b[^>]*>`)
  for (const text of specTexts) {
    const match = selfClosing.exec(text) ?? opening.exec(text)
    if (match !== null) return match[0].slice(0, EXAMPLE_MAX_CHARS)
  }
  return ''
}

/** List every `*.spec.tsx` text under one package's tests directory. */
async function packageSpecTexts(clientRoot: string, directory: string): Promise<string[]> {
  const testsDir = join(clientRoot, directory, 'tests')
  let entries: string[]
  try {
    entries = await readdir(testsDir)
  } catch {
    // A package without a tests directory simply offers no examples.
    return []
  }
  const texts: string[] = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.spec.tsx')) continue
    const text = await readIfPresent(join(testsDir, entry))
    if (text !== undefined) texts.push(text)
  }
  return texts
}

/** Turn one parsed file's components into records, enriched with tokens and examples. */
async function fileRecords(
  root: string,
  file: string,
  components: readonly ExtractedComponent[],
  log: ScanLog,
): Promise<ComponentRecord[]> {
  const path = recordPath(root, file)
  const [clientTree, directory] = [join(root, CLIENT_TREE), path.split('/')[2] ?? '']
  const pkg = await packageName(clientTree, directory, log)
  const cssText = await readIfPresent(file.replace(/\.tsx$/, '.module.css'))
  const tokens = cssText === undefined ? [] : extractCssTokenRefs(cssText)
  const needsExample = components.some(component => component.example === '')
  const specTexts = needsExample ? await packageSpecTexts(clientTree, directory) : []
  const now = Date.now()
  return components.map(component => ({
    id: `${directory}/${component.name}`,
    pkg,
    name: component.name,
    path,
    props: component.props,
    tokens,
    jsdoc: component.jsdoc,
    example: component.example === '' ? exampleFromSpecs(specTexts, component.name) : component.example,
    origin: 'scanned',
    propsInferred: component.propsInferred,
    rawProps: component.rawProps,
    reviewed: true,
    updatedAt: now,
  }))
}

/**
 * Extract the records of one `.tsx` file. Watcher-driven re-extraction calls
 * this with the changed file; the cold-start scan calls it per walked file.
 * @param root - checkout root containing {@link CLIENT_TREE}.
 * @param file - absolute path of the `.tsx` file.
 * @param log - skip-line sink.
 * @returns the file's component records (empty when it declares none).
 */
export async function extractFile(root: string, file: string, log: ScanLog): Promise<ComponentRecord[]> {
  const text = await readIfPresent(file)
  if (text === undefined) {
    log(`component-library: skipped unreadable ${recordPath(root, file)}`)
    return []
  }
  try {
    return await fileRecords(root, file, extractComponents(file, text), log)
  } catch (error) {
    log(`component-library: skipped unparseable ${recordPath(root, file)}: ${String(error)}`)
    return []
  }
}

/** Walk one directory recursively, yielding every `.tsx` file's absolute path. */
async function* walkTsx(directory: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    // A missing or unreadable directory contributes nothing to the scan.
    return
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* walkTsx(path)
    else if (entry.isFile() && entry.name.endsWith('.tsx')) yield path
  }
}

/**
 * Cold-start scan of the whole client tree.
 * @param root - checkout root containing {@link CLIENT_TREE}.
 * @param log - skip-line sink.
 * @returns every discovered record, in deterministic tree order.
 */
export async function scanComponentLibrary(root: string, log: ScanLog): Promise<ComponentRecord[]> {
  const clientRoot = join(root, CLIENT_TREE)
  let packages
  try {
    packages = await readdir(clientRoot, { withFileTypes: true })
  } catch {
    log(`component-library: ${CLIENT_TREE} is not readable at ${root}; nothing to scan`)
    return []
  }
  const records: ComponentRecord[] = []
  for (const entry of packages.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue
    for await (const file of walkTsx(join(clientRoot, entry.name, 'src', 'client'))) {
      records.push(...await extractFile(root, file, log))
    }
  }
  return records
}

/**
 * Read the theme token inventory.
 * @param root - checkout root containing {@link THEME_STYLESHEET}.
 * @returns the inventory, empty when the stylesheet is absent.
 */
export async function scanDesignTokens(root: string): Promise<StyleToken[]> {
  const text = await readIfPresent(join(root, THEME_STYLESHEET))
  return text === undefined ? [] : parseDesignTokens(text)
}
