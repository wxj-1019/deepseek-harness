/**
 * Live-preview story for the notification bell: mounts the real footer
 * action over an in-memory notification list with two unread entries, so
 * the badge and the active glyph render. Consumed by the component library
 * gallery through `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NotificationId } from '@deepseek-ai/dsh-notification-center/types'

const mint = (value: string): NotificationId => value as NotificationId
import { NotificationsController } from '../../src/client/controller.ts'
import type { NotificationsRemoteFace } from '../../src/client/controller.ts'
import { NotificationBell } from '../../src/client/NotificationBell.tsx'
// Type-only: loads the notification locale merge + the injected face contract.
import type {} from '../../src/client/index.ts'
import { en } from '../../src/client/locales.ts'

function fakeRemote(): NotificationsRemoteFace {
  const items = [
    {
      id: mint('n-1'),
      kind: 'session-completed' as const,
      title: 'Session settled',
      sessionId: 'sess-alpha' as SessionId,
      createdAt: Date.now() - 300_000,
    },
    {
      id: mint('n-2'),
      kind: 'job-finished' as const,
      title: 'Nightly export finished',
      createdAt: Date.now() - 3_600_000,
      readAt: Date.now() - 1_800_000,
    },
  ]
  return {
    list: () => Promise.resolve({ ok: true, value: { ok: true, value: { items } } }),
    markRead: () => Promise.reject(new Error('unused in the preview')),
    markAllRead: () => Promise.reject(new Error('unused in the preview')),
    clearRead: () => Promise.reject(new Error('unused in the preview')),
  }
}

const unusedHook = (() => { throw new Error('unused by the notification bell') }) as never

export const story = {
  record: 'ui-notification-center/NotificationBell',
  /** Mount the wide footer bell over two unread entries (badge lit). */
  mount(container: HTMLElement): void {
    const controller = new NotificationsController(fakeRemote())
    void controller.ensure()
    const root = createRoot(container)
    root.render(
      <NotificationBell
        wide
        t={key => (en as Record<string, string>)[key as keyof typeof en] ?? key}
        useNotifications={selector => selector(controller.store.getSnapshot())}
        ensure={() => controller.ensure()}
        toggleOpen={() => {
          controller.toggleOpen()
        }}
        useSessions={unusedHook}
        useWorkspaces={unusedHook}
        useSessionPendingInteraction={unusedHook}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
