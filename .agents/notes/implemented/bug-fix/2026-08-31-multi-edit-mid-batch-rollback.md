# Agent Note: multi_edit rolls back written files when a mid-batch write fails

Status: implemented

English | [中文](2026-08-31-multi-edit-mid-batch-rollback.zh.md)

## Problem

`multi_edit`'s write phase was sequential and non-transactional: a write failure after earlier files had already landed left the batch half-applied on disk, and the thrown report only named which files had landed. Batches are issued precisely because the edits belong together, so a partial batch is a corrupt intermediate state the caller had to clean up by hand — re-reading each landed file and restoring its prior content.

## Decision

Keep the two-phase flow. On a mid-batch failure, the tool now restores every already-written file to its pre-batch content, in reverse write order:

- The plan phase retains each file's original content alongside the evolving one.
- The write phase records the version each write produced (`FsWriteOutcome.version`); each restore is a version-guarded `replaceIfVersion` write of the original content onto that produced version. A file that changes between the batch write and its restore fails the restore instead of being clobbered.
- The thrown failure names the file that broke the batch, counts how many written files were restored, and — when a restore itself fails — names every file whose edited content remains on disk. A failure on the first file performs no restore, and the report carries no rollback wording.

## Alternatives considered

- **Keep report-only behavior** — rejected: it leaves the partial batch on disk as the caller's problem.
- **Stage all files, then swap them in** — rejected: the filesystem seam's version-guarded `writeText` already provides single-file atomicity; a staging protocol would duplicate that guarantee behind a second failure mode.
- **Restore via `editText` reverse edits** — rejected: the pre-batch content is already in memory, so a guarded full-content write is simpler and cannot miss.

## Consequences

- A failed batch leaves the workspace as it was before the call, except when restoration itself fails; that case is loud and names the unrestored files.
- Restore writes omit the call's execution signal on purpose: they are bounded cleanup of this call's own partial write and must complete even when the call is being canceled.
- The failure path costs up to one extra write per already-written file. The success path is unchanged.
