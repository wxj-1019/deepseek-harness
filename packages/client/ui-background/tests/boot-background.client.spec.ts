/** The Host index transform splices the backdrop variables into <head> before
 * first paint; none/invalid sections leave the HTML untouched. */
import { describe, expect, it } from 'vitest'
import { injectBootBackground } from '../src/boot-background.ts'
import { DEFAULT_BACKGROUND, type BackgroundSettings } from '../src/background-settings.ts'

const HTML = '<html><head><title>t</title></head><body><div id="root"></div></body></html>'

describe('injectBootBackground', () => {
  it('leaves the HTML untouched for the default (none) section', () => {
    expect(injectBootBackground(HTML, DEFAULT_BACKGROUND)).toBe(HTML)
  })

  it('defaults the section to none and leaves the HTML untouched', () => {
    expect(injectBootBackground(HTML)).toBe(HTML)
  })

  it('splices the style before </head> for a preset, with the dark override', () => {
    const out = injectBootBackground(HTML, { preference: 'preset', preset: 'aurora', dimming: 30 })
    expect(out).not.toBe(HTML)
    expect(out.indexOf('<style>')).toBeGreaterThan(out.indexOf('<head>'))
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('</head>'))
    expect(out).toContain('linear-gradient(160deg, #dce7fb')
    expect(out).toContain('body[data-ds-dark-theme]{--dsw-specific-backdrop-image:')
    expect(out).toContain('color-mix(in srgb, var(--dsw-alias-bg-base) 30%, transparent)')
  })

  it('resolves the image URL from the section for an image background', () => {
    const section: BackgroundSettings = {
      preference: 'image',
      image: { attachmentId: `sha256:${'b'.repeat(64)}`, mediaType: 'image/png', bytes: 1, width: 1, height: 1 },
      dimming: 45,
    }
    expect(injectBootBackground(HTML, section)).toContain('url("/backgrounds/current")')
  })

  it('appends the style when the fragment has no head', () => {
    const out = injectBootBackground('<body></body>', { preference: 'preset', preset: 'mist', dimming: 45 })
    expect(out.startsWith('<body></body>')).toBe(true)
    expect(out.endsWith('</style>')).toBe(true)
  })

  it('leaves the HTML untouched for an invalid section (covers the invalid arm of backdropVarsCss)', () => {
    expect(injectBootBackground(HTML, { preference: 'preset', preset: 'gone', dimming: 45 })).toBe(HTML)
  })
})
