/** Shared aqua section vocabulary: schema resolution defaults every knob,
 * rejects out-of-range writes at the settings boundary, and keeps an absent
 * wallpaper absent (the union wrapper carries no implicit default). */
import { describe, expect, it } from 'vitest'
import {
  AQUA_DEFAULTS, AquaSectionSchema, isVideoRef,
} from '../src/aqua-settings.ts'

const IMAGE_REF = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png' as const,
  bytes: 3,
  width: 2,
  height: 2,
}

const VIDEO_REF = {
  attachmentId: `sha256:${'b'.repeat(64)}`,
  mediaType: 'video/webm' as const,
  bytes: 8,
}

describe('AquaSectionSchema', () => {
  it('resolves the shipped defaults from an empty input', () => {
    expect(AquaSectionSchema({} as never)).toEqual(AQUA_DEFAULTS)
  })

  it('round-trips a complete section with both wallpaper kinds', () => {
    const section = { ...AQUA_DEFAULTS, background: 'wallpaper' as const, wallpaper: IMAGE_REF }
    expect(AquaSectionSchema(structuredClone(section) as never)).toEqual(section)
    const video = { ...AQUA_DEFAULTS, background: 'wallpaper' as const, wallpaper: VIDEO_REF }
    expect(AquaSectionSchema(structuredClone(video) as never)).toEqual(video)
  })

  it('keeps an absent wallpaper absent and fails loud on bad values', () => {
    expect(AquaSectionSchema({} as never)).not.toHaveProperty('wallpaper')
    expect(() => AquaSectionSchema({ blur: 41 } as never)).toThrow()
    expect(() => AquaSectionSchema({ mode: 'liquid' } as never)).toThrow()
    expect(() => AquaSectionSchema({ wallpaper: { attachmentId: 'nope', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } } as never)).toThrow(/attachmentId/)
  })
})

describe('isVideoRef', () => {
  it('discriminates the union by media type', () => {
    expect(isVideoRef(VIDEO_REF)).toBe(true)
    expect(isVideoRef(IMAGE_REF)).toBe(false)
  })
})
