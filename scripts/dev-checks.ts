/**
 * Local dev-check toggles: per-machine switches that narrow the heavy routine
 * quality gates (e2e, coverage, snapshot, doc-sync, pre-push typecheck)
 * without touching CI evidence.
 *
 * Source of truth: the `dev-checks` section of the harness settings document
 * (`$DSH_HOME/settings.yaml`), the same document the web "Dev checks"
 * settings page writes through the settings-file provider. Every key defaults
 * to `true`; a missing file or section keeps every gate on. `CI=true` forces
 * every toggle on so a local document can never narrow CI. Explicit full
 * entry points (`check:all`, `test:snapshot:record/refresh`, CI gate modes)
 * never consult these toggles.
 *
 * The key inventory is declared again by the ui-settings-dev-checks package
 * schema; scripts/dev-checks.spec.ts locks the two declarations together.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { dshHomeDisplay, resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Settings namespace shared with the web settings page and the Host registration. */
export const DEV_CHECKS_NAMESPACE = 'dev-checks'

/** Every switchable local gate, in settings-page order. */
export const DEV_CHECK_KEYS = ['e2e', 'coverage', 'snapshot', 'docSync', 'buildHygiene', 'prePushTypecheck'] as const

/** One switchable local gate key. */
export type DevCheckKey = typeof DEV_CHECK_KEYS[number]

/** Resolved toggle state for every switchable gate. */
export type DevCheckToggles = Record<DevCheckKey, boolean>

/** Shipped state: every gate runs. */
export const DEV_CHECK_DEFAULTS: DevCheckToggles = {
  e2e: true,
  coverage: true,
  snapshot: true,
  docSync: true,
  buildHygiene: true,
  prePushTypecheck: true,
}

const DEV_CHECK_KEY_SET: ReadonlySet<string> = new Set(DEV_CHECK_KEYS)

/** Document filenames probed under the harness home, in product-default order. */
const CANDIDATE_FILENAMES = ['settings.yaml', 'settings.yml', 'settings.json'] as const

/** The located settings document, with a symbolic display form for messages. */
export interface DevChecksDocument {
  /** Absolute path of the document on disk. */
  path: string
  /** Symbolic display form (`~/.dsh/settings.yaml` or `$DSH_HOME/...`). */
  display: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Locate the harness settings document under the resolved harness home.
 * @param env - environment mapping used to resolve `$DSH_HOME`.
 * @returns the first existing candidate document, or undefined when absent.
 */
export function findDevChecksDocument(env: Record<string, string | undefined> = process.env): DevChecksDocument | undefined {
  const home = resolveDshHome(undefined, env)
  const displayHome = dshHomeDisplay(home)
  for (const name of CANDIDATE_FILENAMES) {
    const path = join(home, name)
    if (existsSync(path)) return { path, display: `${displayHome}/${name}` }
  }
  return undefined
}

/**
 * Validate the parsed settings document and resolve the toggle state.
 * @param document - parsed YAML/JSON top level (null for an empty file).
 * @param source - document path used in error messages.
 * @returns the resolved toggles; absent keys fall back to their defaults.
 * @throws when the document or section is not a mapping, a key is unknown, or a value is not boolean.
 */
function parseDevCheckToggles(document: unknown, source: string): DevCheckToggles {
  if (document === null || document === undefined) return { ...DEV_CHECK_DEFAULTS }
  if (!isPlainObject(document)) {
    throw new Error(`dev-checks: ${source} must hold a mapping at the top level, got ${Array.isArray(document) ? 'an array' : JSON.stringify(document)}.`)
  }
  const section = document[DEV_CHECKS_NAMESPACE]
  if (section === undefined || section === null) return { ...DEV_CHECK_DEFAULTS }
  if (!isPlainObject(section)) {
    throw new Error(`dev-checks: ${source} section "${DEV_CHECKS_NAMESPACE}" must be a mapping of gate keys to booleans.`)
  }
  const toggles = { ...DEV_CHECK_DEFAULTS }
  for (const [key, value] of Object.entries(section)) {
    if (!DEV_CHECK_KEY_SET.has(key)) {
      throw new Error(`dev-checks: ${source} sets unknown key ${JSON.stringify(key)}; valid keys: ${DEV_CHECK_KEYS.join(', ')}.`)
    }
    if (typeof value !== 'boolean') {
      throw new Error(`dev-checks: ${source} key ${JSON.stringify(key)} must be boolean, got ${JSON.stringify(value)}.`)
    }
    toggles[key as DevCheckKey] = value
  }
  return toggles
}

/**
 * Read the local toggle state. `CI=true` short-circuits to all-on before any
 * filesystem access so a local document can never leak into CI evidence.
 * @param env - environment mapping used for `CI` and `$DSH_HOME`.
 * @returns the resolved toggles; a missing document keeps every gate on.
 * @throws when the document exists but is malformed (the switch would otherwise be silently ignored).
 */
export function readDevCheckToggles(env: Record<string, string | undefined> = process.env): DevCheckToggles {
  if (env.CI === 'true') return { ...DEV_CHECK_DEFAULTS }
  const document = findDevChecksDocument(env)
  if (document === undefined) return { ...DEV_CHECK_DEFAULTS }
  // js-yaml also parses JSON, so every candidate extension shares this path.
  const parsed: unknown = load(readFileSync(document.path, 'utf8'), { filename: document.path })
  return parseDevCheckToggles(parsed, document.path)
}

/**
 * Resolve one toggle.
 * @param key - the gate to query.
 * @param env - environment mapping used for `CI` and `$DSH_HOME`.
 * @returns whether the gate should run locally.
 */
export function isDevCheckEnabled(key: DevCheckKey, env: Record<string, string | undefined> = process.env): boolean {
  return readDevCheckToggles(env)[key]
}
