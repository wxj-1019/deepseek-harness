/** Shared background resolution: schema-shaped sections resolve to paintable
 * backdrops; presets always carry both palette modes. */
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_PRESETS, BackgroundSettingsSchema, DEFAULT_BACKGROUND, resolveBackdrop,
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
  })
})
