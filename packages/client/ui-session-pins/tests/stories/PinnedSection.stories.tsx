/**
 * Live-preview story for the sidebar pinned-session section: mounts the
 * real section wide over two pinned sessions (one archived-workspace
 * member filtered out of another fixture is not exercised here), with a
 * live unpin. Consumed by the component library gallery through
 * `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session standard-kit merge (useSessions/useSessionStatus/useSessionRetainInfo).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the workspace standard-kit merge (useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the layout standard-kit merge (usePanelInfo).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the resources standard-kit merge (useResource).
import type {} from '@deepseek-ai/dsh-client-resources/client'
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
        useSessionStatus={selector => selector(new Map())}
        useSessionRetainInfo={() => undefined}
        usePanelInfo={selector => selector({ activePanelId: null })}
        useResource={() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
