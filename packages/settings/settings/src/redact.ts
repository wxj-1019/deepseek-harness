/**
 * Structural secret redaction for settings values. `role('secret')` fields are
 * removed from a value before it crosses a wire boundary; a sidecar records
 * each schema-declared secret position and whether it currently holds a value,
 * so a configuration surface can render a write-only input without ever
 * receiving the secret itself.
 * @module @deepseek-ai/dsh-settings/redact
 */

import type z from '@deepseek-ai/schemastery'

/**
 * Minimal structural view of a live schemastery node. Only the relations the
 * redactor walks are named; everything else on the instance is ignored.
 */
interface SchemaNode {
  type?: string
  meta?: { role?: unknown }
  /** `object` properties, keyed by property name. */
  dict?: Record<string, SchemaNode>
  /** `dict`/`array` element schema. */
  inner?: SchemaNode
}

/** One schema-declared secret position inside a redacted value. */
export interface RedactedSecret {
  /** Path from the section root to the removed field (concrete dict keys and array indexes included). */
  path: string[]
  /** Whether the field held a value before redaction. */
  set: boolean
}

/** A value with every `role('secret')` field removed, plus the removal record. */
export interface RedactedValue {
  /** Detached copy of the input with secret fields absent. */
  value: unknown
  /**
   * Every reachable secret position: object properties always (even unset, so
   * a form knows the slot exists), dict entries and array items only where the
   * value has them.
   */
  secrets: RedactedSecret[]
}

/** Whether a value is a plain data object the walker may recurse into. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Bound depth for the transitive secret scan. */
const SECRET_SCAN_MAX_DEPTH = 24

/**
 * Whether a schema fragment declares ANY `role('secret')` anywhere beneath it
 * (deep scan over every own property, so union/intersection/transform shapes
 * the walker cannot name are still covered).
 * @param node - a schema fragment to scan.
 * @returns true when a secret marker is reachable.
 */
function declaresSecret(node: unknown): boolean {
  return declaresSecretAt(node, 0)
}

function declaresSecretAt(node: unknown, depth: number): boolean {
  if (depth > SECRET_SCAN_MAX_DEPTH || node === null || typeof node !== 'object') return false
  const record = node as Record<string, unknown>
  const meta = record.meta
  if (meta !== null && typeof meta === 'object' && (meta as Record<string, unknown>).role === 'secret') {
    return true
  }
  for (const value of Object.values(record)) {
    if (value === null || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (declaresSecretAt(entry, depth + 1)) return true
      }
      continue
    }
    if (declaresSecretAt(value, depth + 1)) return true
  }
  return false
}

function walk(node: SchemaNode | undefined, value: unknown, path: string[], secrets: RedactedSecret[]): unknown {
  if (node === undefined) return value
  if (node.meta?.role === 'secret') {
    secrets.push({ path, set: value !== undefined })
    return undefined
  }
  switch (node.type) {
    case 'object': {
      const properties = node.dict ?? {}
      const source = isRecord(value) ? value : undefined
      const rebuilt: Record<string, unknown> = {}
      if (source !== undefined) {
        for (const [key, entry] of Object.entries(source)) {
          if (key in properties) continue
          rebuilt[key] = entry
        }
      }
      for (const [key, child] of Object.entries(properties)) {
        const stripped = walk(child, source?.[key], [...path, key], secrets)
        if (stripped !== undefined) rebuilt[key] = stripped
      }
      return source === undefined && Object.keys(rebuilt).length === 0 ? value : rebuilt
    }
    case 'dict': {
      if (!isRecord(value)) return value
      const rebuilt: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) {
        const stripped = walk(node.inner, entry, [...path, key], secrets)
        if (stripped !== undefined) rebuilt[key] = stripped
      }
      return rebuilt
    }
    case 'array': {
      if (!Array.isArray(value)) return value
      return value.map((entry, index) => walk(node.inner, entry, [...path, String(index)], secrets))
    }
    default:
      // Fail closed: a secret reachable only through a container this walker
      // cannot name (union, intersection, transform) must not cross the wire
      // verbatim. The schema author re-declares it on a supported container.
      if (node !== undefined && declaresSecret(node)) {
        throw new Error(
          `settings: a role('secret') field sits behind an unsupported container at "${path.join('.') || '<root>'}"; `
          + 'declare it directly on an object, dict, or array so redaction can reach it',
        )
      }
      return value
  }
}

/**
 * Remove every `role('secret')` field a schema declares from a value. The
 * walker follows `object`, `dict`, and `array` containers; a secret must be
 * declared directly on a field reachable through those containers (a secret
 * buried inside a union branch or transform is not reachable and must not be
 * modeled that way). The input is never mutated.
 * @param schema - live schemastery schema describing the value.
 * @param value - the value to strip; `undefined` yields an empty record with
 *   object-property secret slots still enumerated.
 * @returns the stripped detached value and the ordered secret positions.
 */
export function redactSecrets(schema: z<never>, value: unknown): RedactedValue {
  const secrets: RedactedSecret[] = []
  const stripped = walk(schema, value, [], secrets)
  return { value: stripped, secrets }
}
