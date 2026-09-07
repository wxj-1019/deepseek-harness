/**
 * Component live-preview registry: page-global bridge between the component
 * stories compiled from the repo's `tests/stories/` directories and the
 * component library gallery, which mounts them through
 * `window.__DSH_STORIES__`. Built as a standalone Vite input (the same
 * technique as the preview bootstrap) so the SPA page gets the registry
 * without the shell importing story code.
 *
 * The `virtual:component-stories` ambient types live in
 * `virtual-component-stories.d.ts` beside this entry.
 */

import { has, ids, mount } from 'virtual:component-stories'

declare global {
  interface Window {
    /** Component live-preview registry consumed by the component library gallery. */
    __DSH_STORIES__: {
      has(id: string): boolean
      ids(): string[]
      mount(id: string, container: HTMLElement): Promise<void | (() => void)>
    }
  }
}

window.__DSH_STORIES__ = { has, ids, mount }
