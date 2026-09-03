/**
 * Design-token inventory parsing for the theme stylesheet. The inventory is a
 * reference document for generation constraints, not a database table.
 * @module @deepseek-ai/dsh-component-library/src/tokens
 */

import type { StyleToken } from './types.ts'

/** One `--dsw-<tier>-<name>: <value>;` declaration. */
const TOKEN_DECLARATION = /(--dsw-(static|alias|specific)-[a-z0-9-]+)\s*:\s*([^;]+);/g

/**
 * Parse every `--dsw-*` custom property declaration into the token inventory.
 * A name declared more than once (layered rules) keeps its first declaration.
 * @param cssText - raw theme stylesheet text.
 * @returns inventory entries in first-declaration order.
 */
export function parseDesignTokens(cssText: string): StyleToken[] {
  const tokens = new Map<string, StyleToken>()
  for (const match of cssText.matchAll(TOKEN_DECLARATION)) {
    const [name, tier, value] = [match[1], match[2], match[3]]
    if (name === undefined || tier === undefined || value === undefined) continue
    if (tokens.has(name)) continue
    tokens.set(name, { name, tier: tier as StyleToken['tier'], value: value.trim() })
  }
  return [...tokens.values()]
}
