/**
 * Framework-free boot page and failure report. It remains available when a
 * client plugin fails because React arrives only with the UI renderer.
 * @module @deepseek-ai/dsh-client-web/src/boot-page
 */
import type { LoaderEntryState } from './loader-status.ts'
import css from './boot-page.module.css'

/** Create a div with one module class and optional text. */
function div(className: string | undefined, text?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className ?? ''
  if (text !== undefined) el.textContent = text
  return el
}

/**
 * Collapse a loader entry name to its distinguishing short form: the last
 * path segment without the harness client-package prefix
 * (`@deepseek-ai/dsh-client-ui-layout` → `ui-layout`; a bare third-party
 * name stays as is).
 */
export function shortEntryName(name: string): string {
  const last = name.split('/').pop() ?? name
  return last.replace(/^dsh-client-/, '')
}

/** Kernel-owned page mounted below the application's root element. */
export class BootPage {
  private readonly root: HTMLDivElement
  private readonly card: HTMLDivElement
  private readonly wordmark: HTMLDivElement
  private readonly spinner: HTMLDivElement
  private readonly hint: HTMLDivElement
  private readonly progress: HTMLDivElement
  private readonly states = new Map<string, LoaderEntryState>()
  private readonly active = new Set<string>()
  private total = 0
  private prefetchTotal = 0
  private prefetchDone = 0
  private lastActivated: string | undefined
  private failure: string | undefined

  /**
   * Build and attach the boot page.
   * @param container - Application mount point.
   */
  constructor(container: HTMLElement) {
    this.root = div(css.boot)
    this.root.dataset.dshBoot = ''
    this.card = div(css.card)
    this.wordmark = div(css.wordmark, 'HARNESS')
    this.spinner = div(css.spinner)
    this.spinner.dataset.dshBootSpinner = ''
    this.hint = div(css.hint, 'Loading plugins…')
    this.progress = div(css.hint)
    this.card.append(this.wordmark, this.spinner, this.hint, this.progress)
    this.root.append(this.card)
    container.append(this.root)
    this.updateProgress()
  }

  /**
   * Set the number of loader entries represented by the progress arc.
   * @param total - Complete boot roster size.
   */
  setTotal(total: number): void {
    this.total = total
    this.updateProgress()
    this.renderProgress()
  }

  /**
   * Set the number of first-tier bundle prefetches the arc also tracks.
   * @param total - Immediate-tier bundle count.
   */
  setPrefetchTotal(total: number): void {
    this.prefetchTotal = total
    this.updateProgress()
    this.renderProgress()
  }

  /** Count one finished prefetch (arrival or swallowed transport failure). */
  stepPrefetch(): void {
    this.prefetchDone += 1
    this.updateProgress()
    this.renderProgress()
  }

  /**
   * Project one loader entry's fiber state.
   * @param id - Loader entry name.
   * @param state - Projected fiber state.
   */
  setState(id: string, state: LoaderEntryState): void {
    this.states.set(id, state)
    if (state === 'active') {
      this.active.add(id)
      this.lastActivated = shortEntryName(id)
    }
    this.updateProgress()
    this.render()
  }

  /**
   * Display the boot failure report.
   * @param message - Failure report text.
   */
  fail(message: string): void {
    this.failure = message
    this.render()
  }

  /** Detach the page before or after the UI renderer takes the mount point. */
  dispose(): void {
    this.root.remove()
  }

  /** Redraw the state-dependent content below the wordmark. */
  private render(): void {
    const failed = [...this.states].filter(([, state]) => state === 'failed').map(([id]) => id)
    if (this.failure === undefined && failed.length === 0) {
      if (this.spinner.parentElement !== this.card) {
        this.card.replaceChildren(this.wordmark, this.spinner, this.hint, this.progress)
      }
      this.renderProgress()
      return
    }
    const report = div(css.failed)
    report.append(div(css.failedTitle, 'Failed to load plugins'))
    for (const id of failed) report.append(div(css.failedItem, id))
    if (this.failure !== undefined) report.append(div(css.failedItem, this.failure))
    this.card.replaceChildren(this.wordmark, report)
  }

  /** Render the `done/total · last-activated` line under the hint. */
  private renderProgress(): void {
    const total = this.total + this.prefetchTotal
    if (total === 0) {
      this.progress.textContent = ''
      return
    }
    const done = this.active.size + this.prefetchDone
    const name = this.lastActivated === undefined ? '' : ` · ${this.lastActivated}`
    this.progress.textContent = `${done}/${total}${name}`
  }

  /** Grow the rotating arc monotonically as prefetches arrive and entries activate. */
  private updateProgress(): void {
    const total = this.total + this.prefetchTotal
    const done = this.active.size + this.prefetchDone
    const ratio = total === 0 ? 0 : Math.min(done / total, 1)
    this.spinner.style.setProperty('--dsh-boot-arc', `${String(Math.round(72 + ratio * 216))}deg`)
  }
}
