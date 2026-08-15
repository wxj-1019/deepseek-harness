/** Host half: durable namespace registration, /backgrounds admission and
 * serving (the /api browser-trust fence, limits from the attachments policy,
 * ETag revalidation, 404 without a current image), and the boot index tap. */
import { request } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { AttachmentError, type AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_BACKGROUND, BACKGROUND_SETTINGS_NAMESPACE, type BackgroundImageRef } from '../src/background-settings.ts'
import type { BackgroundHostConfig } from '../src/index.ts'

const REF: BackgroundImageRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 2,
  height: 2,
}

/** Store failures a stub simulates (durable-save and missing-object paths). */
interface StubFailures {
  save?: Error
  read?: Error
}

function attachmentsStub(
  over: Partial<Record<'saved', number>> = {},
  failures: StubFailures = {},
): AttachmentStore {
  return {
    imageLimits: Object.freeze({
      maxImageBytes: 8,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 8,
      maxImagePixels: 100,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    }),
    validateImage: () => Promise.resolve(),
    saveImage: () => {
      if (failures.save !== undefined) return Promise.reject(failures.save)
      over.saved = (over.saved ?? 0) + 1
      return Promise.resolve({ ...REF })
    },
    readImage: (ref: BackgroundImageRef) => {
      if (failures.read !== undefined) return Promise.reject(failures.read)
      return Promise.resolve({ ref, data: new Uint8Array([1, 2, 3]) })
    },
  } as unknown as AttachmentStore
}

/** In-memory settings document (the ui-theme host spec's MemorySettings). */
class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

const live: Context[] = []
const base = () => `http://127.0.0.1:${String(live.at(-1)!.webServer.port)}`

afterAll(async () => { await Promise.all(live.map(ctx => ctx.fiber.dispose())) })

/** Boot one Host composition: real settings provider + real WebServer. */
async function boot(attachments: AttachmentStore, config?: BackgroundHostConfig): Promise<Context> {
  const ctx = new Context()
  const { apply } = await import('../src/index.ts')
  await ctx.plugin(MemorySettings).await()
  ctx.provide('attachments', attachments)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  live.push(ctx)
  await ctx.plugin({ apply }, config).await()
  return ctx
}

/** One raw request with forged authority headers — fetch refuses to send Host
 * or Origin, so the fence's rebound/cross-origin vectors need node:http. */
function forge(
  port: number, path: string, headers: Record<string, string>, method: 'GET' | 'POST' = 'GET', body?: Buffer,
): Promise<{ status: number; etag: string | null }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      res.resume()
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, etag: res.headers.etag ?? null }) })
    })
    req.on('error', reject)
    req.end(body)
  })
}

/** Boot only the HTTP carrier: the boot tap must stand alone without settings. */
async function bootHttpOnly(): Promise<Context> {
  const ctx = new Context()
  const { apply } = await import('../src/index.ts')
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  live.push(ctx)
  await ctx.plugin({ apply }).await()
  return ctx
}

/** The boot tap runs through the real pipeline the fallback owner uses. */
function tapOutput(ctx: Context, html: string): string {
  return ctx.webServer.applyIndexTaps(html)
}

