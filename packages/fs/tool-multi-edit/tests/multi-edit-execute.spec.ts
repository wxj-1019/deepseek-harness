import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FileSystem, type FsWriteIntent, type FsWriteOutcome } from '@deepseek-ai/dsh-fs'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolMultiEdit from '@deepseek-ai/dsh-tool-multi-edit'

const contexts: Context[] = []
const roots: string[] = []
let callNumber = 0

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

interface WriteCall {
  key: string
  content: string
  expected: FsWriteIntent | undefined
  producedVersion: string | null
  hadSignal: boolean
}

class ScriptedFs extends LocalFileSystem {
  /** 1-based writeText call indexes that fail with an injected error. */
  readonly failAt = new Set<number>()
  /** Every successful writeText call in order, with the version it produced. */
  readonly writes: WriteCall[] = []

  // Not a `#private` field: ctx.fs is a scoped proxy, so methods can run with
  // the proxy as receiver, and real private fields reject foreign receivers.
  private count = 0

  override async writeText(...args: Parameters<FileSystem['writeText']>): Promise<FsWriteOutcome> {
    const [target, content, expected, signal] = args
    this.count += 1
    if (this.failAt.has(this.count)) throw new Error(`injected write failure #${this.count}`)
    const outcome = await super.writeText(...args)
    this.writes.push({
      key: target.targetKey, content, expected, producedVersion: String(outcome.version), hadSignal: signal !== undefined,
    })
    return outcome
  }
}

function agent(ctx: Context, cwd: string): Agent {
  const id = SessionId(`multi-edit-owner-${callNumber}`)
  const scope = ctx.plugin(() => {})
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd })
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  ctx.agents.register(value)
  return value
}

function call(ctx: Context, owner: Agent, args: unknown) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`multi-edit-${++callNumber}`),
    name: 'multi_edit',
    arguments: args,
    agent: owner,
  })
}

/** Run a call expected to fail and return the failure message the model would see. */
async function failureMessage(ctx: Context, owner: Agent, args: unknown): Promise<string> {
  const result = await call(ctx, owner, args)
  if (!result.isError) throw new Error(`expected the call to fail, got ${JSON.stringify(result.value)}`)
  return result.error.message
}

async function setup(failAt: readonly number[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-multi-edit-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ScriptedFs, { cwd: root })
  const fs = ctx.fs as ScriptedFs
  for (const index of failAt) fs.failAt.add(index)
  await ctx.plugin(ToolMultiEdit, {})
  const owner = agent(ctx, root)
  const write = async (name: string, content: string): Promise<void> => {
    await writeFile(join(root, name), content, 'utf8')
  }
  const read = async (name: string): Promise<string> => readFile(join(root, name), 'utf8')
  return { ctx, root, owner, write, read, fs }
}

const crossFileEdits = [
  { path: 'a.txt', oldString: 'one', newString: 'ONE' },
  { path: 'b.txt', oldString: 'one', newString: 'ONE' },
]

describe('multi_edit execute', () => {
  it('applies a cross-file batch and writes every planned file', async () => {
    const { ctx, owner, write, read } = await setup()
    await write('a.txt', 'alpha one\n')
    await write('b.txt', 'beta one\n')
    const result = await call(ctx, owner, { edits: crossFileEdits })
    expect(result.isError).toBe(false)
    expect((result as { value: { applied: number; files: string[] } }).value).toEqual({ applied: 2, files: ['a.txt', 'b.txt'] })
    expect(await read('a.txt')).toBe('alpha ONE\n')
    expect(await read('b.txt')).toBe('beta ONE\n')
  })

  it('rolls back written files to pre-batch content when a later write fails', async () => {
    const { ctx, owner, write, read } = await setup([2])
    await write('a.txt', 'alpha one\n')
    await write('b.txt', 'beta one\n')
    const message = await failureMessage(ctx, owner, { edits: crossFileEdits })
    expect(message).toContain('b.txt failed: injected write failure #2')
    expect(message).toContain('rolled back 1 of 1 written file(s) to their pre-batch content')
    expect(await read('a.txt')).toBe('alpha one\n')
  })

  it('guards each restore on the version its batch write produced', async () => {
    const { ctx, owner, write, fs } = await setup([2])
    await write('a.txt', 'alpha one\n')
    await write('b.txt', 'beta one\n')
    await failureMessage(ctx, owner, { edits: crossFileEdits })
    expect(fs.writes).toHaveLength(2)
    const [batchWrite, restoreWrite] = fs.writes
    expect(restoreWrite.content).toBe('alpha one\n')
    expect(restoreWrite.expected).toEqual({ kind: 'replaceIfVersion', version: batchWrite.producedVersion })
    // The batch write rides the call's signal; the restore is bounded cleanup and rides none.
    expect(batchWrite.hadSignal).toBe(true)
    expect(restoreWrite.hadSignal).toBe(false)
  })

  it('names unrestored files when restoration itself fails', async () => {
    const { ctx, owner, write, read } = await setup([2, 3])
    await write('a.txt', 'alpha one\n')
    await write('b.txt', 'beta one\n')
    const message = await failureMessage(ctx, owner, { edits: crossFileEdits })
    expect(message).toContain('b.txt failed: injected write failure #2')
    expect(message).toContain('rolled back 0 of 1 written file(s)')
    expect(message).toContain('RESTORE FAILED — edited content remains in a.txt')
    expect(await read('a.txt')).toBe('alpha ONE\n')
  })

  it('reports the failure without rollback wording when the first write fails', async () => {
    const { ctx, owner, write, read } = await setup([1])
    await write('a.txt', 'alpha one\n')
    await write('b.txt', 'beta one\n')
    const message = await failureMessage(ctx, owner, { edits: crossFileEdits })
    expect(message).toContain('a.txt failed: injected write failure #1')
    expect(message).not.toContain('rolled back')
    expect(await read('a.txt')).toBe('alpha one\n')
    expect(await read('b.txt')).toBe('beta one\n')
  })
})
