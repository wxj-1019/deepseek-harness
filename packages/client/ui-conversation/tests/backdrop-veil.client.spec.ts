/** Chat transcript backdrop-veil contract: the centered message column keeps
 * bare markdown prose on a readable base fill over an active backdrop (the
 * gutters, header, and hero keep showing it), and the fill is opaque base when
 * no backdrop stands. Mirrors the ui-layout backdrop-layers stylesheet
 * contract: paint rules are pinned as text because jsdom computes no paint. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const TESTS_DIR = dirname(fileURLToPath(import.meta.url))

describe('chat transcript backdrop veil contract', () => {
  it('the message column paints the veil with an opaque base fallback', () => {
    const css = readFileSync(join(TESTS_DIR, '../src/client/chat/ChatView.module.css'), 'utf8')
    expect(css).toContain('background: var(--dsw-specific-backdrop-veil, var(--dsw-alias-bg-base))')
  })

  it('the veil extends past the column so prose never sits flush against its edge', () => {
    const css = readFileSync(join(TESTS_DIR, '../src/client/chat/ChatView.module.css'), 'utf8')
    expect(css).toContain('box-shadow: 0 0 0 16px var(--dsw-specific-backdrop-veil, var(--dsw-alias-bg-base))')
  })
})
