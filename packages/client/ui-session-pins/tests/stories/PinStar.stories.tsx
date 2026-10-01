/**
 * Live-preview story for the session-header pin toggle: mounts the real
 * star pinned over an in-memory pins set; clicking flips it live. Consumed
 * by the component library gallery through `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session standard-kit merge (useSessions/useSessionStatus/useSessionRetainInfo).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the conversation standard-kit merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the layout standard-kit merge (usePanelInfo).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the resources standard-kit merge (useResource).
import type {} from '@deepseek-ai/dsh-client-resources/client'
import { SessionPinsController } from '../../src/client/controller.ts'
import type { SessionPinsRemoteFace } from '../../src/client/controller.ts'
import { PinStar } from '../../src/client/PinStar.tsx'
// Type-only: loads the pins locale merge + the injected face contract.
import type {} from '../../src/client/index.ts'
import { en } from '../../src/client/locales.ts'

function fakeRemote(): SessionPinsRemoteFace {
  let pins = ['sess-1'] as SessionId[]
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

export const story = {
  record: 'ui-session-pins/PinStar',
  /** Mount the header star with the current session pinned; toggle is live. */
  mount(container: HTMLElement): void {
    const controller = new SessionPinsController(fakeRemote())
    void controller.ensure()
    const root = createRoot(container)
    root.render(
      <PinStar
        sessionId={'sess-1' as SessionId}
        useSession={() => { throw new Error('unused by the pin star') }}
        t={key => (en as Record<string, string>)[key as keyof typeof en] ?? key}
        usePins={selector => selector(controller.store.getSnapshot())}
        ensure={() => controller.ensure()}
        toggle={id => controller.toggle(id)}
        useSessions={() => { throw new Error('unused by the pin star') }}
        useWorkspaces={() => { throw new Error('unused by the pin star') }}
        useSessionStatus={() => { throw new Error('unused by the pin star') }}
        useSessionRetainInfo={() => undefined}
        usePanelInfo={selector => selector({ activePanelId: null })}
        useResource={() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })}
        useProjection={() => undefined}
        useConversation={() => { throw new Error('unused by the pin star') }}
        useChat={() => { throw new Error('unused by the pin star') }}
        useTrajectory={() => { throw new Error('unused by the pin star') }}
        useInput={() => { throw new Error('unused by the pin star') }}
        inputActions={{} as never}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
