# @deepseek-ai/dsh-attachment

English | [中文](README.zh.md)

The durable attachment seam. `ctx.attachments` validates and durably commits immutable image bytes, then returns a serializable `ImageAttachmentRef`; consumers never persist browser paths, object URLs, provider URLs, or base64 in session events.

Unsent composer images remain browser-owned temporary drafts. `validateImage` runs the same admission policy without persisting. `saveImages` owns batch count and aggregate-byte limits, validates every member before writing any member, then commits in order and returns references only after the complete batch succeeds. A later storage failure returns no partial references, although an earlier immutable content-addressed object may remain unreachable until reference-aware garbage collection exists. `AttachmentError.code` uses the closed `AttachmentErrorCode` string union. Its `ImageAdmissionErrorCode` subset marks caller-correctable image-input failures; `isImageAdmissionError` recognizes that subset at runtime so each protocol adapter can map its own error vocabulary. `saveImage` commits one accepted image before any model-visible session event is published, and `readImage` verifies the content-addressed object against its logged metadata. Callers may cancel `readImage`; implementations observe cancellation around backend and verification work and preserve it instead of translating it into a storage failure.

Videos ride the same object store with a lighter admission story: `saveVideo` verifies declared container magic bytes (MP4 `ftyp`, WebM/Matroska EBML, Ogg) and the `videoLimits` byte cap, then commits a `VideoAttachmentRef` carrying no intrinsic dimensions — the store owns no demuxer, so admission proves a well-formed container, never a decodable stream. `readVideo` re-verifies digest and container. Videos are single-object media (wallpapers), so there is no batch-validation member: `saveVideo` is the validation gate.

## Model Experience

Indirectly, through the role-neutral core `ImageBlock` and provider adapters that resolve its durable reference.

#### KV Cache effect

Adding an image changes the provider request and therefore invalidates the affected request suffix.

## Known Limitations and Deferred Work

- Version one accepts PNG, JPEG, WebP, and GIF images; videos accept MP4, WebM, and Ogg containers by magic bytes only.
- Video admission proves container well-formedness, not codec decodability; a sniffed object may still fail to play in a client.
- Retention and garbage collection are deferred because resumed and forked sessions may share immutable objects.
- Generic files, audio, and persistent unsent drafts require separate lifecycle and provider contracts.
