/**
 * Live-preview story for the daily-todo drawer: mounts the real right-edge
 * tab and its open panel over an in-memory list — two open items (one due,
 * one linked to a workspace/session) and one completed earlier today — with
 * add / toggle / retitle / remove live against the in-memory store.
 * Consumed by the component library gallery through `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session standard-kit merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the workspace standard-kit merge (useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UserTodoId, UserTodoRecord } from '@deepseek-ai/dsh-user-todo/types'
import { UserTodoController } from '../../src/client/controller.ts'
import type { UserTodosRemoteFace } from '../../src/client/controller.ts'
import { TodoDrawer } from '../../src/client/UserTodoButton.tsx'
// Type-only: loads the todo locale merge + the injected face contract.
import type {} from '../../src/client/index.ts'
import { en } from '../../src/client/locales.ts'

function todo(id: string, title: string, overrides: Partial<UserTodoRecord> = {}): UserTodoRecord {
  return {
    id: id as UserTodoId,
    title,
    done: false,
    createdAt: Date.now() - 3_600_000,
    ...overrides,
  }
}

function fakeRemote(): UserTodosRemoteFace {
  let items = [
    todo('t-1', 'Summarize the ingestion failures', {
      dueAt: Date.now() + 86_400_000,
      workspaceId: 'w-alpha' as never,
      sessionId: 'sess-alpha' as SessionId,
    }),
    todo('t-2', 'Draft the release notes'),
    todo('t-3', 'Skim the merged queue', { done: true, completedAt: Date.now() - 7_200_000 }),
  ]
  return {
    list: () => Promise.resolve({ ok: true, value: { ok: true, value: { items: [...items] } } }),
    put: (request) => {
      const existing = request.id === undefined ? undefined : items.find(item => item.id === request.id)
      if (existing === undefined) {
        const record: UserTodoRecord = {
          id: `t-${items.length + 1}` as UserTodoId,
          title: request.title ?? '',
          done: false,
          createdAt: Date.now(),
          ...(request.dueAt === null || request.dueAt === undefined ? {} : { dueAt: request.dueAt }),
        }
        items = [...items, record]
        return Promise.resolve({ ok: true, value: { ok: true, value: record } } as never)
      }
      const updated = { ...existing, title: request.title ?? existing.title }
      items = items.map(item => item.id === existing.id ? updated : item)
      return Promise.resolve({ ok: true, value: { ok: true, value: updated } } as never)
    },
    toggle: (request) => {
      const current = items.find(item => item.id === request.id)
      if (current === undefined) return Promise.reject(new Error('item not found'))
      const updated: UserTodoRecord = request.done
        ? { ...current, done: true, completedAt: Date.now() }
        : (() => { const { completedAt: _dropped, ...rest } = current; return rest })()
      items = items.map(item => item.id === request.id ? updated : item)
      return Promise.resolve({ ok: true, value: { ok: true, value: updated } } as never)
    },
    delete: (request) => {
      items = items.filter(item => item.id !== request.id)
      return Promise.resolve({ ok: true, value: { absent: true } } as never)
    },
  }
}

const SESSIONS = {
  byId: {
    'sess-alpha': { title: 'Refactor the ingest pipeline', cwd: '/work/alpha' },
  },
}
const WORKSPACES = {
  items: [{ id: 'w-alpha', name: 'alpha' }],
  archivedSessionIds: [],
}

const unusedHook = (() => { throw new Error('unused by the todo drawer') }) as never

export const story = {
  record: 'ui-user-todo/TodoDrawer',
  /**
   * Mount the drawer over three items; the add / toggle / retitle / remove
   * verbs act on the in-memory store, so the panel is fully interactive.
   */
  mount(container: HTMLElement): void {
    const controller = new UserTodoController(fakeRemote())
    void controller.ensure()
    const root = createRoot(container)
    root.render(
      <TodoDrawer
        t={key => (en as Record<string, string>)[key as keyof typeof en] ?? key}
        useTodo={selector => selector(controller.store.getSnapshot())}
        useSessions={selector => selector(SESSIONS as never)}
        useWorkspaces={selector => selector(WORKSPACES as never)}
        useSessionPendingInteraction={unusedHook}
        ensure={() => controller.ensure()}
        resync={() => controller.resync()}
        add={title => controller.add(title)}
        toggle={(id, done) => controller.toggle(id, done)}
        retitle={(id, title) => controller.retitle(id, title)}
        setWorkspaceLink={(id, workspaceId) => controller.setWorkspaceLink(id, workspaceId)}
        setSessionLink={(id, sessionId) => controller.setSessionLink(id, sessionId)}
        openSession={() => {}}
        setDue={(id, dueAt) => controller.setDue(id, dueAt)}
        remove={id => controller.remove(id)}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
