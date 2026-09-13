/**
 * Live-preview story for the Usage dashboard: mounts the real view over an
 * in-memory ledger (two sessions, two models, two days, with pricing) so the
 * big-number stats, heatmap, trend, donut, and tables all render. Consumed
 * by the component library gallery through `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the session standard-kit merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the conversation standard-kit merge (useChat/useInput/…).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { UsageLedgerListResult } from '@deepseek-ai/dsh-usage-ledger/types'
import { UsageLedgerController } from '../../src/client/controller.ts'
import type { UsageLedgerRemoteFace } from '../../src/client/controller.ts'
import { UsageSection } from '../../src/client/UsageSection.tsx'
// Type-only: loads the 'usage' LocaleNamespaceMap merge (the locale seat resolves against it).
import type {} from '../../src/client/index.ts'
import { en, type UsageKey } from '../../src/client/locales.ts'

const DAY_TODAY = new Date().toISOString().slice(0, 10)
const DAY_YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

/** In-memory ledger: two sessions across two days and two models, priced. */
function fakeRemote(): UsageLedgerRemoteFace {
  const bucket = (inputTokens: number, outputTokens: number, requests: number) => ({
    inputTokens, outputTokens, cacheReadTokens: Math.round(inputTokens * 2), cacheWriteTokens: 0, requests,
  })
  const items = [
    {
      sessionId: 'sess-alpha' as SessionId,
      record: {
        inputTokens: 340_000, outputTokens: 41_000, cacheReadTokens: 620_000, cacheWriteTokens: 12_000,
        requests: 24, lastAt: Date.now() - 3_600_000,
        models: {
          'deepseek-chat-v4': bucket(210_000, 26_000, 14),
          'deepseek-reason-v4': bucket(130_000, 15_000, 10),
        },
        dayModels: {
          [DAY_YESTERDAY]: { 'deepseek-chat-v4': bucket(90_000, 11_000, 6) },
          [DAY_TODAY]: {
            'deepseek-chat-v4': bucket(120_000, 15_000, 8),
            'deepseek-reason-v4': bucket(130_000, 15_000, 10),
          },
        },
      },
    },
    {
      sessionId: 'sess-beta' as SessionId,
      record: {
        inputTokens: 96_000, outputTokens: 8_500, cacheReadTokens: 140_000, cacheWriteTokens: 0,
        requests: 9, lastAt: Date.now() - 90_000_000,
        models: { 'deepseek-chat-v4': bucket(96_000, 8_500, 9) },
        dayModels: { [DAY_TODAY]: { 'deepseek-chat-v4': bucket(96_000, 8_500, 9) } },
      },
    },
  ]
  const pricing = {
    '*': { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.28 },
  }
  return {
    list: () => Promise.resolve<RemoteResult<UsageLedgerListResult>>({
      ok: true,
      value: { ok: true, value: { items, pricing } },
    }),
  }
}

const unusedHook = (() => { throw new Error('unused by the usage view') }) as never

export const story = {
  record: 'ui-usage/UsageSection',
  /**
   * Mount the usage dashboard over a two-session in-memory ledger with
   * pricing, so the cost cards, model shares, and the heatmap/trend render
   * with believable data.
   */
  mount(container: HTMLElement): () => void {
    const controller = new UsageLedgerController(fakeRemote())
    void controller.ensure()
    const root = createRoot(container)
    root.render(
      <UsageSection
        sessionId={'sess-alpha' as SessionId}
        viewRequest={null}
        openView={() => {}}
        completeViewRequest={() => {}}
        useSession={() => { throw new Error('unused by the usage view') }}
        useSessions={selector => selector({
          byId: {
            'sess-alpha': { cwd: '/work/alpha' },
            'sess-beta': { cwd: '/work/beta' },
          },
        } as never)}
        useSessionPendingInteraction={unusedHook}
        useWorkspaces={unusedHook}
        useProjection={() => undefined}
        useConversation={unusedHook}
        useChat={unusedHook}
        useTrajectory={unusedHook}
        useInput={unusedHook}
        inputActions={{} as never}
        t={key => (en as Record<string, string>)[key as UsageKey] ?? key}
        ensure={() => controller.ensure()}
        useUsage={selector => selector(controller.store.getSnapshot())}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
    return () => {
      root.unmount()
    }
  },
}
