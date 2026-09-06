/**
 * Continuous learning watcher: chokidar over the checkout's
 * `packages/client` tree with a 200 ms stability threshold. Only the files
 * the pipeline consumes raise events: component sources and their CSS
 * modules under a package's `src/client`, and the theme stylesheet. A
 * settled CSS module re-learns its sibling component file because the token
 * references live there; a settled or removed theme stylesheet re-reads the
 * token inventory.
 * @module @deepseek-ai/dsh-component-library/src/watcher
 */

import { join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { CLIENT_TREE, THEME_STYLESHEET } from './scanner.ts'

/** Default awaitWriteFinish stability threshold, matching the skill watcher. */
export const WATCH_STABILITY_THRESHOLD_MS = 200

/** Default awaitWriteFinish poll interval, matching the skill watcher. */
export const WATCH_POLL_INTERVAL_MS = 100

/** Sink for one human-readable watcher log line. */
export type WatchLog = (line: string) => void

/** Callbacks the watcher raises on settled filesystem events. */
export interface ComponentLibraryWatchEvents {
  /** One `.tsx` file (or its CSS module) under `src/client` settled and should be re-learned. */
  readonly onFileSettled: (file: string) => void
  /** One `.tsx` file disappeared; its records should be dropped. */
  readonly onFileRemoved: (file: string) => void
  /** The theme stylesheet settled or disappeared; the token inventory should be re-read. */
  readonly onThemeSettled: () => void
}

/**
 * True for the only files the pipeline consumes. The scope matches the
 * scanner's walk exactly — `src/client` sources plus the theme stylesheet —
 * so spec files, fixtures, and other stylesheets never reach the pipeline.
 */
function isRelevant(file: string): boolean {
  const posix = file.replaceAll('\\', '/')
  if (posix.endsWith(THEME_STYLESHEET)) return true
  if (!posix.includes('/src/client/')) return false
  return posix.endsWith('.tsx') || posix.endsWith('.module.css')
}

/** Map one changed path to the `.tsx` file whose records it feeds. */
function sourceFileOf(file: string): string {
  return file.endsWith('.module.css') ? file.replace(/\.module\.css$/, '.tsx') : file
}

/** True when one relevant path is the theme stylesheet. */
function isThemeStylesheet(file: string): boolean {
  return file.replaceAll('\\', '/').endsWith(THEME_STYLESHEET)
}

/**
 * Chokidar watcher over the client tree. Construction is cheap; `start`
 * opens the watcher and resolves on chokidar's ready event, `dispose` closes
 * it exactly once.
 */
export class ComponentLibraryWatcher {
  private watcher: FSWatcher | undefined
  private opening: Promise<void> | undefined

  /**
   * @param root - checkout root containing {@link CLIENT_TREE}.
   * @param events - settled-event callbacks.
   * @param log - watcher warning sink.
   */
  constructor(
    private readonly root: string,
    private readonly events: ComponentLibraryWatchEvents,
    private readonly log: WatchLog,
  ) {}

  /** Open the watcher; resolves once chokidar reports ready. */
  async start(): Promise<void> {
    if (this.opening !== undefined) return this.opening
    const watcher = chokidar.watch(join(this.root, CLIENT_TREE), {
      persistent: true,
      ignoreInitial: true,
      // Uncapped like the scanner's walk; node_modules is excluded below.
      followSymlinks: false,
      atomic: true,
      awaitWriteFinish: {
        stabilityThreshold: WATCH_STABILITY_THRESHOLD_MS,
        pollInterval: WATCH_POLL_INTERVAL_MS,
      },
      ignored: /node_modules/,
    })
    this.watcher = watcher
    this.opening = new Promise<void>((resolve, reject) => {
      watcher.on('ready', () => {
        resolve()
      })
      watcher.on('error', (error) => {
        this.log(`component-library: watcher error: ${String(error)}`)
        if (this.opening !== undefined) reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
    watcher.on('add', (file) => { this.settled(file) })
    watcher.on('change', (file) => { this.settled(file) })
    watcher.on('unlink', (file) => { this.removed(file) })
    // A disposed-then-ready race rejects nobody; the close simply wins.
    this.opening.catch(() => {})
    await this.opening
  }

  /** Close the watcher; safe to call more than once. */
  async dispose(): Promise<void> {
    const watcher = this.watcher
    this.watcher = undefined
    this.opening = undefined
    await watcher?.close()
  }

  /** Raise the settled callback for one relevant path. */
  private settled(file: string): void {
    if (!isRelevant(file)) return
    if (isThemeStylesheet(file)) {
      this.events.onThemeSettled()
      return
    }
    this.events.onFileSettled(sourceFileOf(file))
  }

  /** Raise the removal callback for one relevant path. */
  private removed(file: string): void {
    if (!isRelevant(file)) return
    if (isThemeStylesheet(file)) {
      // The inventory re-read treats an absent stylesheet as empty.
      this.events.onThemeSettled()
      return
    }
    if (file.endsWith('.module.css')) {
      // Token references changed; re-learn the sibling component file.
      this.events.onFileSettled(sourceFileOf(file))
      return
    }
    this.events.onFileRemoved(file)
  }
}
