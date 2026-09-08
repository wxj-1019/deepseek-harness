# Agent Note: Component library stories — live preview in the gallery

Status: implemented

English | [中文](2026-09-06-component-library-stories-live-preview.zh.md)

## Problem

The component library gallery showed each learned component's contract — props, tokens, and a captured usage example as text. The user asked for a react-bits-style experience: see the component, not just its description. The components are the harness's own application components, which depend on runtime props (session/workspace hooks, settings scopes, locale seats), so nothing rendered them outside their live surfaces.

## Decision

A repository story convention plus a build pipeline, with no Storybook:

- **Story convention** — `packages/client/<pkg>/tests/stories/<Component>.stories.tsx` exports `story = { record: '<pkg dir>/<Component>', mount(container) }`. `mount` renders the real component with hand-fed fake props — exactly the spec's factories (fakeScope, fake remotes, unused-hook stand-ins), so a story and its spec share one mental model. Stories live under `tests/`: outside the src 100%-coverage gate and outside both client bundle channels.
- **Build pipeline** — `apps/web/vite.config.ts` gains a `componentStories()` plugin: it scans `packages/client/*/tests/stories/`, serves `virtual:component-stories` (record-id keyed lazy imports, one on-demand chunk per story), adds a `stories` Vite input (`src/stories-entry.ts` registering `window.__DSH_STORIES__`), and splices the entry's script tag into the built `dist/index.html` — the same second-input + page-splice technique the preview surface established.
- **Gallery preview pane** — the component library gallery checks `window.__DSH_STORIES__.has(record.id)` and mounts the story inside an error boundary (a crashing story can never take the gallery down), running the story's disposer on row switch and unmount. Two seed stories ship: McpCard (interactive over an in-memory scope) and the component library card itself.

## Alternatives considered

- **SlotTestRuntime in the browser** — its recipe (real Context + fake sessions/workspaces + real renderer) is the north star for slot-anchored components, but it is jsdom/@testing-library-bound. V1 stories hand-feed complete props instead; the runtime recipe can back a later slot-anchored preview mode without changing the story convention.
- **Standalone /gallery.html page** — the second-page technique exists (preview.html), but v1 keeps the gallery inside the app where the data controller, search, and review already live. A standalone page remains an easy follow-up (second input + emit, shared chunks).
- **Scanner awareness of stories** — v1 keys stories to records purely by the declared `story.record` id on the client; teaching the scanner would only add a badge.

## Consequences

- Writing a preview for a component means writing one story file; the fake props already exist in the component's spec.
- Stories are repo artifacts compiled by the apps/web build: adding or removing one requires a `pnpm run build` to re-roll the stories entry; editing a story's content hot-reloads through the vite watch lane.
- A story's React copy is separate from the app's (isolated subtree, no shared elements) — acceptable for previews, load-bearing for stability.
