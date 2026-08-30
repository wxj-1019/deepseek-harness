/**
 * The model-facing `multi_edit` tool: apply a batch of literal string edits
 * across one or more files in ONE call. Two phases keep a partial batch from
 * landing on a surprise: every target is read and every `old_string` is
 * counted BEFORE anything writes, then each file writes through the
 * version-guarded replace intent (a concurrent change fails that write
 * loudly instead of overwriting). Edits to the same file apply sequentially
 * on the evolving content. A mid-batch write failure rolls every
 * already-written file back to its pre-batch content in reverse write order;
 * the failure names the file that broke the batch and, should restoration
 * itself fail, the files whose edited content remains on disk.
 * @module @deepseek-ai/dsh-tool-multi-edit
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
// Type-only: pulls the ctx.fs declaration merge (the filesystem service) into this program.
import type {} from '@deepseek-ai/dsh-fs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-multi-edit'

/** Services required by the batch edit tool. */
export const inject = ['tools', 'fs', 'systemPrompt']

/** Model-facing multi-edit tool configuration. */
export interface Config {
  /** Max edits one `multi_edit` call accepts. */
  maxEdits?: number
}

export const Config: z<Config> = z.object({
  maxEdits: z.number().default(25),
})

/** One model-specified edit. */
export interface EditInput {
  /** Target file path, resolved against the calling agent's workspace. */
  readonly path: string
  /** The exact existing text to replace. */
  readonly oldString: string
  /** The replacement text. */
  readonly newString: string
  /** Replace every occurrence instead of requiring exactly one. */
  readonly replaceAll?: boolean
}

/** One validated edit (argument errors already rejected). */
export interface ValidatedEdit {
  readonly path: string
  readonly oldString: string
  readonly newString: string
  readonly replaceAll: boolean
}

/** Validation failure for one edit, reported per index. */
export interface EditRejection {
  readonly index: number
  readonly reason: string
}

/**
 * Validate a batch: non-blank strings, at least one edit, and no more than
 * the configured cap.
 * @param edits - the raw model edits.
 * @param maxEdits - the configured batch cap.
 * @returns the validated edits in order, or the rejections.
 */
export function validateEdits(edits: readonly EditInput[], maxEdits: number):
  { readonly ok: true; readonly edits: readonly ValidatedEdit[] } | { readonly ok: false; readonly rejections: readonly EditRejection[] } {
  const rejections: EditRejection[] = []
  if (edits.length === 0) rejections.push({ index: 0, reason: 'edits must contain at least one edit' })
  if (edits.length > maxEdits) rejections.push({ index: maxEdits, reason: `edits exceeds the ${maxEdits}-edit cap; split the batch` })
  edits.forEach((edit, index) => {
    if (edit.path.trim().length === 0) rejections.push({ index, reason: 'path must be a non-empty string' })
    else if (edit.oldString.length === 0) rejections.push({ index, reason: 'oldString must be non-empty' })
    else if (edit.oldString === edit.newString) rejections.push({ index, reason: 'newString must differ from oldString' })
  })
  return rejections.length > 0 ? { ok: false, rejections } : { ok: true, edits: edits.map(edit => ({
    path: edit.path,
    oldString: edit.oldString,
    newString: edit.newString,
    replaceAll: edit.replaceAll === true,
  })) }
}

/** The number of times `needle` occurs in `content`. */
export function occurrenceCount(content: string, needle: string): number {
  let count = 0
  let at = content.indexOf(needle)
  while (at !== -1) {
    count += 1
    at = content.indexOf(needle, at + needle.length)
  }
  return count
}

/**
 * Apply one literal replacement to content: exactly once by default, every
 * occurrence with `replaceAll`.
 * @param content - the text to edit.
 * @param oldString - the exact existing text.
 * @param newString - the replacement.
 * @param replaceAll - whether every occurrence is replaced.
 * @returns the edited text.
 * @throws Error when the occurrence requirement is not met.
 */
export function applyOne(content: string, oldString: string, newString: string, replaceAll: boolean): string {
  const count = occurrenceCount(content, oldString)
  if (count === 0) throw new Error('oldString not found in file')
  if (count > 1 && !replaceAll) {
    throw new Error(`oldString occurs ${count} times; make it unique or set replaceAll`)
  }
  return replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString)
}

