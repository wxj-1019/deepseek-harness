/** Durable attachment vocabulary. @module @deepseek-ai/dsh-attachment/types */

import type { AttachmentId } from './brand.ts'

export type { AttachmentId } from './brand.ts'

/** Raster image formats accepted by the version-one attachment path. */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Durable, serializable metadata for one immutable image object. */
export interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
}

/** Deployment-resolved limits used by upload admission and request buffering. */
export interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  mediaTypes: readonly ImageMediaType[]
}

/** Request to validate and durably commit one image. */
export interface SaveImageAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}

/** Stored image bytes returned after reference and digest verification. */
export interface StoredImageAttachment {
  ref: ImageAttachmentRef
  data: Uint8Array
}

/** Motion-media container formats accepted by the version-one video path. */
export type VideoMediaType = 'video/mp4' | 'video/webm' | 'video/ogg'

/**
 * Durable, serializable metadata for one immutable video object. Unlike
 * {@link ImageAttachmentRef} it carries no intrinsic dimensions: admission
 * verifies container magic bytes only, and probing encoded dimensions would
 * require a demuxer the store does not own.
 */
export interface VideoAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: VideoMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Optional display name stripped of local path information. */
  name?: string
}

/** Deployment-resolved limits used by video upload admission and request buffering. */
export interface VideoAttachmentLimits {
  maxVideoBytes: number
  mediaTypes: readonly VideoMediaType[]
}

/** Request to validate and durably commit one video. */
export interface SaveVideoAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against container magic bytes. */
  mediaType: VideoMediaType
  /** Optional browser display name; it is never interpreted as a path. */
  name?: string
}

/** Stored video bytes returned after reference and digest verification. */
export interface StoredVideoAttachment {
  ref: VideoAttachmentRef
  data: Uint8Array
}
