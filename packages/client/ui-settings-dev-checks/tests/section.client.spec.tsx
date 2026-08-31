// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEV_CHECKS_SETTINGS_DEFAULTS, type DevChecksSettings } from '../src/dev-checks-settings.ts'
import { DevChecksSection, type DevChecksSectionProps } from '../src/client/DevChecksSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const dictionary: Record<string, string> = en
const t: NonNullable<DevChecksSectionProps['t']> = key => dictionary[key] ?? key

type TestScope = SettingsScope<DevChecksSettings> & { set: ReturnType<typeof vi.fn> }

function createScope(overrides: Partial<SettingsScopeSnapshot<DevChecksSettings>> = {}): TestScope {
  let current: SettingsScopeSnapshot<DevChecksSettings> = {
    status: 'ready',
    value: { ...DEV_CHECKS_SETTINGS_DEFAULTS },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
    ...overrides,
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: vi.fn((field: string, value: unknown) => {
      current = { ...current, value: { ...current.value, [field]: value } as DevChecksSettings }
      for (const listener of listeners) listener()
      return Promise.resolve()
    }),
    unset: vi.fn(() => Promise.resolve()),
    mutate: vi.fn(() => Promise.resolve()),
  }
}

const ROW_LABELS = [
  en['e2e.label'],
  en['coverage.label'],
  en['snapshot.label'],
  en['docSync.label'],
  en['buildHygiene.label'],
  en['prePushTypecheck.label'],
]

describe('DevChecksSection', () => {
  it('renders every gate row on by default', () => {
    render(<DevChecksSection scope={createScope()} t={t} />)
    expect(screen.getByText(en.pageHint)).toBeDefined()
    for (const label of ROW_LABELS) {
      const button = screen.getByRole('button', { name: label })
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.hasAttribute('disabled')).toBe(false)
    }
    expect(screen.getAllByRole('button')).toHaveLength(ROW_LABELS.length)
  })

  it('writes a flipped field through the scope and re-renders from the new snapshot', () => {
    const scope = createScope()
    render(<DevChecksSection scope={scope} t={t} />)
    const button = screen.getByRole('button', { name: en['e2e.label'] })
    fireEvent.click(button)
    expect(scope.set).toHaveBeenCalledWith('e2e', false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the switches disabled while the scope is loading', () => {
    render(<DevChecksSection scope={createScope({ status: 'loading', value: undefined, writable: false })} t={t} />)
    for (const label of ROW_LABELS) {
      expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true)
    }
  })

  it('disables the switches with a hint when the document is read-only', () => {
    render(<DevChecksSection scope={createScope({ writable: false })} t={t} />)
    expect(screen.getByText(en.readOnly)).toBeDefined()
    expect(screen.getByRole('button', { name: en['coverage.label'] }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the notice when the namespace is unavailable', () => {
    render(<DevChecksSection scope={createScope({ status: 'unavailable', value: undefined, writable: false })} t={t} />)
    expect(screen.getByText(en.unavailable)).toBeDefined()
  })

  it('renders nothing until the inject face is complete', () => {
    const { container } = render(<DevChecksSection />)
    expect(container.innerHTML).toBe('')
  })
})