/**
 * Register the `multi_edit` tool and its system-prompt guidance.
 * @param ctx - the plugin context; registrations are effects scoped to it.
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const maxEdits = config.maxEdits ?? 25
  ctx.systemPrompt.section({
    name: 'tool:multi-edit',
    order: 104,
    text: 'Use multi_edit to land a batch of related edits in ONE call: every oldString is verified against the '
      + 'current files before anything writes, same-file edits apply in order on the evolving content, and a '
      + 'mid-batch failure rolls written files back so no partial batch remains. '
      + 'Each oldString must occur exactly once unless replaceAll is set; read the file first when unsure of the text.',
  })

  const tool = defineTool({
    name: 'multi_edit',
    description: 'Apply a batch of literal string edits across one or more files in a single call. Every edit is '
      + 'validated against the current file contents before anything is written: each oldString must occur exactly '
      + 'once in its file unless replaceAll is true, and same-file edits apply in order on the evolving content. '
      + 'Writes are version-guarded — a concurrent change to a file fails that file loudly instead of overwriting, '
      + 'and a mid-batch failure rolls already-written files back so no partial batch remains. '
      + `At most ${maxEdits} edits per call.`,
    parameters: {
      edits: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true, description: 'File to edit; a relative path resolves against the session workspace.' },
            oldString: { type: 'string', required: true, description: 'The exact existing text to replace.' },
            newString: { type: 'string', required: true, description: 'The replacement text.' },
            replaceAll: { type: 'boolean', description: 'Replace every occurrence. Defaults to false (exactly one).' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          applied: { type: 'number', required: true },
          files: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Applied ${value.applied} edit(s) across ${value.files.length} file(s): ${value.files.join(', ')}`,
      }],
    },
    async execute(args, exec: ToolExecution) {
      const validated = validateEdits(args.edits, maxEdits)
      if (!validated.ok) {
        throw new Error(validated.rejections.map(entry => `#${entry.index}: ${entry.reason}`).join('; '))
      }
      const edits = validated.edits
      const cwd = exec.agent?.session.header.cwd
      const resolveOptions = () => ({ ...(cwd !== undefined ? { cwd } : {}), signal: exec.signal })

      // Phase 1 — read and plan every file: evolving per-file content with
      // each edit folded in, plus the version each write must guard on and
      // the pre-batch content a rollback restores.
      const plan = new Map<string, { target: FsTarget; version: FsVersion; original: string; content: string; count: number }>()
      for (const edit of edits) {
        let entry = plan.get(edit.path)
        if (entry === undefined) {
          const target = await ctx.fs.resolve(edit.path, resolveOptions())
          const info = await ctx.fs.stat(target)
          if (info === undefined || info.type !== 'file') {
            throw new Error(`${edit.path}: not found (multi_edit edits existing files; use write to create)`)
          }
          const original = await ctx.fs.readText(target, exec.signal)
          entry = { target, version: info.version, original, content: original, count: 0 }
          plan.set(edit.path, entry)
        }
        try {
          entry.content = applyOne(entry.content, edit.oldString, edit.newString, edit.replaceAll)
          entry.count += 1
        } catch (error) {
          throw new Error(`${edit.path}: ${(error as Error).message}`)
        }
      }

      // Phase 2 — write every planned file, version-guarded. A mid-batch
      // failure rolls the already-written files back to their pre-batch
      // content in reverse write order, guarding each restore on the version
      // the batch's own write produced. Restoration writes omit the execution
      // signal on purpose: they are bounded cleanup of this call's own partial
      // write and must complete even when the call is being canceled.
      // Restoration failures never pass silently: the thrown report names
      // every file whose edited content remains on disk.
      const written: { path: string; target: FsTarget; version: FsVersion; original: string }[] = []
      try {
        for (const [path, entry] of plan) {
          const outcome = await ctx.fs.writeText(entry.target, entry.content, { kind: 'replaceIfVersion', version: entry.version }, exec.signal)
          written.push({ path, target: entry.target, version: outcome.version, original: entry.original })
        }
      } catch (error) {
        const writtenPaths = new Set(written.map(entry => entry.path))
        const failed = [...plan.keys()].find(path => !writtenPaths.has(path))
        const unrestored: string[] = []
        for (const entry of [...written].reverse()) {
          try {
            await ctx.fs.writeText(entry.target, entry.original, { kind: 'replaceIfVersion', version: entry.version })
          } catch {
            unrestored.push(entry.path)
          }
        }
        let message = `${failed ?? 'the next file'} failed: ${(error as Error).message}`
        const restored = written.length - unrestored.length
        if (written.length > 0) {
          message += `; rolled back ${restored} of ${written.length} written file(s) to their pre-batch content`
          if (unrestored.length > 0) message += `; RESTORE FAILED — edited content remains in ${unrestored.join(', ')}`
        }
        throw new Error(message)
      }
      return { applied: edits.length, files: [...plan.keys()] }
    },
  })
  ctx.tools.register(tool)
}
