// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FileIcon, fileIconKind } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

describe('fileIconKind', () => {
  it('maps extensions case-insensitively', () => {
    expect(fileIconKind('main.ts')).toBe('typescript')
    expect(fileIconKind('A.TSX')).toBe('typescript')
    expect(fileIconKind('index.HTML')).toBe('html')
  })

  it('takes the extension after the last dot', () => {
    expect(fileIconKind('dsh-web-restart.log.err')).toBe('text')
    expect(fileIconKind('archive.tar.gz')).toBe('archive')
  })

  it('resolves extensionless names through the name table', () => {
    expect(fileIconKind('Makefile')).toBe('config')
    expect(fileIconKind('Dockerfile')).toBe('config')
    expect(fileIconKind('.gitignore')).toBe('config')
    expect(fileIconKind('.env')).toBe('config')
  })

  it('falls to generic for unknown extensions and bare names', () => {
    expect(fileIconKind('mystery.zzz')).toBe('generic')
    expect(fileIconKind('no-extension')).toBe('generic')
    expect(fileIconKind('')).toBe('generic')
  })

  it('maps the workspace-scene types the tree actually shows', () => {
    expect(fileIconKind('restart-dsh.ps1')).toBe('powershell')
    expect(fileIconKind('dsh-web-restart.log')).toBe('text')
    expect(fileIconKind('index.html')).toBe('html')
    expect(fileIconKind('package.json')).toBe('json')
    expect(fileIconKind('pnpm-lock.yaml')).toBe('config')
    expect(fileIconKind('README.md')).toBe('markdown')
    expect(fileIconKind('logo.svg')).toBe('image')
    expect(fileIconKind('run.sh')).toBe('shell')
  })
})

describe('FileIcon', () => {
  it('exposes the resolved kind on the svg', () => {
    const { container } = render(<FileIcon name="a.ts" />)
    expect(container.querySelector('svg')!.getAttribute('data-kind')).toBe('typescript')
  })

  it('is a pure function of the name: same name, same markup', () => {
    const first = render(<FileIcon name="a.ts" />)
    const markup = first.container.innerHTML
    cleanup()
    const second = render(<FileIcon name="a.ts" />)
    expect(second.container.innerHTML).toBe(markup)
  })

  it('renders distinct identity colors for distinct kinds', () => {
    const ts = render(<FileIcon name="a.ts" />).container.querySelector('svg')!.innerHTML
    const js = render(<FileIcon name="a.js" />).container.querySelector('svg')!.innerHTML
    expect(ts).not.toBe(js)
  })

  it('renders the untyped fallback in currentColor', () => {
    const { container } = render(<FileIcon name="mystery.zzz" />)
    expect(container.innerHTML).toContain('currentColor')
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('lands size and className on the root svg', () => {
    const { container } = render(<FileIcon name="a.ts" size={14} className="rowIcon" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('14')
    expect(svg.getAttribute('height')).toBe('14')
    expect(svg.classList.contains('rowIcon')).toBe(true)
  })
})
