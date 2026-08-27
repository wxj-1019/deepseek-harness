/** Headless snapshot: the user-todos pre-step catalog over a hand-driven agent (no model). */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('user-todo snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))
const ctx = await boot('user-todo-snapshot', rootConfigPath, [
  ...loadOverlayPatches('user-todo-snapshot', basePatchPath),
  ...loadOverlayPatches('user-todo-snapshot', overlayPath),
])

/** A minimal agent over one real session — the loop never runs; we drive pre-step directly. */
function handAgent(session: ReturnType<Context['sessions']['create']>): Agent {
  return {
    id: SessionId('user-todo-snapshot'),
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('user-todo snapshot must receive the catalog at the step boundary') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/** Drive one pre-step and commit the decision's user-todos message to the log. */
async function fireStep(ctx: Context, agent: Agent, turn: number, step: number): Promise<UserMessage | null> {
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn, step, signal: new AbortController().signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  if (decision.kind !== 'enter') return null
  const catalog = (decision.messages as readonly UserMessage[])
    .find(message => message.source.kind === 'user-todos')
  if (catalog === undefined) return null
  agent.session.append('user/message', catalog, { surfaceOp: 'append' })
  return catalog
}

/** The rendered catalog body lines (inside <user_todos>). */
function linesOf(message: UserMessage): string[] {
  const block = message.content[0]
  const text = typeof block === 'object' && block !== null && 'text' in block
    ? (block as { text: string }).text
    : ''
  const inner = text.split('<user_todos>')[1] ?? ''
  const body = inner.split('</user_todos>')[0] ?? ''
  return body.split('\n').map(line => line.trim())
    .filter(line => line.length > 0)
}

try {
  // A real directory so the workspace record's realpath canon accepts it.
  const projectDir = join(tmpdir(), 'user-todo-snapshot-ws')
  mkdirSync(projectDir, { recursive: true })
  const workspaceId = WorkspaceId((await ctx.workspaceRegistry.create(projectDir, 'Demo WS')).id)
  void workspaceId

  await ctx.userTodos.put({
    title: 'Buy milk',
    note: '2 percent',
    dueAt: Date.UTC(2026, 7, 30, 9),
    workspaceId,
  })
  await ctx.userTodos.put({ title: 'Water the plants' })

  const session = ctx.sessions.create(SessionId('user-todo-snapshot'), { meta: { cwd: process.cwd() } })
  const agent = handAgent(session)

  const first = await fireStep(ctx, agent, 1, 1)
  const second = await fireStep(ctx, agent, 1, 2)
  const listed = await ctx.userTodos.list()
  const buyMilk = listed.ok ? listed.value.items.find(item => item.title === 'Buy milk') : undefined
  if (buyMilk !== undefined) await ctx.userTodos.toggle({ id: buyMilk.id, done: true })
  const third = await fireStep(ctx, agent, 1, 3)

  process.stdout.write(`${JSON.stringify({
    initialForm: first === null ? null : (first.source as { form: string }).form,
    initialLines: first === null ? null : linesOf(first),
    secondNew: second === null ? 0 : 1,
    updateForm: third === null ? null : (third.source as { form: string }).form,
    updateLines: third === null ? null : linesOf(third),
  })}\n`)
} finally {
  await ctx.fiber.dispose()
}
