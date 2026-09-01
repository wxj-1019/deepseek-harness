// @vitest-environment jsdom
/**
 * GitGraphTab behavior: fetches branches and the first history page through
 * the mocked git-graph route, renders the rail rows, and pages older commits
 * through "load more".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitGraphTab, type GitGraphTabProps } from '../src/client/GitGraphTab.tsx'
// Type-only: pulls the LocaleNamespaceMap merge (the view namespace).
import type {} from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** One canned history page shaped like the git-graph wire rows. */
function page(entries: unknown[], hasMore = false): { ok: true; value: { entries: unknown[]; hasMore: boolean } } {
  return { ok: true, value: { entries, hasMore } }
}

/** Session-standard-kit double: one session bound to a fake repository cwd. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
const SESSIONS = { byId: { ['sess-1' as SessionId]: { cwd: '/repo' } } }
const useSessions = ((selector: (s: typeof SESSIONS) => unknown) => selector(SESSIONS)) as unknown as GitGraphTabProps['useSessions']

function wireRow(hashFull: string, parents: string[], refs = ''): Record<string, unknown> {
  return {
    hash: hashFull.slice(0, 7),
    hashFull,
    subject: `subject ${hashFull}`,
    author: 'Alice',
    date: '2024-01-01 10:00:00 +0800',
    refs,
    parents,
    commitTime: 1704093600,
  }
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<unknown>): void {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => ({
    ok: true,
    status: 200,
    async json() { return handler(String(url), init) },
  })))
}

function mount(overrides: Partial<GitGraphTabProps> = {}): void {
  const props: GitGraphTabProps = {
    sessionId: 'sess-1' as SessionId,
    viewRequest: null,
    openView: () => {},
    completeViewRequest: () => {},
    useSession: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useSession'],
    useSessions,
    useSessionPendingInteraction: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useSessionPendingInteraction'],
    useWorkspaces: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useWorkspaces'],
    useProjection: () => undefined,
    useConversation: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useConversation'],
    useChat: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useChat'],
    useTrajectory: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useTrajectory'],
    useInput: (() => { throw new Error('unused by the git graph tab') }) as unknown as GitGraphTabProps['useInput'],
    inputActions: {} as unknown as GitGraphTabProps['inputActions'],
    t: key => en[key as keyof typeof en] ?? key,
    ...overrides,
  }
  render(<GitGraphTab {...props} />)
}

describe('GitGraphTab', () => {
  it('renders the rail rows and the branch selector from the wire data', async () => {
    stubFetch((url) => {
      if (url.endsWith('/branch')) return Promise.resolve({ ok: true, value: ['main', 'feature/x'] })
      if (url.endsWith('/log')) {
        return Promise.resolve(page([
          wireRow('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']),
          wireRow('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', [], 'HEAD -> main, origin/main'),
        ]))
      }
      return Promise.resolve({ ok: false, error: { code: 'x', message: 'unexpected url' } })
    })
    mount()
    await waitFor(() => expect(screen.getByText(/subject aaaaaaa/)).toBeTruthy())
    expect(screen.getByText(/subject bbbbbbb/)).toBeTruthy()
    // The first row carries the rail cell with lanes (svg children).
    const rails = document.querySelectorAll('[class*="rail"] svg line, [class*="rail"] svg circle')
    expect(rails.length).toBeGreaterThan(0)
    const branchSelect = screen.getByRole('combobox') as HTMLSelectElement
    expect(branchSelect.value).toBe('main')
    expect(screen.getByText('origin/main')).toBeTruthy()
  })

  it('pages older commits through load more', async () => {
    let logCalls = 0
    stubFetch((url) => {
      if (url.endsWith('/branch')) return Promise.resolve({ ok: true, value: ['main'] })
      if (url.endsWith('/log')) {
        logCalls += 1
        return Promise.resolve(logCalls === 1
          ? page([wireRow('cccccccccccccccccccccccccccccccccccccccc', [])], true)
          : page([wireRow('dddddddddddddddddddddddddddddddddddddddd', [])], false))
      }
      return Promise.resolve({ ok: false, error: { code: 'x', message: 'unexpected url' } })
    })
    mount()
    await waitFor(() => expect(screen.getByText(/subject ccccccc/)).toBeTruthy())
    fireEvent.click(screen.getByText(en['loadMore']))
    await waitFor(() => expect(screen.getByText(/subject ddddddd/)).toBeTruthy())
    expect(logCalls).toBe(2)
  })

  it('shows the wire error message when the route fails', async () => {
    stubFetch(() => Promise.resolve({ ok: false, error: { code: 'git-graph-error', message: 'git log failed: boom' } }))
    mount()
    await waitFor(() => { const el = document.querySelector('[class*="_error_"]'); expect(el?.textContent).toContain('boom') })
  })
})
