// @vitest-environment jsdom
/** BackgroundRuntime: snapshot projection, validated writes through the scope,
 * adoption of Host acceptances, presenter var rules, and the upload probe. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import {
  BackgroundRuntime, type BackgroundSnapshot,
} from '../src/client/index.ts'
import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, type BackgroundImageRef, type BackgroundSettings } from '../src/background-settings.ts'

afterEach(() => { document.head.innerHTML = ''; vi.unstubAllGlobals() })

const REF: BackgroundImageRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 2,
  height: 2,
}

function runtime() {
  const ctx = new Context()
  const stub = stubSettingsScope<BackgroundSettings>()
  const service = new BackgroundRuntime(ctx, stub.scope)
  return { ctx, stub, service }
}

describe('BackgroundRuntime', () => {
  it('starts at the default section with an inert presenter', () => {
    const { service } = runtime()
    expect(service.getBackground()).toMatchObject({
      section: DEFAULT_BACKGROUND,
      backdrop: { kind: 'none' },
      revision: 0,
    })
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
  })

  it('writes preset selections through the scope and paints both palette modes', () => {
    const { ctx, stub, service } = runtime()
    const events: BackgroundSnapshot[] = []
    ctx.on('background/change', (snapshot) => { events.push(snapshot) })
    service.setPreset('aurora')
    expect(stub.set).toHaveBeenCalledWith('preference', 'preset')
    expect(stub.set).toHaveBeenCalledWith('preset', 'aurora')
    const style = document.querySelector('style[data-dsh-background]')
    expect(style?.textContent).toContain('body[data-ds-dark-theme]')
    expect(events.at(-1)?.backdrop).toEqual({
      kind: 'preset',
      css: BACKGROUND_PRESETS.find(p => p.id === 'aurora')!.css,
    })
    expect(() => { service.setPreset('sepia') }).toThrow(/not registered/)
  })

  it('writes image selections, dimming, and none retraction', () => {
    const { stub, service } = runtime()
    service.setImage(REF)
    expect(stub.set).toHaveBeenCalledWith('preference', 'image')
    expect(stub.set).toHaveBeenCalledWith('image', REF)
    expect(document.querySelector('style[data-dsh-background]')?.textContent).toContain('url("/backgrounds/current")')
    expect(document.querySelector('style[data-dsh-background]')?.textContent).toContain('--dsw-specific-backdrop-veil:')
    service.setDimming(60)
    expect(stub.set).toHaveBeenCalledWith('dimming', 60)
    expect(document.querySelector('style[data-dsh-background]')?.textContent).toContain(' 60%, transparent)')
    service.setNone()
    expect(stub.set).toHaveBeenCalledWith('preference', 'none')
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
  })

  it('adopts Host acceptances, including invalid pairings', () => {
    const { stub, service } = runtime()
    stub.publish({ status: 'ready', value: { preference: 'preset', preset: 'dusk', dimming: 45 }, revision: 1 })
    expect(service.getBackground().backdrop).toEqual({
      kind: 'preset',
      css: BACKGROUND_PRESETS.find(p => p.id === 'dusk')!.css,
    })
    stub.publish({ status: 'ready', value: { preference: 'preset', preset: 'gone', dimming: 45 }, revision: 2 })
    expect(service.getBackground().backdrop).toEqual({ kind: 'invalid', reason: 'unknown-preset' })
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
  })

  it('uploads raw bytes and probes the current image', async () => {
    const { service } = runtime()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(REF), { status: 201, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([1, 2, 3])], 'bg.png', { type: 'image/png' })
    expect(await service.uploadImage(file)).toEqual(REF)
    expect(fetchMock).toHaveBeenCalledWith('/backgrounds', {
      method: 'POST', body: file, headers: { 'content-type': 'image/png' },
    })
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(service.uploadImage(file)).rejects.toThrow(/404/)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    expect(await service.probeImage()).toBe(true)
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    expect(await service.probeImage()).toBe(false)
  })

  it('probes the current image with an exact HEAD request', async () => {
    const { service } = runtime()
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await service.probeImage()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/backgrounds/current', { method: 'HEAD' })
  })

  it('disposes the presenter style element and stays usable for re-painting', () => {
    const { service } = runtime()
    service.setPreset('aurora')
    expect(document.querySelector('style[data-dsh-background]')).not.toBeNull()
    service.dispose()
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
    service.dispose()
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
    service.setPreset('dusk')
    const style = document.querySelector('style[data-dsh-background]')
    expect(style?.textContent).toContain('body[data-ds-dark-theme]')
  })
})
