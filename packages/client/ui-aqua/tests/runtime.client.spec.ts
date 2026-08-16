// @vitest-environment jsdom
/** AquaRuntime: scope adoption drives the layer, setters write flat fields
 * optimistically, knobs clamp before writing, the upload chain adopts the
 * stored reference, clearing drops the field, and the one-shot migration
 * adopts the absorbed upstream's localStorage knobs (uploading its data-URL
 * wallpaper) and then removes every legacy key. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { AQUA_DEFAULTS, type AquaSection, type WallpaperRef } from '../src/aqua-settings.ts'
import { AquaRuntime } from '../src/client/runtime.ts'
import type { AquaLayer } from '../src/client/theme-layer.ts'

const IMAGE_REF: WallpaperRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/jpeg',
  bytes: 3,
  width: 2,
  height: 2,
}

/** Layer double: records the last applied section. */
function layerStub(): { applied: AquaSection[]; layer: AquaLayer } {
  const applied: AquaSection[] = []
  const layer = { apply: (section: AquaSection) => { applied.push(section) } } as unknown as AquaLayer
  return { applied, layer }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-dsh-aqua')
})

function runtime() {
  const ctx = new Context()
  const stub = stubSettingsScope<AquaSection>()
  const { applied, layer } = layerStub()
  const service = new AquaRuntime(ctx, stub.scope, layer)
  return { ctx, stub, applied, service }
}

describe('AquaRuntime adoption and writes', () => {
  it('starts at the defaults and applies them to the layer', () => {
    const { service, applied } = runtime()
    expect(service.getAqua().section).toEqual(AQUA_DEFAULTS)
    expect(applied.at(-1)).toEqual(AQUA_DEFAULTS)
  })

  it('writes setters through the scope and publishes optimistically', () => {
    const { stub, service, applied } = runtime()
    service.setEnabled(false)
    expect(stub.set).toHaveBeenCalledWith('enabled', false)
    expect(applied.at(-1)?.enabled).toBe(false)
    service.setMode('compat')
    expect(stub.set).toHaveBeenCalledWith('mode', 'compat')
    service.setFlag('whale', false)
    expect(stub.set).toHaveBeenCalledWith('whale', false)
  })

  it('clamps knob writes into their schema ranges', () => {
    const { stub, service } = runtime()
    service.setKnob('blur', 99)
    expect(stub.set).toHaveBeenCalledWith('blur', 40)
    service.setKnob('fluidHue', 400)
    expect(stub.set).toHaveBeenCalledWith('fluidHue', 360)
    service.setKnob('frost', -3)
    expect(stub.set).toHaveBeenCalledWith('frost', 0)
    service.setKnob('videoBlur', Number.NaN)
    expect(stub.set).toHaveBeenCalledWith('videoBlur', AQUA_DEFAULTS.videoBlur)
  })

  it('adopts Host acceptances and keeps the revision monotonic', () => {
    const { stub, service } = runtime()
    const before = service.getAqua().revision
    stub.publish({ status: 'ready', value: { ...AQUA_DEFAULTS, mode: 'compat', frost: 42 }, revision: 1 })
    expect(service.getAqua().section.mode).toBe('compat')
    expect(service.getAqua().section.frost).toBe(42)
    expect(service.getAqua().revision).toBeGreaterThan(before)
  })
})

describe('AquaRuntime wallpaper chain', () => {
  it('uploads through /backgrounds and adopts the stored reference', async () => {
    const { stub, service, applied } = runtime()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(IMAGE_REF), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([1, 2, 3])], 'wall.jpg', { type: 'image/jpeg' })
    await expect(service.uploadWallpaper(file)).resolves.toEqual(IMAGE_REF)
    expect(fetchMock).toHaveBeenCalledWith('/backgrounds', {
      method: 'POST', body: file, headers: { 'content-type': 'image/jpeg' },
    })
    expect(stub.set).toHaveBeenCalledWith('wallpaper', IMAGE_REF)
    expect(stub.set).toHaveBeenCalledWith('background', 'wallpaper')
    expect(applied.at(-1)?.wallpaper).toEqual(IMAGE_REF)
  })

  it('rejects on a non-201 answer without touching the section', async () => {
    const { service } = runtime()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 413 })))
    const file = new File([new Uint8Array([1])], 'wall.jpg', { type: 'image/jpeg' })
    await expect(service.uploadWallpaper(file)).rejects.toThrow(/413/)
    expect(service.getAqua().section.background).toBe('fluid')
  })

  it('clearing unsets the field, returns to fluid, and drops the key', () => {
    const { stub, service } = runtime()
    service.setWallpaper(IMAGE_REF)
    service.clearWallpaper()
    expect(stub.unset).toHaveBeenCalledWith('wallpaper')
    expect(stub.set).toHaveBeenCalledWith('background', 'fluid')
    expect(service.getAqua().section).not.toHaveProperty('wallpaper')
    expect(service.getAqua().section.background).toBe('fluid')
  })
})

describe('AquaRuntime one-shot migration', () => {
  it('adopts legacy localStorage knobs, uploads the data-URL wallpaper, and clears the keys', async () => {
    localStorage.setItem('dsh.ui-aqua.enabled', 'true')
    localStorage.setItem('dsh.ui-aqua.mode', 'compat')
    localStorage.setItem('dsh.ui-aqua.blur', '12')
    localStorage.setItem('dsh.ui-aqua.wallpaper', 'data:image/jpeg;base64,MTIz')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('data:')) return new Response(new Uint8Array([1, 2, 3]))
      return new Response(JSON.stringify(IMAGE_REF), { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { stub, service } = runtime()
    await vi.waitFor(() => {
      expect(service.getAqua().section.mode).toBe('compat')
      expect(service.getAqua().section.blur).toBe(12)
      expect(service.getAqua().section.wallpaper).toEqual(IMAGE_REF)
      expect(service.getAqua().section.background).toBe('wallpaper')
    })
    expect(stub.set).toHaveBeenCalledWith('mode', 'compat')
    expect(stub.set).toHaveBeenCalledWith('blur', 12)
    expect(stub.set).toHaveBeenCalledWith('wallpaper', IMAGE_REF)
    expect(localStorage.getItem('dsh.ui-aqua.mode')).toBeNull()
    expect(localStorage.getItem('dsh.ui-aqua.wallpaper')).toBeNull()
  })

  it('falls back to fluid when the legacy wallpaper is not an image data URL', () => {
    localStorage.setItem('dsh.ui-aqua.enabled', 'true')
    localStorage.setItem('dsh.ui-aqua.wallpaper', 'fsa:clip.mp4')
    const { service } = runtime()
    expect(service.getAqua().section.background).toBe('fluid')
    expect(service.getAqua().section).not.toHaveProperty('wallpaper')
    expect(localStorage.getItem('dsh.ui-aqua.wallpaper')).toBeNull()
  })

  it('does not migrate once the durable section exists', () => {
    localStorage.setItem('dsh.ui-aqua.blur', '33')
    const ctx = new Context()
    const stub = stubSettingsScope<AquaSection>()
    const { layer } = layerStub()
    stub.publish({ status: 'ready', value: AQUA_DEFAULTS, revision: 3 })
    const service = new AquaRuntime(ctx, stub.scope, layer)
    expect(service.getAqua().section.blur).toBe(AQUA_DEFAULTS.blur)
    expect(localStorage.getItem('dsh.ui-aqua.blur')).toBe('33')
  })
})
