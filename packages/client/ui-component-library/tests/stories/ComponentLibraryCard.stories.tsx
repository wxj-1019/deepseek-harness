/**
 * Live-preview story for the component library settings card: mounts the
 * real card over an in-memory remote face with scanned and model-contributed
 * records, so search and review controls are interactive without a Host.
 * Consumed by the component library gallery through `window.__DSH_STORIES__`.
 */
import { createRoot } from 'react-dom/client'
// Type-only: pulls the session standard-kit merge (useSessionPendingInteraction).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ComponentLibraryListResult,
  ComponentLibraryReviewResult,
  ComponentRecord,
} from '@deepseek-ai/dsh-component-library/types'
import { ComponentLibraryController } from '../../src/client/controller.ts'
import type { ComponentLibraryRemoteFace } from '../../src/client/controller.ts'
import { ComponentLibraryCard } from '../../src/client/ComponentLibraryCard.tsx'
import { en } from '../../src/client/locales.ts'

/** One scanned record fixture. */
function scanned(id: string, name: string, jsdoc: string): ComponentRecord {
  return {
    id,
    pkg: '@deepseek-ai/dsh-client-ui-demo',
    name,
    path: `packages/client/ui-demo/src/client/${name}.tsx`,
    props: [{ name: 'label', type: 'string', required: true }],
    tokens: ['--dsw-alias-label-primary'],
    jsdoc,
    example: `<${name} label="hi" />`,
    origin: 'scanned',
    propsInferred: true,
    rawProps: '',
    reviewed: true,
    updatedAt: 1,
  }
}

/** One unreviewed model-contributed record fixture (the review row). */
function modeled(id: string, name: string): ComponentRecord {
  return { ...scanned(id, name, `The ${name} component.`), origin: 'model', reviewed: false }
}

function fakeRemote(initial: ComponentRecord[]): ComponentLibraryRemoteFace {
  const state = { records: [...initial] }
  return {
    list: () => Promise.resolve<RemoteResult<ComponentLibraryListResult>>({
      ok: true,
      value: { ok: true, value: { items: Object.freeze([...state.records]) } },
    }),
    review: (request) => {
      if (request.decision === 'discard') {
        state.records = state.records.filter(record => record.id !== request.id)
      } else {
        state.records = state.records.map(record => record.id === request.id ? { ...record, reviewed: true } : record)
      }
      return Promise.resolve<RemoteResult<ComponentLibraryReviewResult>>({ ok: true, value: { ok: true, value: { done: true } } })
    },
  }
}

const unusedHook = (() => { throw new Error('unused by the component library card') }) as never

export const story = {
  record: 'ui-component-library/ComponentLibraryCard',
  /**
   * Mount the card over three records (one unreviewed model contribution) so
   * search and the review controls are live in the preview.
   */
  mount(container: HTMLElement): void {
    const controller = new ComponentLibraryController(fakeRemote([
      scanned('ui-demo/Gauge', 'Gauge', 'One dashboard gauge.'),
      scanned('ui-demo/Panel', 'Panel', 'A collapsible side panel.'),
      modeled('ui-demo/BotCard', 'BotCard'),
    ]))
    void controller.ensure()
    const root = createRoot(container)
    root.render(
      <ComponentLibraryCard
        t={key => (en as Record<string, string>)[key] ?? key}
        useComponentLibrary={selector => selector(controller.store.getSnapshot())}
        ensure={() => void controller.ensure()}
        setQuery={(query) => {
          controller.setQuery(query)
        }}
        review={(id, decision) => {
          void controller.review(id, decision)
        }}
        useSessions={unusedHook}
        useWorkspaces={unusedHook}
        useSessionPendingInteraction={unusedHook}
      />,
    )
    container.dataset.dshStoryRoot = 'true'
  },
}
