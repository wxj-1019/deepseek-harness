/** /backgrounds route handlers: wallpaper upload admission (image or video) and current-wallpaper serving with range support. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { AttachmentError, type AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  AQUA_SETTINGS_NAMESPACE, WALLPAPER_IMAGE_MEDIA_TYPES, WALLPAPER_VIDEO_MEDIA_TYPES,
  type AquaSection, type WallpaperImageRef, type WallpaperVideoRef,
} from './aqua-settings.ts'

const NAMESPACE = settingsNamespace(AQUA_SETTINGS_NAMESPACE)
type WallpaperImageMediaType = WallpaperImageRef['mediaType']
type WallpaperVideoMediaType = WallpaperVideoRef['mediaType']

/** Server path answering the current stored wallpaper. */
const CURRENT_PATH = '/backgrounds/current'

/**
 * Services the handlers read per request: the durable media store owning
 * admission and the settings document naming the current wallpaper.
 */
export interface WallpaperRouteDeps {
  /** Durable media storage (also owns the admission policy). */
  attachments: AttachmentStore
  /** Durable settings document (source of the current wallpaper reference). */
  settings: SettingsProvider
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Admit one upload: the same-origin fence, then the attachment policy for
 * the declared media kind (image limits or video limits), then the durable
 * save. The response echoes the stored reference the section persists.
 * @param req - raw request whose body is the encoded wallpaper.
 * @param res - response owned by this handler.
 * @param deps - attachments store and settings document.
 */
export async function handleWallpaperUpload(
  req: IncomingMessage, res: ServerResponse, deps: WallpaperRouteDeps,
): Promise<void> {
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    json(res, 403, { error: 'cross-site' })
    return
  }
  const declared = String(req.headers['content-type'] ?? '')
  const isImage = (WALLPAPER_IMAGE_MEDIA_TYPES as readonly string[]).some(type => type === declared)
  const isVideo = (WALLPAPER_VIDEO_MEDIA_TYPES as readonly string[]).some(type => type === declared)
  if (!isImage && !isVideo) {
    json(res, 415, { error: 'unsupported-media-type' })
    return
  }
  const maxBytes = isImage ? deps.attachments.imageLimits.maxImageBytes : deps.attachments.videoLimits.maxVideoBytes
  const contentLength = Number(req.headers['content-length'] ?? Number.NaN)
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > maxBytes) {
    // The declared length already refuses the request; answer and drain the
    // body without buffering it (destroying the socket here would take the
    // 413 response down with it).
    json(res, 413, { error: 'too-large' })
    req.resume()
    return
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    received += (chunk as Buffer).byteLength
    if (received > maxBytes) {
      req.destroy()
      json(res, 413, { error: 'too-large' })
      return
    }
    chunks.push(chunk as Buffer)
  }
  try {
    const data = new Uint8Array(Buffer.concat(chunks))
    const stored = isImage
      ? await deps.attachments.saveImage({ data, mediaType: declared as WallpaperImageMediaType })
      : await deps.attachments.saveVideo({ data, mediaType: declared as WallpaperVideoMediaType })
    // A wallpaper is anonymous media: the display name the store kept never
    // reaches the durable section.
    const { name, ...wallpaper } = stored
    void name
    json(res, 201, wallpaper)
  } catch (error) {
    if (error instanceof AttachmentError) {
      json(res, 422, { error: 'rejected', code: error.code })
      return
    }
    throw error
  }
}

/** One accepted `Range` header for byte serving, `bytes=<start>-<end>?`. */
function parseRange(header: string, total: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return undefined
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return undefined
  const start = rawStart === '' ? Math.max(0, total - Number(rawEnd)) : Number(rawStart)
  const end = rawStart === '' ? total - 1 : rawEnd === '' ? Math.min(total - 1, start + total) : Number(rawEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return undefined
  return { start, end: Math.min(end, total - 1) }
}

/**
 * Serve the current stored wallpaper: the settings document names the
 * reference, the ETag carries the content address, and `no-cache` keeps a
 * switch correct while an unchanged reload revalidates to 304. Video refs
 * answer single byte ranges (206) so the wallpaper `<video>` can seek without
 * re-downloading the whole object.
 * @param req - request; `if-none-match` and `range` participate.
 * @param res - response owned by this handler.
 * @param deps - attachments store and settings document.
 */
export async function handleCurrentWallpaper(
  req: IncomingMessage, res: ServerResponse, deps: WallpaperRouteDeps,
): Promise<void> {
  const section = deps.settings.get(NAMESPACE) as AquaSection | undefined
  const ref = section?.wallpaper
  // Null-tolerant presence check: the schema admits an explicitly-present null
  // (hand-edited settings.yaml), which must 404, not crash on property access.
  if (ref == null) {
    json(res, 404, { error: 'no-current-wallpaper' })
    return
  }
  const etag = `"${ref.attachmentId}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag })
    res.end()
    return
  }
  try {
    const stored = ref.mediaType.startsWith('video/')
      ? await deps.attachments.readVideo({
        attachmentId: ref.attachmentId as never,
        mediaType: ref.mediaType as never,
        bytes: ref.bytes,
      })
      : await deps.attachments.readImage({
        attachmentId: ref.attachmentId as never,
        mediaType: ref.mediaType as never,
        bytes: ref.bytes,
        width: (ref as { width: number }).width,
        height: (ref as { height: number }).height,
      })
    const data = Buffer.from(stored.data)
    const base = {
      'content-type': ref.mediaType,
      'cache-control': 'no-cache',
      'accept-ranges': 'bytes',
      etag,
    }
    const rangeHeader = req.headers.range
    const range = rangeHeader !== undefined && ref.mediaType.startsWith('video/')
      ? parseRange(rangeHeader, data.byteLength)
      : undefined
    if (range !== undefined) {
      res.writeHead(206, {
        ...base,
        'content-length': String(range.end - range.start + 1),
        'content-range': `bytes ${range.start}-${range.end}/${data.byteLength}`,
      })
      res.end(data.subarray(range.start, range.end + 1))
      return
    }
    res.writeHead(200, { ...base, 'content-length': String(data.byteLength) })
    res.end(data)
  } catch (error) {
    if (error instanceof AttachmentError && error.code === 'ATTACHMENT_NOT_FOUND') {
      json(res, 404, { error: 'missing' })
      return
    }
    throw error
  }
}

export { CURRENT_PATH }
