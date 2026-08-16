/** Shared background resolution: schema-shaped sections resolve to paintable
 * backdrops; presets always carry both palette modes. */
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_PRESETS, BackgroundSettingsSchema, DEFAULT_BACKGROUND, backdropVarsCss, resolveBackdrop,
} from '../src/background-settings.ts'

describe('resolveBackdrop', () => {
  it('resolves none by default and from an explicit section', () => {
    expect(DEFAULT_BACKGROUND.preference).toBe('none')
    expect(resolveBackdrop({ preference: 'none', dimming: 45 })).toEqual({ kind: 'none' })
  })

  it('resolves a registered preset with both palette modes', () => {
    const aurora = BACKGROUND_PRESETS.find(p => p.id === 'aurora')
    expect(aurora?.css.light).toMatch(/^linear-gradient/)
    expect(aurora?.css.dark).toMatch(/^linear-gradient/)
    expect(resolveBackdrop({ preference: 'preset', preset: 'aurora', dimming: 45 }))
      .toEqual({ kind: 'preset', css: { light: aurora!.css.light, dark: aurora!.css.dark } })
  })

  it('fails loud on an unknown preset id', () => {
    expect(resolveBackdrop({ preference: 'preset', preset: 'sepia', dimming: 45 }))
      .toEqual({ kind: 'invalid', reason: 'unknown-preset' })
  })

  it('resolves a complete image reference and fails loud without one', () => {
    const image = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png' as const, bytes: 3, width: 2, height: 2 }
    expect(resolveBackdrop({ preference: 'image', image, dimming: 45 })).toEqual({ kind: 'image' })
    expect(resolveBackdrop({ preference: 'image', dimming: 45 }))
      .toEqual({ kind: 'invalid', reason: 'missing-image-ref' })
  })

  it('fails loud on an explicitly null image reference', () => {
    // A hand-edited durable section can carry an explicit null the interface does not admit.
    expect(resolveBackdrop({ preference: 'image', image: null as never, dimming: 45 }))
      .toEqual({ kind: 'invalid', reason: 'missing-image-ref' })
  })

  it('keeps an absent image absent through schema resolution (union wrapper guards the z.object implicit default)', () => {
    // Raw schema input is untyped at this boundary, like the null case above.
    expect(BackgroundSettingsSchema({ preference: 'image' } as never)).not.toHaveProperty('image')
    expect(BackgroundSettingsSchema({ preference: 'image', image: null } as never).image).toBe(null)
    // A malformed content address fails at the settings boundary, not downstream.
    expect(() => BackgroundSettingsSchema({
      preference: 'image',
      image: { attachmentId: 'not-a-hash', mediaType: 'image/png', bytes: 3, width: 2, height: 2 },
    } as never)).toThrow(/attachmentId/)
  })
})

describe('backdropVarsCss', () => {
  const image = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png' as const, bytes: 3, width: 2, height: 2 }

  it('emits the fixed content veil beside the scrim for an image section', () => {
    const css = backdropVarsCss({ preference: 'image', image, dimming: 10 })
    expect(css).toContain('--dsw-specific-backdrop-veil:color-mix(in srgb, var(--dsw-alias-bg-base) 80%, transparent)')
    expect(css).toContain('--dsw-specific-backdrop-scrim:color-mix(in srgb, var(--dsw-alias-bg-base) 10%, transparent)')
  })

  it('emits the same fixed veil for a preset section', () => {
    const css = backdropVarsCss({ preference: 'preset', preset: 'aurora', dimming: 45 })
    expect(css).toContain('--dsw-specific-backdrop-veil:color-mix(in srgb, var(--dsw-alias-bg-base) 80%, transparent)')
  })

  it('keeps the veil independent of the dimming slider', () => {
    // Two dimming strengths, one veil: readability over busy images is a
    // fixed floor, not another user-tunable scalar.
    const low = backdropVarsCss({ preference: 'image', image, dimming: 0 })
    const high = backdropVarsCss({ preference: 'image', image, dimming: 90 })
    const veil = '--dsw-specific-backdrop-veil:color-mix(in srgb, var(--dsw-alias-bg-base) 80%, transparent)'
    expect(low).toContain(veil)
    expect(high).toContain(veil)
  })

  it('retracts every variable for none and invalid sections', () => {
    expect(backdropVarsCss({ preference: 'none', dimming: 45 })).toBe('')
    expect(backdropVarsCss({ preference: 'preset', preset: 'gone', dimming: 45 })).toBe('')
    expect(backdropVarsCss({ preference: 'image', dimming: 45 })).toBe('')
  })
})
