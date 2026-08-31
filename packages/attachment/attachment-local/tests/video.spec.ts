/** Video admission and serving over the content-addressed object store:
 * container sniffing gates every save, the byte cap refuses early, identical
 * bytes dedupe onto one object, and reads verify digest and container. */

import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { VideoAttachmentLimits, VideoAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { readVideoFile, saveVideoFile } from '../src/store.ts'

/** Minimal magic-valid containers; the store sniffs, it never decodes. */
function container(kind: 'mp4' | 'webm' | 'ogg', extra = 32): Uint8Array {
  const prefix = kind === 'mp4'
    ? [0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]
    : kind === 'webm'
      ? [0x1a, 0x45, 0xdf, 0xa3]
      : [0x4f, 0x67, 0x67, 0x53]
  return Uint8Array.from([...prefix, ...new Array<number>(extra).fill(1)])
}

const LIMITS: VideoAttachmentLimits = {
  maxVideoBytes: 128,
  mediaTypes: ['video/mp4', 'video/webm', 'video/ogg'],
}

const roots: string[] = []

afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true })
})

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-video-'))
  roots.push(root)
  return root
}

function refOf(saved: VideoAttachmentRef, mediaType: VideoAttachmentRef['mediaType']): VideoAttachmentRef {
  return { ...saved, mediaType }
}

describe('saveVideoFile', () => {
  it('admits each sniffed container with its declared type', async () => {
    const root = await freshRoot()
    for (const [kind, mediaType] of [
      ['mp4', 'video/mp4'], ['webm', 'video/webm'], ['ogg', 'video/ogg'],
    ] as const) {
      const saved = await saveVideoFile(root, { data: container(kind), mediaType }, LIMITS)
      expect(saved.mediaType).toBe(mediaType)
      expect(saved.bytes).toBe(container(kind).byteLength)
      expect(saved.attachmentId).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  it('refuses empty bodies, oversize bodies, and bytes that contradict the declared type', async () => {
    const root = await freshRoot()
    await expect(saveVideoFile(root, { data: new Uint8Array(), mediaType: 'video/mp4' }, LIMITS))
      .rejects.toMatchObject({ code: 'INVALID_VIDEO' })
    await expect(saveVideoFile(root, { data: container('mp4', 200), mediaType: 'video/mp4' }, LIMITS))
      .rejects.toMatchObject({ code: 'VIDEO_TOO_LARGE' })
    await expect(saveVideoFile(root, { data: container('webm'), mediaType: 'video/mp4' }, LIMITS))
      .rejects.toMatchObject({ code: 'VIDEO_TYPE_MISMATCH' })
    await expect(saveVideoFile(root, { data: new Uint8Array(64), mediaType: 'video/mp4' }, LIMITS))
      .rejects.toMatchObject({ code: 'INVALID_VIDEO' })
  })

  it('refuses a declared type outside the admitted media-type list', async () => {
    const root = await freshRoot()
    const narrow: VideoAttachmentLimits = { maxVideoBytes: 128, mediaTypes: ['video/webm'] }
    await expect(saveVideoFile(root, { data: container('mp4'), mediaType: 'video/mp4' }, narrow))
      .rejects.toMatchObject({ code: 'VIDEO_TYPE_MISMATCH' })
  })

  it('dedupes byte-identical saves onto one object and one reference', async () => {
    const root = await freshRoot()
    const data = container('webm')
    const first = await saveVideoFile(root, { data, mediaType: 'video/webm' }, LIMITS)
    const second = await saveVideoFile(root, { data, mediaType: 'video/webm' }, LIMITS)
    expect(second).toEqual(first)
    expect(createHash('sha256').update(data).digest('hex')).toBe(first.attachmentId.slice('sha256:'.length))
  })
})

describe('readVideoFile', () => {
  it('returns the stored bytes after digest and container verification', async () => {
    const root = await freshRoot()
    const data = container('ogg')
    const saved = await saveVideoFile(root, { data, mediaType: 'video/ogg', name: 'waves\\clip.ogg' }, LIMITS)
    expect(saved.name).toBe('clip.ogg')
    const stored = await readVideoFile(root, saved)
    expect(Buffer.from(stored.data).equals(Buffer.from(data))).toBe(true)
    expect(stored.ref).toEqual(saved)
  })

  it('fails loud on a missing object, a tampered object, and a reference that lies', async () => {
    const root = await freshRoot()
    const saved = await saveVideoFile(root, { data: container('mp4'), mediaType: 'video/mp4' }, LIMITS)
    const sha = saved.attachmentId.slice('sha256:'.length)
    const objectPath = join(root, 'objects', sha.slice(0, 2), sha)
    const { chmod, readFile, writeFile } = await import('node:fs/promises')

    const dangling = { ...saved, attachmentId: `sha256:${'ab'.repeat(32)}` } as VideoAttachmentRef
    await expect(readVideoFile(root, dangling)).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' })

    await chmod(objectPath, 0o600)
    await writeFile(objectPath, Buffer.from(container('webm')))
    await expect(readVideoFile(root, saved)).rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })

    await chmod(objectPath, 0o600)
    await writeFile(objectPath, Buffer.from(container('mp4')))
    await expect(readVideoFile(root, refOf(saved, 'video/webm'))).rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })
    await expect(readVideoFile(root, { ...saved, bytes: saved.bytes + 1 })).rejects.toMatchObject({ code: 'ATTACHMENT_CORRUPT' })

    await expect(readVideoFile(root, { ...saved, attachmentId: 'not-a-hash' } as unknown as VideoAttachmentRef))
      .rejects.toBeInstanceOf(AttachmentError)
    const restored = await readFile(objectPath)
    expect(restored.byteLength).toBe(saved.bytes)
  })
})
