/**
 * Live-preview story for the notification overlay panel: mounts the real
 * panel open over three entries (an unread session completion, a read
 * approval decision, an unread job finish), with live mark-read and
 * clear-read acting on the in-memory list. Consumed by the component
 * library gallery through `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session standard-kit merge (useSessions).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { NotificationId } from '@deepseek-ai/dsh-notification-center/types'

const mint = (value: string): NotificationId => value as NotificationId
import { NotificationsController } from '../../src/client/controller.ts'
import type { NotificationsRemoteFace } from '../../src/client/controller.ts'
import { NotificationPanel } from '../../src/client/NotificationPanel.tsx'
// Type-only: loads the notification locale merge + the injected face contract.
import type {} from '../../src/client/index.ts'
import { en } from '../../src/client/locales.ts'

function fakeRemote(): NotificationsRemoteFace {
  let items: import('@deepseek-ai/dsh-notification-center/types').NotificationRecord[] = [
    {
      id: mint('n-1'),
      kind: 'session-completed' as const,
      title: 'Session settled',
      sessionId: 'sess-alpha' as SessionId,
      createdAt: Date.now() - 300_000,
    },
    {
      id: mint('n-2'),
      kind: 'approval-decided' as const,
      title: 'Approval answered',
      createdAt: Date.now() - 900_000,
      readAt: Date.now() - 600_000,
    },
    {
      id: mint('n-3'),
      kind: 'job-finished' as const,
      title: 'Nightly export finished',
      createdAt: Date.now() - 3_600_000,
    },
  ]
  return {
    list: () => Promise.resolve({ ok: true, value: { ok: true, value: { items } } }),
    markRead: (request) => {
      items = items.map(item => item.id === request.id ? { ...item, readAt: Date.now() } : item)
      return Promise.resolve({ ok: true, value: { ok: true, value: { done: true } } })
    },
    markAllRead: () => {
      items = items.map(item => ({ ...item, readAt: item.readAt ?? Date.now() }))
      return Promise.resolve({ ok: true, value: { ok: true, value: { done: true } } })
    },
    clearRead: () => {
      items = items.filter(item => item.readAt === undefined)
      return Promise.resolve({ ok: true, value: { ok: true, value: { done: true } } })
    },
  }
}

const SESSIONS = {
  byId: {
    'sess-alpha': { title: 'Refactor the ingest pipeline', cwd: '/work/alpha' },
  },
}

const unusedHook = (() => { throw new Error('unused by the notification panel') }) as never

export const story = {
  record: 'ui-notification-center/NotificationPanel',
  /**
   * Mount the panel open over three entries; mark-read / mark-all-read /
   * clear-read act on the in-memory list, so the header verbs are live.
   */
  mount(container: HTMLElement): void {
    const controller = new NotificationsController(fakeRemote())
    void controller.ensure()
    controller.toggleOpen()
    const root = createRoot(container)
    root.render(
      <NotificationPanel
        t={key => (en as Record<string, string>)[key as keyof typeof en] ?? key}
        useNotifications={selector => selector(controller.store.getSnapshot())}
        useSessions={selector => selector(SESSIONS as never)}
        close={() => {
          controller.close()
        }}
        markRead={id => controller.markRead(id)}
        markAllRead={() => controller.markAllRead()}
        clearRead={() => controller.clearRead()}
        openSession={() => {}}
        useSessionPendingInteraction={unusedHook}
        useWorkspaces={unusedHook}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
