/** Host half: durable namespace registration, /backgrounds admission for both
 * media kinds (same-origin write fence, limits from the attachments policy,
 * ETag revalidation, video byte ranges), and the boot glass transform. */
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterAll, describe, expect, it } from 'vitest'
import { AQUA_DEFAULTS, type WallpaperRef } from '../src/aqua-settings.ts'

const IMAGE_REF: WallpaperRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 2,
  height: 2,
}
const VIDEO_REF: WallpaperRef = {
  attachmentId: `sha256:${'b'.repeat(64)}`,
  mediaType: 'video/webm',
  bytes: 4,
}

function attachmentsStub(): AttachmentStore {
  return {
    imageLimits: Object.freeze({
      maxImageBytes: 8,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 8,
      maxImagePixels: 100,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    }),
    videoLimits: Object.freeze({
      maxVideoBytes: 8,
      mediaTypes: ['video/mp4', 'video/webm', 'video/ogg'],
    }),
    validateImage: () => Promise.resolve(),
    saveImage: () => Promise.resolve({ ...IMAGE_REF, name: 'strip-me.png' }),
    readImage: (ref: WallpaperRef) => Promise.resolve({
      ref,
      data: new Uint8Array([1, 2, 3]),
    }),
    saveVideo: () => Promise.resolve({ ...VIDEO_REF, name: 'strip-me.webm' }),
    readVideo: (ref: WallpaperRef) => Promise.resolve({
      ref,
      data: new Uint8Array([1, 1, 2, 2]),
    }),
  } as unknown as AttachmentStore
}

/** In-memory settings document (the standard MemorySettings fixture). */
class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

const live: Context[] = []
const base = () => `http://127.0.0.1:${live.at(-1)!.webServer.port}`

afterAll(async () => { await Promise.all(live.map(ctx => ctx.fiber.dispose())) })

/** Boot one Host composition: real settings provider + real WebServer. */
async function boot(attachments: AttachmentStore): Promise<Context> {
  const ctx = new Context()
  const { apply } = await import('../src/index.ts')
  await ctx.plugin(MemorySettings).await()
  ctx.provide('attachments', attachments)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  live.push(ctx)
  await ctx.plugin({ apply }).await()
  return ctx
}

const NS = settingsNamespace('ui-aqua')

describe('ui-aqua host', () => {
  it('registers and validates the durable namespace', async () => {
    const ctx = await boot(attachmentsStub())
    expect(ctx.settings.get(NS)).toEqual(AQUA_DEFAULTS)
    await ctx.settings.update(NS, { mode: 'compat', blur: 30 })
    expect(ctx.settings.get(NS)).toMatchObject({ mode: 'compat', blur: 30 })
    await expect(ctx.settings.update(NS, { blur: 99 })).rejects.toThrow()
  })

  it('renders the boot glass for an enabled section and nothing when off', async () => {
    const ctx = await boot(attachmentsStub())
    const HTML = '<html><head></head><body></body></html>'
    const injected = ctx.webServer.applyIndexTaps(HTML)
    expect(injected.indexOf('<style>')).toBeGreaterThan(0)
    expect(injected).toContain("setAttribute('data-dsh-aqua','')")
    expect(injected).toContain('--dsw-alias-bg-base:#0C121B')
    await ctx.settings.update(NS, { enabled: false })
    expect(ctx.webServer.applyIndexTaps(HTML)).toBe(HTML)
  })

  it('admits same-origin image and video uploads and strips display names', async () => {
    await boot(attachmentsStub())
    const image = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'content-length': '3' },
      body: Buffer.alloc(3, 1),
    })
    expect(image.status).toBe(201)
    expect(await image.json()).toEqual(IMAGE_REF)
    const video = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'video/webm', 'content-length': '4' },
      body: Buffer.alloc(4, 1),
    })
    expect(video.status).toBe(201)
    expect(await video.json()).toEqual(VIDEO_REF)
  })

  it('rejects cross-site writes, unsupported types, and oversize bodies', async () => {
    await boot(attachmentsStub())
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/png', 'sec-fetch-site': 'cross-site', 'content-length': '3' }, body: Buffer.alloc(3, 1),
    })).status).toBe(403)
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'video/avi', 'content-length': '3' }, body: Buffer.alloc(3, 1),
    })).status).toBe(415)
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/png', 'content-length': '9' }, body: Buffer.alloc(9, 1),
    })).status).toBe(413)
  })

  it('serves the current image with ETag revalidation and 404s without one', async () => {
    const ctx = await boot(attachmentsStub())
    await ctx.settings.update(NS, { background: 'wallpaper', wallpaper: IMAGE_REF })
    const first = await fetch(`${base()}/backgrounds/current`)
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/png')
    expect(first.headers.get('accept-ranges')).toBe('bytes')
    const revalidate = await fetch(`${base()}/backgrounds/current`, { headers: { 'if-none-match': first.headers.get('etag')! } })
    expect(revalidate.status).toBe(304)
    const bare = await boot(attachmentsStub())
    expect((await fetch(`http://127.0.0.1:${bare.webServer.port}/backgrounds/current`)).status).toBe(404)
  })

  it('serves a video wallpaper in whole and as one byte range', async () => {
    const ctx = await boot(attachmentsStub())
    await ctx.settings.update(NS, { background: 'wallpaper', wallpaper: VIDEO_REF })
    const whole = await fetch(`${base()}/backgrounds/current`)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('content-type')).toBe('video/webm')
    expect((await whole.arrayBuffer()).byteLength).toBe(4)
    const ranged = await fetch(`${base()}/backgrounds/current`, { headers: { range: 'bytes=1-2' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-range')).toBe('bytes 1-2/4')
    expect(Buffer.from(await ranged.arrayBuffer()).equals(Buffer.from([1, 2]))).toBe(true)
  })

  it('maps store rejections to 422 and a missing object to 404', async () => {
    const rejecting = attachmentsStub()
    ;(rejecting as { saveImage: unknown }).saveImage = () => Promise.reject(new AttachmentError('no', 'IMAGE_TOO_LARGE'))
    ;(rejecting as { readVideo: unknown }).readVideo = () => Promise.reject(new AttachmentError('gone', 'ATTACHMENT_NOT_FOUND'))
    const ctx = await boot(rejecting)
    await ctx.settings.update(NS, { background: 'wallpaper', wallpaper: VIDEO_REF })
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/png', 'content-length': '3' }, body: Buffer.alloc(3, 1),
    })).status).toBe(422)
    expect((await fetch(`${base()}/backgrounds/current`)).status).toBe(404)
  })
})
