/**
 * Live-preview story for the sidebar pinned-session section: mounts the
 * real section wide over two pinned sessions (one archived-workspace
 * member filtered out of another fixture is not exercised here), with a
 * live unpin. Consumed by the component library gallery through
 * `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session standard-kit merge (useSessions).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the workspace standard-kit merge (useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionPinsController } from '../../src/client/controller.ts'
import type { SessionPinsRemoteFace } from '../../src/client/controller.ts'
import { PinnedSection } from '../../src/client/PinnedSection.tsx'
// Type-only: loads the pins locale merge + the injected face contract.
import type {} from '../../src/client/index.ts'
import { en } from '../../src/client/locales.ts'

function fakeRemote(): SessionPinsRemoteFace {
  let pins = ['sess-alpha', 'sess-beta'] as SessionId[]
  return {
    list: () => Promise.resolve({ ok: true, value: { ok: true, value: { sessionIds: [...pins] } } }),
    pin: (request) => {
      pins = [...pins, request.sessionId]
      return Promise.resolve({ ok: true, value: { ok: true, value: { pinnedAt: Date.now() } } })
    },
    unpin: (request) => {
      pins = pins.filter(id => id !== request.sessionId)
      return Promise.resolve({ ok: true, value: { ok: true, value: { absent: true } } })
    },
  }
}

const SESSIONS = {
  byId: {
    'sess-alpha': { title: 'Refactor the ingest pipeline', cwd: '/work/alpha' },
    'sess-beta': { title: 'Draft the release notes', cwd: '/work/beta' },
  },
}

const unusedHook = (() => { throw new Error('unused by the pinned section') }) as never

export const story = {
  record: 'ui-session-pins/PinnedSection',
  /** Mount the wide pinned section over two pinned sessions; unpin is live. */
  mount(container: HTMLElement): void {
    const controller = new SessionPinsController(fakeRemote())
    void controller.ensure()
    const root = createRoot(container)
    root.render(
      <PinnedSection
        wide
        expandSidebar={() => {}}
        t={key => (en as Record<string, string>)[key as keyof typeof en] ?? key}
        usePins={selector => selector(controller.store.getSnapshot())}
        useSessions={selector => selector(SESSIONS as never)}
        useWorkspaces={selector => selector({ archivedSessionIds: [] } as never)}
        ensure={() => controller.ensure()}
        unpin={id => controller.unpin(id)}
        openSession={() => {}}
        useSessionPendingInteraction={unusedHook}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
