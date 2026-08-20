// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { BootPage, shortEntryName } from '../src/boot-page.ts'

afterEach(() => { document.body.innerHTML = '' })

function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  return { el, page: new BootPage(el) }
}

describe('shortEntryName', () => {
  it('collapses harness client package names to their distinguishing segment', () => {
    expect(shortEntryName('@deepseek-ai/dsh-client-ui-layout')).toBe('ui-layout')
    expect(shortEntryName('dsh-client-web')).toBe('web')
  })

  it('keeps bare third-party names as they are', () => {
    expect(shortEntryName('dsh-better-sidebar')).toBe('dsh-better-sidebar')
  })
})

describe('BootPage', () => {
  it('draws the loading skeleton before any plugin state arrives', () => {
    const { el } = mount()
    expect(el.firstElementChild?.getAttribute('data-dsh-boot')).toBe('')
    expect(el.textContent).toContain('HARNESS')
    expect(el.textContent).toContain('Loading plugins…')
  })

  it('keeps loading while entries are active or loading', () => {
    const { el, page } = mount()
    page.setTotal(2)
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('b', 'loading')
    expect(el.querySelector('[data-dsh-boot-spinner]')).toBe(spinner)
    page.setState('b', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('288deg')
    expect(el.textContent).toContain('Loading plugins…')
    expect(el.textContent).not.toContain('Failed to load plugins')
  })

  it('shows done/total counts and the last activated entry short name', () => {
    const { el, page } = mount()
    page.setTotal(3)
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'active')
    expect(el.textContent).toContain('1/3 · ui-layout')
    page.setState('@deepseek-ai/dsh-client-web', 'loading')
    expect(el.textContent).toContain('1/3 · ui-layout')
    page.setState('@deepseek-ai/dsh-client-web', 'active')
    expect(el.textContent).toContain('2/3 · web')
  })

  it('counts finished prefetches into the arc and the done/total line', () => {
    const { el, page } = mount()
    page.setPrefetchTotal(2)
    page.setTotal(2)
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    page.stepPrefetch()
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('126deg')
    expect(el.textContent).toContain('1/4')
    page.stepPrefetch()
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('234deg')
    expect(el.textContent).toContain('3/4 · a')
    page.setState('b', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('288deg')
    expect(el.textContent).toContain('4/4 · b')
  })

  it('lists failed entries', () => {
    const { el, page } = mount()
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    page.setState('ok', 'active')
    page.setState('@deepseek-ai/dsh-client-ui-tool', 'failed')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-tool')
    expect(el.textContent).not.toContain('ok')
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('shows the complete sweep report', () => {
    const { el, page } = mount()
    const report = 'web boot: 1 entry did not activate\nx: pending (waiting for service: y)'
    page.fail(report)
    page.setState('a', 'active')
    expect(el.textContent).toContain(report)
    expect(el.textContent).not.toContain('Loading plugins…')
  })

  it('detaches on disposal', () => {
    const { el, page } = mount()
    page.dispose()
    expect(el.childNodes).toHaveLength(0)
  })
})
