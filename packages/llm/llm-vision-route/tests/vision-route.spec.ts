/** Vision-model routing over a real agent loop with a scripted adapter. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { CallId, createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import VisionRouteConfig, { VISION_MODEL_SETTINGS_NAMESPACE } from '../src/index.ts'

/** The smallest real settings provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

/** One request-capturing adapter: `mock` is text-only, `vision` declares images. */
class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly entries: Iterable<StreamChunk>[]) {
    super()
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.entries.shift()
    if (entry === undefined) throw new Error('vision-route test script exhausted')
    yield* entry
  }

  override resolveModel(provider: string, model: string): Promise<LlmModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      inputModalities: provider === 'vision' ? ['text', 'image'] : ['text'],
    })
  }
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** One assistant reply carrying a single tool call. */
function toolCallResponse(id: string, name: string, args: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: CallId(id), name, argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId(id), name, arguments: args } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

const IMAGE_REF: ImageAttachmentRef = {
  attachmentId: AttachmentId('vision-route-test-image'),
  mediaType: 'image/png',
  bytes: 4,
  width: 1,
  height: 1,
}

function imageMessage(text = 'what is this?'): ReturnType<typeof createUserMessage> {
  return createUserMessage({
    content: [{ type: 'image', attachment: IMAGE_REF }, { type: 'text', text }],
    source: { kind: 'user' },
  })
}

async function harness(adapter: ScriptedAdapter): Promise<{ ctx: Context; disposeAdapter: () => void }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(MemorySettings)
  await ctx.plugin(VisionRouteConfig)
  await ctx.plugin(AgentLoop, { agents: [] })
  const disposeAdapter = ctx.llm.registerAdapter(['mock', 'vision'], adapter)
  return { ctx, disposeAdapter }
}

function createAgent(ctx: Context, id: string, provider = 'mock', model = 'mock'): Agent {
  return ctx.agentLoop.create(SessionId(id), { provider, model })
}

async function configureVision(ctx: Context, provider = 'vision', model = 'vl'): Promise<void> {
  await ctx.settings.replace(VISION_MODEL_SETTINGS_NAMESPACE, { provider, model })
}

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('vision-model routing', () => {
  it('routes an image-bearing turn to the configured vision model', async () => {
    const adapter = new ScriptedAdapter([textResponse('plain'), textResponse('seen it')])
    ;({ ctx: context } = await harness(adapter))
    await configureVision(context)
    const agent = createAgent(context, 'vision-route-basic')

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(adapter.requests[0]?.provider).toBe('mock')
    expect(adapter.requests[0]?.model).toBe('mock')

    agent.followup(imageMessage())
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[1]?.provider).toBe('vision')
    expect(adapter.requests[1]?.model).toBe('vl')
    const assistant = agent.session.deriveMessages().at(-1)
    expect(assistant).toMatchObject({ role: 'assistant', source: { kind: 'model', provider: 'vision', model: 'vl' } })
  })

  it('keeps the session model without a configured vision model', async () => {
    const adapter = new ScriptedAdapter([textResponse('plain')])
    ;({ ctx: context } = await harness(adapter))
    const agent = createAgent(context, 'vision-route-unconfigured')

    agent.followup(imageMessage())
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]?.provider).toBe('mock')
    expect(adapter.requests[0]?.model).toBe('mock')
  })

  it('keeps the vision model for the session after the image-bearing turn', async () => {
    const adapter = new ScriptedAdapter([textResponse('a'), textResponse('b'), textResponse('c')])
    ;({ ctx: context } = await harness(adapter))
    await configureVision(context)
    const agent = createAgent(context, 'vision-route-persistent')

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'one' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    agent.followup(imageMessage())
    await agent.whenIdle()
    // The session history now carries the image, so a text-only adapter could
    // not serve it: the routed header keeps the vision model.
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'three' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(adapter.requests.map(request => [request.provider, request.model]))
      .toEqual([['mock', 'mock'], ['vision', 'vl'], ['vision', 'vl']])
  })

  it('does not route when the session model already carries images', async () => {
    const adapter = new ScriptedAdapter([textResponse('seen it')])
    ;({ ctx: context } = await harness(adapter))
    await configureVision(context)
    const agent = createAgent(context, 'vision-route-already-vision', 'vision', 'vl')

    agent.followup(imageMessage())
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]?.provider).toBe('vision')
    expect(adapter.requests[0]?.model).toBe('vl')
  })

  it('does not route to a configured vision model that lacks image input', async () => {
    const adapter = new ScriptedAdapter([textResponse('plain')])
    ;({ ctx: context } = await harness(adapter))
    // A deployment that misconfigures a text-only model as its vision route.
    await configureVision(context, 'mock', 'mock')
    const agent = createAgent(context, 'vision-route-misconfigured')

    agent.followup(imageMessage())
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]?.provider).toBe('mock')
    expect(adapter.requests[0]?.model).toBe('mock')
  })

  it('keeps routing across the steps of one image-bearing turn', async () => {
    const adapter = new ScriptedAdapter([
      // The vision model replies with a tool call; the next step of the same
      // turn still carries the image, so it routes to vision again.
      toolCallResponse('call-1', 'echo', '{"text":"hi"}'),
      textResponse('done looking'),
    ])
    ;({ ctx: context } = await harness(adapter))
    await configureVision(context)
    const agent = createAgent(context, 'vision-route-multistep')
    context.tools.register(defineContentToolFixture({
      name: 'echo',
      description: 'echo the text back',
      parameters: { text: { type: 'string', required: true } },
      execute: async args => [{ type: 'text', text: `echo ${args.text}` }],
    }))

    agent.followup(imageMessage())
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests.map(request => [request.provider, request.model]))
      .toEqual([['vision', 'vl'], ['vision', 'vl']])
  })
})
