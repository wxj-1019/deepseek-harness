/** /backgrounds route handlers: upload admission and current-image serving. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { AttachmentError, AttachmentId, type AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { isTrustedApiRequest } from '@deepseek-ai/dsh-client-connection/trust'
import { settingsNamespace, type SettingsProvider } from '@deepseek-ai/dsh-settings'
import { BACKGROUND_SETTINGS_NAMESPACE, type BackgroundSettings } from './background-settings.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)

/** Services the handlers read per request. */
export interface BackgroundRouteDeps {
  /** Durable image storage (also owns the admission policy). */
  attachments: AttachmentStore
  /** Durable settings document (source of the current image reference). */
  settings: SettingsProvider
  /**
   * Non-loopback authorities this deployment serves beyond loopback, exactly
   * the /api fence's list (`trustedHosts` in the connection row's config).
   */
  trustedHosts: readonly string[]
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * The /backgrounds browser-trust fence: the same Host/Origin/Fetch-Metadata
 * checks as /api ([api-request-trust](../connection/src/api-request-trust.ts)
 * via the `connection/trust` subpath), so a rebound DNS name, a cross-site
 * browser marker, or a foreign Origin cannot write or read backgrounds.
 * @param req - request whose Host and browser markers are judged.
 * @param res - response owned by the calling handler.
 * @param deps - route services carrying the trusted-authority list.
 * @returns true when the request may reach the route's resources.
 */
function isTrustedBackgroundRequest(req: IncomingMessage, res: ServerResponse, deps: BackgroundRouteDeps): boolean {
  if (isTrustedApiRequest(req, deps.trustedHosts)) return true
  json(res, 403, { error: 'forbidden' })
  return false
}

/**
 * Refuse an over-cap body: answer first, then drop the connection — destroying
 * the request before the response flushes would strand the client without a
 * verdict (the same order the /api bridge uses).
 * @param req - request whose body is not read to the end.
 * @param res - response owned by this handler.
 */
function refuseTooLarge(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', connection: 'close' })
  res.end(JSON.stringify({ error: 'too-large' }))
  req.destroy()
}

/**
 * Admit one upload: the trust fence, then the attachment policy (declared
 * media type, byte cap), then the durable save. A declared content-length over
 * the cap refuses before any body is read; a chunked body (no declared length)
 * is capped while streaming.
 * @param req - raw request whose body is the encoded image.
 * @param res - response owned by this handler.
 * @param deps - attachments store, settings document, and trusted authorities.
 */
export async function handleBackgroundUpload(
  req: IncomingMessage, res: ServerResponse, deps: BackgroundRouteDeps,
): Promise<void> {
  if (!isTrustedBackgroundRequest(req, res, deps)) return
  const limits = deps.attachments.imageLimits
  const mediaType = limits.mediaTypes.find(type => type === req.headers['content-type'])
  if (mediaType === undefined) {
    json(res, 415, { error: 'unsupported-media-type' })
    return
  }
  const declared = req.headers['content-length']
  const contentLength = declared === undefined ? undefined : Number(declared)
  if (contentLength !== undefined
    && (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > limits.maxImageBytes)) {
    refuseTooLarge(req, res)
    return
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    received += (chunk as Buffer).byteLength
    if (received > limits.maxImageBytes) {
      refuseTooLarge(req, res)
      return
    }
    chunks.push(chunk as Buffer)
  }
  try {
    const ref = await deps.attachments.saveImage({
      data: Buffer.concat(chunks),
      mediaType,
    })
    json(res, 201, ref)
  } catch (error) {
    if (error instanceof AttachmentError) {
      json(res, 422, { error: 'rejected', code: error.code })
      return
    }
    throw error
  }
}

/**
 * Serve the current stored image: the settings document names the reference,
 * the ETag carries the content address, and `no-cache` keeps a switch correct
 * while an unchanged reload revalidates to 304. Revalidation is an exact
 * single-ETag match — list, wildcard, and weak `if-none-match` forms do not
 * match and fall back to a full 200 answer.
 * @param req - request; `if-none-match` participates in revalidation.
 * @param res - response owned by this handler.
 * @param deps - attachments store, settings document, and trusted authorities.
 */
export async function handleCurrentBackground(
  req: IncomingMessage, res: ServerResponse, deps: BackgroundRouteDeps,
): Promise<void> {
  if (!isTrustedBackgroundRequest(req, res, deps)) return
  const section = deps.settings.get(NAMESPACE) as BackgroundSettings | undefined
  const ref = section?.image
  // Null-tolerant presence check: the schema resolves an explicitly-present
  // null (hand-edited settings document) to null, which must 404, not crash.
  if (ref == null) {
    json(res, 404, { error: 'no-current-image' })
    return
  }
  const etag = `"${ref.attachmentId}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag })
    res.end()
    return
  }
  try {
    const stored = await deps.attachments.readImage({ ...ref, attachmentId: AttachmentId(ref.attachmentId) })
    res.writeHead(200, { 'content-type': stored.ref.mediaType, 'cache-control': 'no-cache', etag })
    res.end(stored.data)
  } catch (error) {
    if (error instanceof AttachmentError && error.code === 'ATTACHMENT_NOT_FOUND') {
      json(res, 404, { error: 'missing' })
      return
    }
    throw error
  }
}
