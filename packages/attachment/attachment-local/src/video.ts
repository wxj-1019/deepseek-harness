/** Motion-media inspection: container magic-byte sniffing at admission and on verified reads. */

import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { VideoMediaType } from '@deepseek-ai/dsh-attachment'

/** Sniffed container format from a supported video. */
export interface DetectedVideo {
  mediaType: VideoMediaType
}

/**
 * Identify a supported video container by its magic bytes.
 * Sniffing is the whole admission story for videos: no demux or decode runs,
 * so a sniffed object is a well-formed container, never a verified stream.
 * @param data - complete encoded video bytes.
 * @returns verified container media type.
 */
export function detectVideo(data: Uint8Array): DetectedVideo {
  // MP4 family: bytes 4..8 carry the 'ftyp' box brand.
  if (data.length >= 8 && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    return { mediaType: 'video/mp4' }
  }
  // WebM/Matroska: EBML magic 0x1A45DFA3 at offset 0.
  if (data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
    return { mediaType: 'video/webm' }
  }
  // Ogg: page capture pattern 'OggS' at offset 0.
  if (data.length >= 4 && data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) {
    return { mediaType: 'video/ogg' }
  }
  throw new AttachmentError('Unsupported or malformed video data.', 'INVALID_VIDEO')
}
