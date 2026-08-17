/**
 * Behavior tests for the dev-check toggle reader (scripts/dev-checks.ts) plus
 * the mechanical lock that keeps its key inventory identical to the
 * ui-settings-dev-checks package schema. The two declarations live in
 * different compiler faces, so the lock reads the package source through the
 * TypeScript AST rather than importing it — a web-UI switch must never stop
 * reaching the scripts that honor it.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEV_CHECK_DEFAULTS,
  DEV_CHECK_KEYS,
  DEV_CHECKS_NAMESPACE,
  findDevChecksDocument,
  isDevCheckEnabled,
  readDevCheckToggles,
} from './dev-checks.ts'
import { cleanupDevChecksHomes, makeDevChecksHome } from './dev-checks.testkit.ts'

const root = resolve(import.meta.dirname, '..')

afterEach(cleanupDevChecksHomes)

describe('readDevCheckToggles', () => {
  it('keeps every gate on when no settings document exists', () => {
    expect(readDevCheckToggles(makeDevChecksHome())).toEqual(DEV_CHECK_DEFAULTS)
  })

  it('keeps every gate on when the document has no dev-checks section', () => {
    expect(readDevCheckToggles(makeDevChecksHome({ 'settings.yaml': 'locale:\n  language: zh\n' }))).toEqual(DEV_CHECK_DEFAULTS)
  })

  it('keeps every gate on for an empty document', () => {
    expect(readDevCheckToggles(makeDevChecksHome({ 'settings.yaml': '' }))).toEqual(DEV_CHECK_DEFAULTS)
  })

  it('applies only the keys the section sets, defaulting the rest', () => {
    const env = makeDevChecksHome({ 'settings.yaml': 'dev-checks:\n  e2e: false\n  docSync: false\n' })
    expect(readDevCheckToggles(env)).toEqual({ ...DEV_CHECK_DEFAULTS, e2e: false, docSync: false })
    expect(isDevCheckEnabled('e2e', env)).toBe(false)
    expect(isDevCheckEnabled('coverage', env)).toBe(true)
  })

  it('reads settings.json when no yaml document exists', () => {
    const env = makeDevChecksHome({ 'settings.json': '{ "dev-checks": { "snapshot": false } }\n' })
    expect(readDevCheckToggles(env)).toEqual({ ...DEV_CHECK_DEFAULTS, snapshot: false })
  })

  it('prefers settings.yaml over the other candidates', () => {
    const env = makeDevChecksHome({
      'settings.yaml': 'dev-checks:\n  e2e: false\n',
      'settings.json': '{ "dev-checks": { "e2e": true, "coverage": false } }\n',
    })
    expect(findDevChecksDocument(env)?.path.endsWith('settings.yaml')).toBe(true)
    expect(readDevCheckToggles(env)).toEqual({ ...DEV_CHECK_DEFAULTS, e2e: false })
  })

  it('fails loud on an unknown key so a typo never reads as a disabled gate', () => {
    const env = makeDevChecksHome({ 'settings.yaml': 'dev-checks:\n  e2ee: false\n' })
    const message = /unknown key "e2ee".*valid keys: e2e, coverage, snapshot, docSync, buildHygiene, prePushTypecheck/
    expect(() => readDevCheckToggles(env)).toThrow(message)
  })

  it('fails loud on a non-boolean value', () => {
    const env = makeDevChecksHome({ 'settings.yaml': 'dev-checks:\n  e2e: "no"\n' })
    expect(() => readDevCheckToggles(env)).toThrow(/"e2e" must be boolean/)
  })

  it('fails loud when the section is not a mapping', () => {
    const env = makeDevChecksHome({ 'settings.yaml': 'dev-checks: everything off\n' })
    expect(() => readDevCheckToggles(env)).toThrow(/section "dev-checks" must be a mapping/)
  })

  it('fails loud when the document top level is not a mapping', () => {
    const env = makeDevChecksHome({ 'settings.yaml': '- just\n- a\n- list\n' })
    expect(() => readDevCheckToggles(env)).toThrow(/must hold a mapping at the top level/)
  })

  it('forces every gate on under CI=true even when the document disables them', () => {
    const env = { ...makeDevChecksHome({ 'settings.yaml': 'dev-checks:\n  e2e: false\n' }), CI: 'true' }
    expect(readDevCheckToggles(env)).toEqual(DEV_CHECK_DEFAULTS)
  })
})

/** The package-side declarations extracted from the shared settings module source. */
interface PackageDeclarations {
  /** The settings namespace string literal. */
  namespace: string
  /** Schema property name → initializer text, from the z.object literal. */
  schemaFields: Record<string, string>
  /** Defaults-object property name → initializer text. */
  defaultFields: Record<string, string>
}

function readPackageDeclarations(): PackageDeclarations {
  const path = resolve(root, 'packages/client/ui-settings-dev-checks/src/dev-checks-settings.ts')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let namespace: string | undefined
  let schemaFields: Record<string, string> | undefined
  let defaultFields: Record<string, string> | undefined

  const objectFields = (node: ts.Node): Record<string, string> => {
    if (!ts.isCallExpression(node) && !ts.isObjectLiteralExpression(node)) throw new Error('expected an object literal')
    const literal = ts.isCallExpression(node) ? node.arguments[0] : node
    if (literal === undefined || !ts.isObjectLiteralExpression(literal)) throw new Error('expected an object literal')
    return Object.fromEntries(literal.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
        throw new Error('expected plain identifier property assignments')
      }
      return [property.name.text, property.initializer.getText(source)]
    }))
  }

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
      if (declaration.name.text === 'DEV_CHECKS_SETTINGS_NAMESPACE' && ts.isStringLiteral(declaration.initializer)) {
        namespace = declaration.initializer.text
      }
      if (declaration.name.text === 'DevChecksSettingsSchema') schemaFields = objectFields(declaration.initializer)
      if (declaration.name.text === 'DEV_CHECKS_SETTINGS_DEFAULTS') defaultFields = objectFields(declaration.initializer)
    }
  }
  if (namespace === undefined || schemaFields === undefined || defaultFields === undefined) {
    throw new Error('dev-checks-settings.ts must declare DEV_CHECKS_SETTINGS_NAMESPACE, DevChecksSettingsSchema, and DEV_CHECKS_SETTINGS_DEFAULTS')
  }
  return { namespace, schemaFields, defaultFields }
}

describe('package schema lock', () => {
  it('declares the same namespace as the scripts reader', () => {
    expect(readPackageDeclarations().namespace).toBe(DEV_CHECKS_NAMESPACE)
  })

  it('declares the same key set with all-on boolean defaults as the scripts reader', () => {
    const declarations = readPackageDeclarations()
    for (const [label, fields] of [['schema', declarations.schemaFields], ['defaults', declarations.defaultFields]] as const) {
      expect(Object.keys(fields).sort(), `${label} keys`).toEqual([...DEV_CHECK_KEYS].sort())
    }
    for (const [key, initializer] of Object.entries(declarations.schemaFields)) {
      expect(initializer, `schema field ${key}`).toBe('z.boolean().default(true)')
    }
    for (const [key, initializer] of Object.entries(declarations.defaultFields)) {
      expect(initializer, `default field ${key}`).toBe('true')
    }
    expect(Object.values(DEV_CHECK_DEFAULTS).every(value => value)).toBe(true)
  })
})
