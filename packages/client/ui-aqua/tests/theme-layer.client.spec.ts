// @vitest-environment jsdom
/** AquaLayer state machine over one stubbed theme service: applying an
 * enabled section mounts the html attributes, the ambient scene, and the
 * mode's token override; applying a disabled section retracts everything;
 * wallpaper references mount the matching media element once per reference
 * (knob re-applies never reload the media). */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom ships no media playback; the wallpaper mount path expects a Promise.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
import { AQUA_DEFAULTS, type AquaSection, type WallpaperRef } from '../src/aqua-settings.ts'
import { AquaLayer } from '../src/client/theme-layer.ts'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

const IMAGE_REF: WallpaperRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/jpeg',
  bytes: 3,
  width: 2,
  height: 2,
}
const VIDEO_REF: WallpaperRef = {
  attachmentId: `sha256:${'b'.repeat(64)}`,
  mediaType: 'video/webm',
  bytes: 4,
}

interface ThemeStub {
  overrides: Array<{ source: string; tokens: ThemeTokenOverrides }>
  scheme: 'light' | 'dark'
}

function bootTheme(): { ctx: Context; theme: ThemeStub } {
  const theme: ThemeStub = { overrides: [], scheme: 'dark' }
  const ctx = new Context()
  ctx.provide('theme', {
    overrideTokens: (source: string, tokens: ThemeTokenOverrides) => {
      theme.overrides.push({ source, tokens })
      return () => {}
    },
    getTheme: () => ({ active: { colorScheme: theme.scheme }, preference: 'dark', themes: [], revision: 0 }),
  } as never)
  return { ctx, theme }
}

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.className = ''
  for (const name of [...document.documentElement.getAttributeNames()]) {
    if (name !== 'lang') document.documentElement.removeAttribute(name)
  }
  document.documentElement.style.cssText = ''
})

describe('AquaLayer apply/retract', () => {
  it('mounts the layer for an enabled section and registers the token override', () => {
    const { ctx, theme } = bootTheme()
    const layer = new AquaLayer(ctx)
    layer.apply({ ...AQUA_DEFAULTS })
    expect(document.documentElement.hasAttribute('data-dsh-aqua')).toBe(true)
    expect(document.documentElement.hasAttribute('data-dsh-float')).toBe(true)
    expect(document.querySelector('[data-dsh-aqua-ambient]')).not.toBeNull()
    expect(theme.overrides.at(-1)?.source).toBe('@deepseek-ai/dsh-client-ui-aqua')
    expect(theme.overrides.at(-1)?.tokens['--dsw-alias-bg-base']).toEqual({ light: '#F4F8FD', dark: '#0C121B' })
    expect(layer.getDark()).toBe(true)
  })

  it('compat mode swaps the mode attribute and the compat token set', () => {
    const { ctx, theme } = bootTheme()
    const layer = new AquaLayer(ctx)
    layer.apply({ ...AQUA_DEFAULTS, mode: 'compat' })
    expect(document.documentElement.hasAttribute('data-dsh-compat')).toBe(true)
    expect(document.documentElement.hasAttribute('data-dsh-float')).toBe(false)
    expect(theme.overrides.at(-1)?.tokens['--dsw-alias-bg-layer-1']).toEqual({ light: 'rgba(255, 255, 255, 0.55)', dark: 'rgba(17, 26, 39, 0.55)' })
  })

  it('a disabled section retracts every owned effect', () => {
    const { ctx } = bootTheme()
    const layer = new AquaLayer(ctx)
    layer.apply({ ...AQUA_DEFAULTS })
    layer.apply({ ...AQUA_DEFAULTS, enabled: false })
    expect(document.documentElement.hasAttribute('data-dsh-aqua')).toBe(false)
    expect(document.documentElement.hasAttribute('data-dsh-float')).toBe(false)
    expect(document.querySelector('[data-dsh-aqua-ambient]')).toBeNull()
    expect(document.querySelector('[data-dsh-aqua-wallpaper-layer]')).toBeNull()
  })

  it('mounts the wallpaper media the reference addresses, once per reference', () => {
    const { ctx } = bootTheme()
    const layer = new AquaLayer(ctx)
    const section: AquaSection = { ...AQUA_DEFAULTS, background: 'wallpaper', wallpaper: IMAGE_REF }
    layer.apply(section)
    const img = document.querySelector<HTMLImageElement>('[data-dsh-aqua-wallpaper-img]')
    const video = document.querySelector<HTMLVideoElement>('[data-dsh-aqua-wallpaper-video]')
    if (img === null || video === null) throw new Error('wallpaper layer missing')
    expect(img.getAttribute('src')).toBe(`/backgrounds/current?v=${IMAGE_REF.attachmentId}`)
    expect(video.hasAttribute('src')).toBe(false)
    expect(document.documentElement.getAttribute('data-dsh-aqua-media')).toBe('image')
    // A knob re-apply with the same reference must not touch the src.
    const src = img.getAttribute('src')
    layer.apply({ ...section, blur: 30 })
    expect(img.getAttribute('src')).toBe(src)
    // A different reference switches the src.
    layer.apply({ ...section, wallpaper: VIDEO_REF })
    expect(img.hasAttribute('src')).toBe(false)
    expect(video.getAttribute('src')).toBe(`/backgrounds/current?v=${VIDEO_REF.attachmentId}`)
    expect(document.documentElement.getAttribute('data-dsh-aqua-media')).toBe('video')
    // Leaving wallpaper mode clears both surfaces.
    layer.apply({ ...section, wallpaper: VIDEO_REF, background: 'fluid' })
    expect(video.hasAttribute('src')).toBe(false)
  })
})