describe('ui-background host', () => {
  it('registers, validates, and disposes the durable namespace', async () => {
    const ctx = new Context()
    const { apply } = await import('../src/index.ts')
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)
    expect(ctx.settings.get(ns)).toEqual(DEFAULT_BACKGROUND)
    await ctx.settings.update(ns, { preference: 'preset', preset: 'aurora' })
    expect(ctx.settings.get(ns)).toMatchObject({ preference: 'preset', preset: 'aurora', dimming: 45 })
    await expect(ctx.settings.update(ns, { preference: 'sepia' })).rejects.toThrow()
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
    await ctx.fiber.dispose()
  })

  it('renders the current section through the boot index tap', async () => {
    const ctx = await boot(attachmentsStub())
    const HTML = '<html><head></head><body></body></html>'
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), { preference: 'preset', preset: 'aurora' })
    expect(tapOutput(ctx, HTML)).toContain('linear-gradient(160deg, #dce7fb')
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), { preference: 'none' })
    expect(tapOutput(ctx, HTML)).toBe(HTML)
  })

  it('keeps the boot tap an identity without a settings provider', async () => {
    const ctx = await bootHttpOnly()
    const HTML = '<html><head></head><body></body></html>'
    expect(tapOutput(ctx, HTML)).toBe(HTML)
    // A settings service that does not know the namespace falls back the same way.
    ctx.provide('settings', {
      register: () => ({ get: () => undefined, watch: () => () => {}, update: () => Promise.resolve(), replace: () => Promise.resolve() }),
      get: () => undefined,
    } as unknown as SettingsProvider)
    expect(tapOutput(ctx, HTML)).toBe(HTML)
  })

  it('admits a same-origin upload through the attachment store', async () => {
    const counters: Partial<Record<'saved', number>> = {}
    await boot(attachmentsStub(counters))
    const response = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: Buffer.alloc(3, 1),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ attachmentId: REF.attachmentId, mediaType: 'image/png' })
    expect(counters.saved).toBe(1)
  })

  it('rejects cross-site writes with 403', async () => {
    await boot(attachmentsStub())
    const response = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'sec-fetch-site': 'cross-site' },
      body: Buffer.alloc(3, 1),
    })
    expect(response.status).toBe(403)
  })

  it('holds both methods to the /api trust fence', async () => {
    const ctx = await boot(attachmentsStub(), { trustedHosts: ['harness.internal:3080'] })
    const port = ctx.webServer.port
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), { preference: 'image', image: REF })
    // A declared authority is admitted on both the write and the read side.
    const admitted = await forge(port, '/backgrounds', {
      host: 'harness.internal:3080', origin: 'http://harness.internal:3080', 'sec-fetch-site': 'same-origin',
      'content-type': 'image/png',
    }, 'POST', Buffer.alloc(3, 1))
    expect(admitted.status).toBe(201)
    expect((await forge(port, '/backgrounds/current', { host: 'harness.internal:3080' })).status).toBe(200)
    // A rebound Host (DNS rebinding) is refused with no marker shortcut.
    expect((await forge(port, '/backgrounds', {
      host: 'evil.example:3080', origin: 'http://evil.example:3080', 'sec-fetch-site': 'same-origin',
      'content-type': 'image/png',
    }, 'POST', Buffer.alloc(3, 1))).status).toBe(403)
    // A foreign Origin on a loopback Host is a cross-origin browser request.
    expect((await forge(port, '/backgrounds/current', {
      host: `127.0.0.1:${String(port)}`, origin: 'http://evil.example',
    })).status).toBe(403)
    // An exact-port entry does not authorize other ports on that host.
    expect((await forge(port, '/backgrounds/current', { host: 'harness.internal:9999' })).status).toBe(403)
  })

  it('fails the load on a trustedHosts entry that is not a bare authority', async () => {
    const ctx = new Context()
    const { apply } = await import('../src/index.ts')
    await ctx.plugin(MemorySettings).await()
    ctx.provide('attachments', attachmentsStub())
    await expect(ctx.plugin({ apply }, { trustedHosts: ['not a host!'] }))
      .rejects.toThrow(/not a bare host\[:port\] authority/)
    await ctx.fiber.dispose()
  })

  it('rejects unsupported media types with 415 and oversize bodies with 413', async () => {
    await boot(attachmentsStub())
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/bmp' }, body: Buffer.alloc(3, 1),
    })).status).toBe(415)
    // fetch derives content-length from the body, so the declared cap rejects it.
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.alloc(9, 1),
    })).status).toBe(413)
  })

  it('caps a chunked body while streaming', async () => {
    await boot(attachmentsStub())
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(3).fill(1))
        controller.enqueue(new Uint8Array(3).fill(1))
        controller.enqueue(new Uint8Array(3).fill(1))
        controller.close()
      },
    })
    const response = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body,
      // Node fetch requires duplex for stream bodies; lib.dom RequestInit omits it.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    expect(response.status).toBe(413)
  })

  it('maps a durable-save rejection to 422 with the store code', async () => {
    await boot(attachmentsStub({}, { save: new AttachmentError('invalid image', 'ATTACHMENT_INVALID') }))
    const response = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: Buffer.alloc(3, 1),
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'rejected', code: 'ATTACHMENT_INVALID' })
    // An unrelated save failure escapes to the carrier's per-request containment (400).
    await boot(attachmentsStub({}, { save: new Error('backend unavailable') }))
    const escaped = await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.alloc(3, 1),
    })
    expect(escaped.status).toBe(400)
  })

  it('serves the current image with ETag revalidation and 404 without one', async () => {
    const ctx = await boot(attachmentsStub())
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), {
      preference: 'image', image: REF,
    })
    const first = await fetch(`${base()}/backgrounds/current`)
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/png')
    expect(first.headers.get('cache-control')).toBe('no-cache')
    const etag = first.headers.get('etag')
    const revalidate = await fetch(`${base()}/backgrounds/current`, { headers: { 'if-none-match': etag! } })
    expect(revalidate.status).toBe(304)

    const bare = await boot(attachmentsStub())
    expect((await fetch(`http://127.0.0.1:${String(bare.webServer.port)}/backgrounds/current`)).status).toBe(404)
  })

  it('answers HEAD on the current image with the ETag and no body', async () => {
    const ctx = await boot(attachmentsStub())
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), {
      preference: 'image', image: REF,
    })
    const response = await fetch(`${base()}/backgrounds/current`, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toBe(`"${REF.attachmentId}"`)
    expect(await response.text()).toBe('')
  })

  it('answers 404 when the stored object is missing and 400 on unrelated read failures', async () => {
    const ctx = await boot(attachmentsStub({}, {
      read: new AttachmentError('missing object', 'ATTACHMENT_NOT_FOUND'),
    }))
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), {
      preference: 'image', image: REF,
    })
    const response = await fetch(`${base()}/backgrounds/current`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'missing' })

    // Every other read failure escapes to the carrier's per-request containment.
    const wrongCode = await boot(attachmentsStub({}, {
      read: new AttachmentError('digest mismatch', 'ATTACHMENT_DIGEST_MISMATCH'),
    }))
    await wrongCode.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), {
      preference: 'image', image: REF,
    })
    expect((await fetch(`${base()}/backgrounds/current`)).status).toBe(400)

    const unrelated = await boot(attachmentsStub({}, { read: new Error('backend unavailable') }))
    await unrelated.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), {
      preference: 'image', image: REF,
    })
    expect((await fetch(`${base()}/backgrounds/current`)).status).toBe(400)
  })

  it('answers 404 on unmatched subpaths under the prefix', async () => {
    await boot(attachmentsStub())
    expect((await fetch(`${base()}/backgrounds/other`)).status).toBe(404)
    expect((await fetch(`${base()}/backgrounds/other`, { method: 'POST' })).status).toBe(404)
  })
})
