# Web Client Custom Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-configurable background for the product Web UI (none / built-in gradient presets / one uploaded image), per the spec at `.agents/notes/proposed/feature/2026-08-15-web-client-background.md`.

**Architecture:** One new client plugin package `packages/client/ui-background` (`@deepseek-ai/dsh-client-ui-background`) mirroring `ui-theme`'s two-half shape. Host half: settings namespace `ui-background`, `/backgrounds` webServer route (POST upload via the existing `ctx.attachments` store, GET current image), and a boot `tapIndex` style injection. Client half: `ctx.background` service with `background/change` event, a presenter that writes three body-level CSS variables through a `<style>` element, and a Background `settings.section`. `ui-layout` gains two inert backdrop/scrim layers that consume those variables; the AppFrame root, `body`, and the boot page repaint through `--dsw-specific-backdrop-surface`.

**Tech Stack:** TypeScript ESM, vendored Cordis plugins, schemastery settings schemas, React 18 + CSS Modules, Vitest (per-file `@vitest-environment` pragmas), Playwright Chromium e2e.

---

## Spec amendments this plan implements (record in the note, Task 10)

The spec (`.agents/notes/proposed/feature/2026-08-15-web-client-background.md`) is implemented with four refinements decided while reading the real code:

1. **`GET /backgrounds/current`, not `GET /backgrounds/<id>`** — `readImage` verifies the full `ImageAttachmentRef` (mediaType/bytes/width/height), which a bare id in the URL cannot supply. The handler resolves the ref from the current settings section; `ETag: "<attachmentId>"` + `Cache-Control: no-cache` make reloads cheap (304) and switches correct.
2. **The presenter lives in `ui-background`, not `ui-layout`** — it writes only its own `<style>` element in `document.head`, so `ui-layout` never consumes the service. Its change shrinks to inert layers + variable consumption; the layout works unchanged without the plugin.
3. **Upload admission reuses `ctx.attachments.imageLimits`** instead of a new plugin `Config` field — the attachment provider already owns the deployment-resolved image policy (`maxImageBytes`, `mediaTypes`); one policy covers both features.
4. **Preset variants ride one CSS rule pair** (`body` + `body[data-ds-dark-theme]`) — the presenter needs no theme subscription at all.

## Ground rules for the executor (read once)

- **Never edit** `website/.generated/`, `packages/*/lib/`, or `apps/web/dist/`.
- **Registrations are effects**: every `register`/`tapIndex`/`provide` return goes through `ctx.effect(...)` or an inject callback's teardown.
- **Files end with exactly one trailing newline.** Pre-commit enforces it.
- Comments state contracts, not reasoning transcripts. No metaphors. Every export gets JSDoc (`@param`/`@returns` on function-likes).
- Tests describe behavior in English comments; specs use `it('...')` sentences.
- Commit only the files each task lists. The working tree has an unrelated modified `package.json` — never stage it (`git add` explicit paths only).
- Per-task test run: `pnpm exec vitest run <spec path>` from the repo root. Per-package type build: `pnpm exec tsc -b packages/client/ui-background` (first run also builds referenced projects — slow, expected).
- The client bundle purity gate forbids cross-plugin **value** imports (`@deepseek-ai/dsh-*`); collaboration goes through cordis services. `@deepseek-ai/schemastery` and `clsx` inline fine. The client half may import `../background-settings.ts` (same package) freely — `ui-theme`'s client does exactly this with `../theme-settings.ts`.
- All code fences below are marked `ignore-check` because they are implementation fragments, not standalone-checkable docs.

## File structure

**Create — new package `packages/client/ui-background/`:**

| File | Responsibility |
|---|---|
| `package.json` | Package manifest, `dsh.client` block, deps (mirror `ui-theme`) |
| `tsconfig.json` | Client aggregate face (extends `tsconfig.base.client.json`) |
| `tsdown.config.ts` | `clientBundle` preset call (node lib + browser bundle) |
| `src/css-modules.d.ts` | CSS-module ambient declarations |
| `src/background-settings.ts` | Shared schema, types, preset registry, `resolveBackdrop`, `backdropVarsCss` |
| `src/boot-background.ts` | Host `tapIndex` HTML transform |
| `src/http.ts` | `/backgrounds` POST/GET handlers (node side) |
| `src/index.ts` | Host half: settings register, routes, boot tap |
| `src/invariant.ts` | Package invariant companion (no-op installer) |
| `src/client/index.ts` | `BackgroundRuntime` service + `BackgroundPresenter` + `apply` |
| `src/client/settings-store.ts` | Section slot store (snapshot mirror) |
| `src/client/locales.ts` | `settings.background` zh/en dictionaries |
| `src/client/BackgroundSection.tsx` | Settings section component |
| `src/client/BackgroundSection.module.css` | Section styles |
| `tests/background-settings.client.spec.ts` | Shared resolution + registry |
| `tests/boot-background.client.spec.ts` | Boot HTML transform |
| `tests/http.client.spec.ts` | Host half: namespace, routes (real WebServer), boot tap |
| `tests/background.client.spec.ts` | Service runtime + presenter |
| `tests/settings-store.client.spec.ts` | Store mirror + revision guard |
| `tests/apply.client.spec.ts` | apply wiring + section registration |
| `tests/BackgroundSection.client.spec.tsx` | Section component behavior (jsdom) |
| `tests/invariant.client.spec.ts` | Companion registration |
| `README.md`, `README.zh.md`, `README.i18n.yaml` | Package docs (bilingual pair) |

**Modify:**

| File | Change |
|---|---|
| `packages/client/ui-layout/src/client/AppFrame.tsx` | Render two inert backdrop layers |
| `packages/client/ui-layout/src/client/AppFrame.module.css` | Layers + `.frame` surface var |
| `packages/client/ui-layout/tests/backdrop-layers.client.spec.tsx` (new) | Layer render + CSS-var contract |
| `packages/client/web/src/base.css` | `body` background through surface var |
| `packages/client/web/src/AppRoot.module.css` | Boot page background through surface var |
| `packages/bundle/web-app/package.json` | Add dependency |
| `packages/bundle/web-app/cordis.patch.yml` | Add `ui-background` row after `ui-theme` |
| `apps/web/tests/assembled-boot.ts` | Add module-table row |
| `apps/web/tests/background-settings.e2e.ts` (new) | Chromium journey + golden |
| `tsconfig.base.json` | Path mapping |
| `tsconfig.client.json` | Project reference |
| `.agents/notes/proposed/feature/2026-08-15-web-client-background.md` (+`.zh.md`) | Record the amendments above |

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/client/ui-background/package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/css-modules.d.ts`, `src/invariant.ts`
- Modify: `tsconfig.base.json`, `tsconfig.client.json`
- Test: `packages/client/ui-background/tests/invariant.client.spec.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@deepseek-ai/dsh-client-ui-background",
  "description": "Background plugin: durable none/preset/image preference over the attachments store, /backgrounds upload-and-serve route, boot backdrop style, and the Background settings section",
  "version": "0.1.0-rc.5",
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/deepseek-ai/deepseek-harness.git",
    "directory": "packages/client/ui-background"
  },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./invariant": {
      "types": "./lib/types/invariant.d.ts",
      "default": "./lib/invariant.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-api-remotes"
      ],
      "platform": "web",
      "immediately": true
    }
  },
  "license": "MIT",
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-api-remotes": "workspace:^",
    "@deepseek-ai/dsh-client-connection": "workspace:^",
    "@deepseek-ai/dsh-client-locale": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^",
    "@deepseek-ai/dsh-client-ui-settings": "workspace:^",
    "@deepseek-ai/dsh-client-ui-slots": "workspace:^",
    "@deepseek-ai/dsh-host-webserver": "workspace:^",
    "@deepseek-ai/dsh-invariants": "workspace:^",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-api-remotes": "workspace:^",
    "@deepseek-ai/dsh-client-locale": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^",
    "@deepseek-ai/dsh-client-test-runtime": "workspace:^",
    "@deepseek-ai/dsh-client-ui-settings": "workspace:^",
    "@deepseek-ai/dsh-client-ui-slots": "workspace:^",
    "@deepseek-ai/dsh-host-webserver": "workspace:^",
    "@deepseek-ai/dsh-invariants": "workspace:^",
    "@types/react": "~18.3.1",
    "react": "^18.2.0"
  },
  "files": [
    "lib/index.js",
    "lib/invariant.js",
    "lib/client.js",
    "lib/types/**/*.d.ts"
  ],
  "scripts": {
    "bundle": "tsdown",
    "watch": "tsdown --watch"
  },
  "dependencies": {
    "@deepseek-ai/dsh-attachment": "workspace:^",
    "@deepseek-ai/dsh-settings": "workspace:^",
    "@deepseek-ai/schemastery": "workspace:^",
    "clsx": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.client.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/types"
  },
  "include": [
    "src"
  ],
  "references": [
    { "path": "../locale" },
    { "path": "../runtime" },
    { "path": "../ui-slots" },
    { "path": "../ui-settings" },
    { "path": "../../attachment/attachment" },
    { "path": "../../host/webserver" },
    { "path": "../../settings/settings" },
    { "path": "../../runtime-diagnostics/invariants" },
    { "path": "../../../vendor/cordis" }
  ]
}
```

- [ ] **Step 3: Create `tsdown.config.ts`** (no styles to copy, so no `copy` override)

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-client-ui-background',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
```

- [ ] **Step 4: Create `src/css-modules.d.ts`**

```ts ignore-check
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css'
```

- [ ] **Step 5: Create `src/invariant.ts`** (companion boilerplate; `ui-theme`'s is the template — `packages/client/ui-theme/src/invariant.ts`)

```ts ignore-check
/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-background`.
 * @module @deepseek-ai/dsh-client-ui-background/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-background'

/** Cordis companion plugin name. */
export const name = 'client-ui-background-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the settings scope validates and publishes the durable
 * background section, and the service emits `background/change` synchronously
 * with its own mutations. Store/service agreement is covered directly by this
 * package's Host, scope, and service behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
```

- [ ] **Step 6: Wire the solution graph.** In `tsconfig.base.json`, add the path next to the `ui-theme` line (~line 216):

```json
      "@deepseek-ai/dsh-client-ui-theme": ["./packages/client/ui-theme/src"],
      "@deepseek-ai/dsh-client-ui-background": ["./packages/client/ui-background/src"],
```

In `tsconfig.client.json`, add the reference after `{ "path": "./packages/client/ui-theme" },` (~line 89):

```json
    { "path": "./packages/client/ui-theme" },
    { "path": "./packages/client/ui-background" },
```

- [ ] **Step 7: Write the failing invariant spec** — `tests/invariant.client.spec.ts`

```ts ignore-check
/** The invariant companion registers package ownership and disposes cleanly. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

const REGISTRATIONS = new Map<string, unknown>()

describe('ui-background invariant companion', () => {
  it('registers and disposes package ownership', async () => {
    const ctx = new Context()
    ctx.provide('invariants', {
      register: (name: string, install: unknown) => {
        REGISTRATIONS.set(name, install)
        return () => { REGISTRATIONS.delete(name) }
      },
    } as never)
    const { apply, inject, name } = await import('../src/invariant.ts')
    expect(inject).toEqual(['invariants'])
    expect(name).toBe('client-ui-background-invariant')
    const dispose = await apply(ctx)
    expect(REGISTRATIONS.has('@deepseek-ai/dsh-client-ui-background')).toBe(true)
    dispose()
    expect(REGISTRATIONS.has('@deepseek-ai/dsh-client-ui-background')).toBe(false)
  })
})
```

- [ ] **Step 8: Install and verify**

Run: `pnpm install --ignore-scripts && pnpm exec vitest run packages/client/ui-background/tests/invariant.client.spec.ts`
Expected: 1 passed.

Run: `pnpm exec tsc -b packages/client/ui-background`
Expected: exits 0 (builds referenced projects on first run).

- [ ] **Step 9: Commit**

```bash
git add packages/client/ui-background tsconfig.base.json tsconfig.client.json pnpm-lock.yaml
git commit -m "feat(client/ui-background): scaffold the background plugin package"
```

---

### Task 2: Shared settings module (schema, presets, resolution, CSS)

**Files:**
- Create: `packages/client/ui-background/src/background-settings.ts`
- Test: `packages/client/ui-background/tests/background-settings.client.spec.ts`

- [ ] **Step 1: Write the failing spec** — `tests/background-settings.client.spec.ts`

```ts ignore-check
/** Shared background resolution: schema-shaped sections resolve to paintable
 * backdrops; presets always carry both palette modes. */
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND, resolveBackdrop,
} from '../src/background-settings.ts'

describe('resolveBackdrop', () => {
  it('resolves none by default and from an explicit section', () => {
    expect(DEFAULT_BACKGROUND.preference).toBe('none')
    expect(resolveBackdrop({ preference: 'none', dimming: 45 })).toEqual({ kind: 'none' })
  })

  it('resolves a registered preset with both palette modes', () => {
    const aurora = BACKGROUND_PRESETS.find(p => p.id === 'aurora')
    expect(aurora?.css.light).toMatch(/^linear-gradient/)
    expect(aurora?.css.dark).toMatch(/^linear-gradient/)
    expect(resolveBackdrop({ preference: 'preset', preset: 'aurora', dimming: 45 }))
      .toEqual({ kind: 'preset', css: { light: aurora!.css.light, dark: aurora!.css.dark } })
  })

  it('fails loud on an unknown preset id', () => {
    expect(resolveBackdrop({ preference: 'preset', preset: 'sepia', dimming: 45 }))
      .toEqual({ kind: 'invalid', reason: 'unknown-preset' })
  })

  it('resolves a complete image reference and fails loud without one', () => {
    const image = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png' as const, bytes: 3, width: 2, height: 2 }
    expect(resolveBackdrop({ preference: 'image', image, dimming: 45 })).toEqual({ kind: 'image' })
    expect(resolveBackdrop({ preference: 'image', dimming: 45 }))
      .toEqual({ kind: 'invalid', reason: 'missing-image-ref' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client/ui-background/tests/background-settings.client.spec.ts`
Expected: FAIL — module `../src/background-settings.ts` not found.

- [ ] **Step 3: Implement `src/background-settings.ts`**

```ts ignore-check
/** Background preferences and resolution shared by the Host and browser halves. */

import z from '@deepseek-ai/schemastery'

/** Background kinds accepted at the settings boundary. */
export const BACKGROUND_PREFERENCES = ['none', 'preset', 'image'] as const

/** Settings namespace owned by the background plugin. */
export const BACKGROUND_SETTINGS_NAMESPACE = 'ui-background'

/** Media types a stored background image may carry (the attachment admission set). */
export const BACKGROUND_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** Default scrim strength in percent. */
export const DEFAULT_DIMMING = 45

/** Server path answering the current stored background image. */
export const BACKDROP_IMAGE_URL = '/backgrounds/current'

/** Server path accepting one raw upload body. */
export const BACKGROUND_UPLOAD_PATH = '/backgrounds'

/** Wire value of one durable stored-image reference (the attachment ref, schema-shaped). */
export interface BackgroundImageRef {
  /** Content-addressed opaque identifier (`sha256:<hex>`). */
  attachmentId: string
  /** Media type verified from the stored bytes. */
  mediaType: typeof BACKGROUND_IMAGE_MEDIA_TYPES[number]
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
}

/** Durable background section shared by the Host schema and the browser scope. */
export interface BackgroundSettings {
  /** Active background kind. */
  preference: typeof BACKGROUND_PREFERENCES[number]
  /** Preset id; read only while the preference is `preset`. */
  preset?: string
  /** Stored-image reference; read only while the preference is `image`. */
  image?: BackgroundImageRef
  /** Scrim strength over the background, 0-90 percent. */
  dimming: number
}

/** Durable background schema; also the wire envelope the browser scope validates against. */
export const BackgroundSettingsSchema: z<BackgroundSettings> = z.object({
  preference: z.union([...BACKGROUND_PREFERENCES]).default('none'),
  preset: z.string().optional(),
  image: z.object({
    attachmentId: z.string(),
    mediaType: z.union([...BACKGROUND_IMAGE_MEDIA_TYPES]),
    bytes: z.natural(),
    width: z.natural(),
    height: z.natural(),
  }).optional(),
  dimming: z.number().step(1).min(0).max(90).default(DEFAULT_DIMMING),
})

/** Section value before any settings provider answers. */
export const DEFAULT_BACKGROUND: BackgroundSettings = Object.freeze({ preference: 'none', dimming: DEFAULT_DIMMING })

/** One built-in gradient background; both palette modes are mandatory. */
export interface BackgroundPreset {
  /** Preset id (`settings.background` locale keys `preset.<id>`). */
  id: 'aurora' | 'dusk' | 'mist'
  /** CSS `background-image` value per palette mode. */
  css: { light: string; dark: string }
}

/** Fixed preset registry; the Background settings section is the only selector surface. */
export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = Object.freeze([
  Object.freeze({
    id: 'aurora',
    css: Object.freeze({
      light: 'linear-gradient(160deg, #dce7fb 0%, #eef1f8 48%, #f7f3ec 100%)',
      dark: 'linear-gradient(160deg, #111827 0%, #151b2c 48%, #1d2130 100%)',
    }),
  }),
  Object.freeze({
    id: 'dusk',
    css: Object.freeze({
      light: 'linear-gradient(160deg, #ffe7d1 0%, #f6e2ee 52%, #e2e6f9 100%)',
      dark: 'linear-gradient(160deg, #251a2b 0%, #191c2e 52%, #0f1524 100%)',
    }),
  }),
  Object.freeze({
    id: 'mist',
    css: Object.freeze({
      light: 'linear-gradient(180deg, #f1f4f6 0%, #e6ecef 100%)',
      dark: 'linear-gradient(180deg, #161a1e 0%, #101418 100%)',
    }),
  }),
])

/** What a presenter should paint for one durable section. */
export type BackdropResolution =
  | { kind: 'none' }
  | { kind: 'preset'; css: { light: string; dark: string } }
  | { kind: 'image' }
  | { kind: 'invalid'; reason: 'unknown-preset' | 'missing-image-ref' }

function assertNever(value: never): never {
  throw new Error(`unexpected background preference: ${String(value)}`)
}

/**
 * Resolve one schema-resolved section to a paintable backdrop.
 * @param section - durable section (defaults already applied).
 * @returns the resolution; mismatched pairings fail loud through `invalid`.
 */
export function resolveBackdrop(section: BackgroundSettings): BackdropResolution {
  switch (section.preference) {
    case 'none': return { kind: 'none' }
    case 'preset': {
      const preset = BACKGROUND_PRESETS.find(p => p.id === section.preset)
      return preset === undefined ? { kind: 'invalid', reason: 'unknown-preset' } : { kind: 'preset', css: preset.css }
    }
    case 'image':
      return section.image === undefined ? { kind: 'invalid', reason: 'missing-image-ref' } : { kind: 'image' }
    default: return assertNever(section.preference)
  }
}

/**
 * Build the body-variable rules for one section — the single source shared by
 * the Host boot transform and the runtime presenter.
 * @param section - durable section (defaults already applied).
 * @returns CSS text; empty when nothing should paint (none/invalid), so both
 * callers treat an empty string as "retract everything".
 */
export function backdropVarsCss(section: BackgroundSettings): string {
  const resolution = resolveBackdrop(section)
  if (resolution.kind === 'none' || resolution.kind === 'invalid') return ''
  const scrim = `color-mix(in srgb, var(--dsw-alias-bg-base) ${section.dimming}%, transparent)`
  const surface = '--dsw-specific-backdrop-surface:transparent'
  if (resolution.kind === 'image') {
    return `body{--dsw-specific-backdrop-image:url("${BACKDROP_IMAGE_URL}");--dsw-specific-backdrop-scrim:${scrim};${surface}}`
  }
  return `body{--dsw-specific-backdrop-image:${resolution.css.light};--dsw-specific-backdrop-scrim:${scrim};${surface}}`
    + `body[data-ds-dark-theme]{--dsw-specific-backdrop-image:${resolution.css.dark}}`
}
```

- [ ] **Step 4: Run the spec**

Run: `pnpm exec vitest run packages/client/ui-background/tests/background-settings.client.spec.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/ui-background/src/background-settings.ts packages/client/ui-background/tests/background-settings.client.spec.ts
git commit -m "feat(client/ui-background): shared background schema, presets, and resolution"
```

---

### Task 3: Boot backdrop transform

**Files:**
- Create: `packages/client/ui-background/src/boot-background.ts`
- Test: `packages/client/ui-background/tests/boot-background.client.spec.ts`

- [ ] **Step 1: Write the failing spec** — `tests/boot-background.client.spec.ts`

```ts ignore-check
/** The Host index transform splices the backdrop variables into <head> before
 * first paint; none/invalid sections leave the HTML untouched. */
import { describe, expect, it } from 'vitest'
import { injectBootBackground } from '../src/boot-background.ts'
import { DEFAULT_BACKGROUND, type BackgroundSettings } from '../src/background-settings.ts'

const HTML = '<html><head><title>t</title></head><body><div id="root"></div></body></html>'

describe('injectBootBackground', () => {
  it('leaves the HTML untouched for the default (none) section', () => {
    expect(injectBootBackground(HTML, DEFAULT_BACKGROUND)).toBe(HTML)
  })

  it('splices the style before </head> for a preset, with the dark override', () => {
    const out = injectBootBackground(HTML, { preference: 'preset', preset: 'aurora', dimming: 30 })
    expect(out).not.toBe(HTML)
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('</head>'))
    expect(out).toContain('linear-gradient(160deg, #dce7fb')
    expect(out).toContain('body[data-ds-dark-theme]{--dsw-specific-backdrop-image:')
    expect(out).toContain('color-mix(in srgb, var(--dsw-alias-bg-base) 30%, transparent)')
  })

  it('resolves the image URL from the section for an image background', () => {
    const section: BackgroundSettings = {
      preference: 'image',
      image: { attachmentId: `sha256:${'b'.repeat(64)}`, mediaType: 'image/png', bytes: 1, width: 1, height: 1 },
      dimming: 45,
    }
    expect(injectBootBackground(HTML, section)).toContain('url("/backgrounds/current")')
  })

  it('appends the style when the fragment has no head', () => {
    const out = injectBootBackground('<body></body>', { preference: 'preset', preset: 'mist', dimming: 45 })
    expect(out).toContain('<style>')
  })

  it('leaves the HTML untouched for an invalid section (covers the invalid arm of backdropVarsCss)', () => {
    expect(injectBootBackground(HTML, { preference: 'preset', preset: 'gone', dimming: 45 })).toBe(HTML)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client/ui-background/tests/boot-background.client.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/boot-background.ts`** (structure mirrors `packages/client/ui-theme/src/boot-theme.ts`)

```ts ignore-check
/**
 * Host-rendered backdrop bootstrap for the browser's pre-plugin interval. Each
 * index response embeds the current durable background section as body
 * variables; the shell loading page and first paint render over them, and the
 * client presenter re-owns the same variables after the plugin tree activates.
 */

import {
  DEFAULT_BACKGROUND, backdropVarsCss, type BackgroundSettings,
} from './background-settings.ts'

/**
 * Insert the backdrop style before the closing head tag, ahead of any painted
 * content. Head-less fragments receive it at the end.
 * @param html - Raw application index HTML.
 * @param section - Current Host-backed background section.
 * @returns HTML containing the backdrop bootstrap (unchanged when nothing paints).
 */
export function injectBootBackground(
  html: string,
  section: BackgroundSettings = DEFAULT_BACKGROUND,
): string {
  const css = backdropVarsCss(section)
  if (css === '') return html
  const style = `<style>${css}</style>`
  const head = /<\/head\s*>/i.exec(html)
  if (head === null) return `${html}${style}`
  const at = head.index
  return `${html.slice(0, at)}${style}${html.slice(at)}`
}
```

- [ ] **Step 4: Run the spec**

Run: `pnpm exec vitest run packages/client/ui-background/tests/boot-background.client.spec.ts`
Expected: 5 passed (plus the default-parameter case added in review — 6 in the file after the strengthening amendment).

- [ ] **Step 5: Commit**

```bash
git add packages/client/ui-background/src/boot-background.ts packages/client/ui-background/tests/boot-background.client.spec.ts
git commit -m "feat(client/ui-background): boot backdrop index transform"
```

---

### Task 4: `/backgrounds` route handlers

**Files:**
- Create: `packages/client/ui-background/src/http.ts`
- Test: `packages/client/ui-background/tests/http.client.spec.ts`

- [ ] **Step 1: Write the failing spec** — `tests/http.client.spec.ts` (handlers are exercised through a real `WebServer` on an OS-assigned port; a plain-object attachments stub mirrors the `as WebServer` cast idiom in `packages/client/ui-theme/tests/host.client.spec.ts`)

```ts ignore-check
/** Host half: durable namespace registration, /backgrounds admission and
 * serving (same-origin write fence, limits from the attachments policy, ETag
 * revalidation, 404 without a current image), and the boot index tap. */
import { Context } from '@deepseek-ai/cordis'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_BACKGROUND, BACKGROUND_SETTINGS_NAMESPACE, type BackgroundImageRef } from '../src/background-settings.ts'

const REF: BackgroundImageRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 2,
  height: 2,
}

function attachmentsStub(over: Partial<Record<'saved', number>> = {}): AttachmentStore {
  return {
    imageLimits: Object.freeze({
      maxImageBytes: 8,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 8,
      maxImagePixels: 100,
      mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    }),
    validateImage: () => Promise.resolve(),
    saveImage: () => { over.saved = (over.saved ?? 0) + 1; return Promise.resolve({ ...REF }) },
    readImage: (ref: BackgroundImageRef) => Promise.resolve({ ref, data: new Uint8Array([1, 2, 3]) }),
  } as unknown as AttachmentStore
}

/** In-memory settings document (the ui-theme host spec's MemorySettings). */
class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

const live: Context[] = []
const base = () => `http://127.0.0.1:${live.at(-1)!.webServer.port}`

afterAll(async () => { await Promise.all(live.map(ctx => ctx.dispose())) })

/** Boot one Host composition: real settings provider + real WebServer. */
async function boot(attachments: AttachmentStore): Promise<Context> {
  const ctx = new Context()
  const { apply } = await import('../src/index.ts')
  await ctx.plugin(MemorySettings).await()
  ctx.provide('attachments', attachments)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  live.push(ctx)
  await ctx.plugin({ apply }).await()
  return ctx
}

/** The boot tap runs through the real pipeline the fallback owner uses. */
function tapOutput(ctx: Context, html: string): string {
  return ctx.webServer.applyIndexTaps(html)
}

describe('ui-background host', () => {
  it('registers, validates, and disposes the durable namespace', async () => {
    const ctx = await boot(attachmentsStub())
    const ns = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)
    expect(ctx.settings.get(ns)).toEqual(DEFAULT_BACKGROUND)
    await ctx.settings.update(ns, { preference: 'preset', preset: 'aurora' })
    expect(ctx.settings.get(ns)).toMatchObject({ preference: 'preset', preset: 'aurora', dimming: 45 })
    await expect(ctx.settings.update(ns, { preference: 'sepia' })).rejects.toThrow()
  })

  it('renders the current section through the boot index tap', async () => {
    const ctx = await boot(attachmentsStub())
    const HTML = '<html><head></head><body></body></html>'
    expect(tapOutput(ctx, HTML)).toContain('linear-gradient(160deg, #dce7fb')
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), { preference: 'none' })
    expect(tapOutput(ctx, HTML)).toBe(HTML)
  })

  it('admits a same-origin upload through the attachment store', async () => {
    const counters: Partial<Record<'saved', number>> = {}
    await boot(attachmentsStub(counters))
    const response = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'content-length': '3' },
      body: Buffer.alloc(3, 1),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ attachmentId: REF.attachmentId, mediaType: 'image/png' })
    expect(counters.saved).toBe(1)
  })

  it('rejects cross-site writes with 403', async () => {
    await boot(attachmentsStub())
    const response = await fetch(`${base()}/backgrounds`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'sec-fetch-site': 'cross-site', 'content-length': '3' },
      body: Buffer.alloc(3, 1),
    })
    expect(response.status).toBe(403)
  })

  it('rejects unsupported media types with 415 and oversize bodies with 413', async () => {
    await boot(attachmentsStub())
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/bmp', 'content-length': '3' }, body: Buffer.alloc(3, 1),
    })).status).toBe(415)
    expect((await fetch(`${base()}/backgrounds`, {
      method: 'POST', headers: { 'content-type': 'image/png', 'content-length': '9' }, body: Buffer.alloc(3, 1),
    })).status).toBe(413)
  })

  it('serves the current image with ETag revalidation and 404 without one', async () => {
    const ctx = await boot(attachmentsStub())
    await ctx.settings.update(settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE), {
      preference: 'image', image: REF,
    })
    const first = await fetch(`${base()}/backgrounds/current`)
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/png')
    expect(first.headers.get('cache-control')).toBe('no-cache')
    const etag = first.headers.get('etag')
    const revalidate = await fetch(`${base()}/backgrounds/current`, { headers: { 'if-none-match': etag! } })
    expect(revalidate.status).toBe(304)

    const bare = await boot(attachmentsStub())
    expect((await fetch(`http://127.0.0.1:${bare.webServer.port}/backgrounds/current`)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client/ui-background/tests/http.client.spec.ts`
Expected: FAIL — `../src/index.ts` has no `apply`.

- [ ] **Step 3: Implement `src/http.ts`**

```ts ignore-check
/** /backgrounds route handlers: upload admission and current-image serving. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { AttachmentError, AttachmentId, type AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { BACKGROUND_SETTINGS_NAMESPACE, type BackgroundImageRef, type BackgroundSettings } from './background-settings.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)
const CURRENT_PATH = '/backgrounds/current'

/** Services the handlers read per request. */
export interface BackgroundRouteDeps {
  /** Durable image storage (also owns the admission policy). */
  attachments: AttachmentStore
  /** Durable settings document (source of the current image reference). */
  settings: SettingsProvider
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Admit one upload: the same-origin fence, then the attachment policy
 * (declared media type, byte cap), then the durable save.
 * @param req - raw request whose body is the encoded image.
 * @param res - response owned by this handler.
 * @param deps - attachments store and settings document.
 */
export async function handleBackgroundUpload(
  req: IncomingMessage, res: ServerResponse, deps: BackgroundRouteDeps,
): Promise<void> {
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    json(res, 403, { error: 'cross-site' })
    return
  }
  const limits = deps.attachments.imageLimits
  const declared = String(req.headers['content-type'] ?? '')
  if (!limits.mediaTypes.some(type => type === declared)) {
    json(res, 415, { error: 'unsupported-media-type' })
    return
  }
  const contentLength = Number(req.headers['content-length'] ?? Number.NaN)
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > limits.maxImageBytes) {
    req.destroy()
    json(res, 413, { error: 'too-large' })
    return
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    received += (chunk as Buffer).byteLength
    if (received > limits.maxImageBytes) {
      req.destroy()
      json(res, 413, { error: 'too-large' })
      return
    }
    chunks.push(chunk as Buffer)
  }
  try {
    const ref = await deps.attachments.saveImage({
      data: new Uint8Array(Buffer.concat(chunks)),
      mediaType: declared as BackgroundImageRef['mediaType'],
    })
    json(res, 201, ref)
  } catch (error) {
    if (error instanceof AttachmentError) {
      json(res, 422, { error: 'rejected', code: error.code })
      return
    }
    throw error
  }
}

/**
 * Serve the current stored image: the settings document names the reference,
 * the ETag carries the content address, and `no-cache` keeps a switch correct
 * while an unchanged reload revalidates to 304.
 * @param req - request; `if-none-match` participates in revalidation.
 * @param res - response owned by this handler.
 * @param deps - attachments store and settings document.
 */
export async function handleCurrentBackground(
  req: IncomingMessage, res: ServerResponse, deps: BackgroundRouteDeps,
): Promise<void> {
  const section = deps.settings.get(NAMESPACE) as BackgroundSettings | undefined
  const ref = section?.image
  // Null-tolerant presence check: the schema admits an explicitly-present null
  // (hand-edited settings.yaml), which must 404, not crash on property access.
  if (ref == null) {
    json(res, 404, { error: 'no-current-image' })
    return
  }
  const etag = `"${ref.attachmentId}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag })
    res.end()
    return
  }
  try {
    const stored = await deps.attachments.readImage({ ...ref, attachmentId: AttachmentId(ref.attachmentId) })
    res.writeHead(200, { 'content-type': stored.ref.mediaType, 'cache-control': 'no-cache', etag })
    res.end(Buffer.from(stored.data))
  } catch (error) {
    if (error instanceof AttachmentError && error.code === 'ATTACHMENT_NOT_FOUND') {
      json(res, 404, { error: 'missing' })
      return
    }
    throw error
  }
}
```

- [ ] **Step 4: Implement the host half `src/index.ts`** (the routes need all three services; the boot tap needs only `webServer` — split the injects so each composition piece registers when its services are present)

```ts ignore-check
/** Host registration: durable background section, /backgrounds routes, boot backdrop style. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-attachment'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { injectBootBackground } from './boot-background.ts'
import { handleBackgroundUpload, handleCurrentBackground } from './http.ts'
import {
  BACKGROUND_SETTINGS_NAMESPACE, BackgroundSettingsSchema, DEFAULT_BACKGROUND,
  type BackgroundSettings,
} from './background-settings.ts'

export {
  BACKGROUND_IMAGE_MEDIA_TYPES, BACKGROUND_PREFERENCES, BACKGROUND_PRESETS, BACKGROUND_SETTINGS_NAMESPACE,
  BACKGROUND_UPLOAD_PATH, BACKDROP_IMAGE_URL, DEFAULT_BACKGROUND, DEFAULT_DIMMING,
  BackgroundSettingsSchema, resolveBackdrop,
  type BackgroundImageRef, type BackgroundPreset, type BackgroundSettings, type BackdropResolution,
} from './background-settings.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)

/** Read the registered section or the default without a settings provider. */
function readSection(ctx: Context): BackgroundSettings {
  const settings = ctx.get('settings')
  if (settings === undefined) return DEFAULT_BACKGROUND
  return (settings.get(NAMESPACE) as BackgroundSettings | undefined) ?? DEFAULT_BACKGROUND
}

/**
 * Register the durable background section, the /backgrounds route, and the
 * boot backdrop transform when their optional Host services are composed.
 * @param ctx - Host context that may acquire settings, attachments, and HTTP services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, BackgroundSettingsSchema)
  })
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectBootBackground(html, readSection(httpCtx))),
      'client-ui-background: boot backdrop',
    )
  })
  ctx.inject(['webServer', 'attachments', 'settings'], (routeCtx) => {
    const deps = {
      attachments: routeCtx.attachments,
      settings: routeCtx.settings,
    }
    routeCtx.effect(() => routeCtx.webServer.register({
      kind: 'prefix',
      path: '/backgrounds',
      handler: (req, res) => {
        const path = new URL(req.url ?? '/', 'http://x').pathname
        if (req.method === 'POST' && path === '/backgrounds') return handleBackgroundUpload(req, res, deps)
        if (req.method === 'GET' && path === CURRENT_PATH_LITERAL) return handleCurrentBackground(req, res, deps)
        res.writeHead(404)
        res.end()
      },
    }), 'client-ui-background: /backgrounds route')
  })
}

const CURRENT_PATH_LITERAL = '/backgrounds/current'
```

Note: `CURRENT_PATH_LITERAL` must be declared before `apply` runs but may sit below it (function hoisting does not apply to `const`); move it above `apply` in the actual file — declare it right after `NAMESPACE`:

```ts ignore-check
const CURRENT_PATH_LITERAL = '/backgrounds/current'
```

- [ ] **Step 5: Run the spec**

Run: `pnpm exec vitest run packages/client/ui-background/tests/http.client.spec.ts`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/client/ui-background/src/http.ts packages/client/ui-background/src/index.ts packages/client/ui-background/tests/http.client.spec.ts
git commit -m "feat(client/ui-background): /backgrounds upload and current-image route"
```

---

### Task 5: Client service and presenter

**Files:**
- Create: `packages/client/ui-background/src/client/index.ts`
- Test: `packages/client/ui-background/tests/background.client.spec.ts`

- [ ] **Step 1: Write the failing spec** — `tests/background.client.spec.ts`

```ts ignore-check
// @vitest-environment jsdom
/** BackgroundRuntime: snapshot projection, validated writes through the scope,
 * adoption of Host acceptances, presenter var rules, and the upload probe. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import {
  BackgroundRuntime, type BackgroundSnapshot,
} from '../src/client/index.ts'
import { DEFAULT_BACKGROUND, type BackgroundImageRef, type BackgroundSettings } from '../src/background-settings.ts'

afterEach(() => { document.head.innerHTML = ''; vi.unstubAllGlobals() })

const REF: BackgroundImageRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 2,
  height: 2,
}

function runtime() {
  const ctx = new Context()
  const stub = stubSettingsScope<BackgroundSettings>()
  const service = new BackgroundRuntime(ctx, stub.scope)
  return { ctx, stub, service }
}

describe('BackgroundRuntime', () => {
  it('starts at the default section with an inert presenter', () => {
    const { service } = runtime()
    expect(service.getBackground()).toMatchObject({
      section: DEFAULT_BACKGROUND,
      backdrop: { kind: 'none' },
      revision: 0,
    })
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
  })

  it('writes preset selections through the scope and paints both palette modes', () => {
    const { ctx, stub, service } = runtime()
    const events: BackgroundSnapshot[] = []
    ctx.on('background/change', (snapshot) => { events.push(snapshot) })
    service.setPreset('aurora')
    expect(stub.set).toHaveBeenCalledWith('preference', 'preset')
    expect(stub.set).toHaveBeenCalledWith('preset', 'aurora')
    const style = document.querySelector('style[data-dsh-background]')
    expect(style?.textContent).toContain('body[data-ds-dark-theme]')
    expect(events.at(-1)?.backdrop).toEqual({ kind: 'preset', css: expect.any(Object) })
    expect(() => { service.setPreset('sepia') }).toThrow(/not registered/)
  })

  it('writes image selections, dimming, and none retraction', () => {
    const { stub, service } = runtime()
    service.setImage(REF)
    expect(stub.set).toHaveBeenCalledWith('preference', 'image')
    expect(stub.set).toHaveBeenCalledWith('image', REF)
    expect(document.querySelector('style[data-dsh-background]')?.textContent).toContain('url("/backgrounds/current")')
    service.setDimming(60)
    expect(stub.set).toHaveBeenCalledWith('dimming', 60)
    expect(document.querySelector('style[data-dsh-background]')?.textContent).toContain(' 60%, transparent)')
    service.setNone()
    expect(stub.set).toHaveBeenCalledWith('preference', 'none')
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
  })

  it('adopts Host acceptances, including invalid pairings', () => {
    const { stub, service } = runtime()
    stub.publish({ status: 'ready', value: { preference: 'preset', preset: 'dusk', dimming: 45 }, revision: 1 })
    expect(service.getBackground().backdrop).toEqual({ kind: 'preset', css: expect.any(Object) })
    stub.publish({ status: 'ready', value: { preference: 'preset', preset: 'gone', dimming: 45 }, revision: 2 })
    expect(service.getBackground().backdrop).toEqual({ kind: 'invalid', reason: 'unknown-preset' })
    expect(document.querySelector('style[data-dsh-background]')).toBeNull()
  })

  it('uploads raw bytes and probes the current image', async () => {
    const { service } = runtime()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(REF), { status: 201, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([1, 2, 3])], 'bg.png', { type: 'image/png' })
    expect(await service.uploadImage(file)).toEqual(REF)
    expect(fetchMock).toHaveBeenCalledWith('/backgrounds', {
      method: 'POST', body: file, headers: { 'content-type': 'image/png' },
    })
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(service.uploadImage(file)).rejects.toThrow(/404/)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    expect(await service.probeImage()).toBe(true)
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    expect(await service.probeImage()).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client/ui-background/tests/background.client.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/client/index.ts`**

```ts ignore-check
/**
 * Browser background service over the durable `ui-background` section: it owns
 * the live preference (none / built-in preset / one stored image), publishes
 * immutable snapshots on `background/change`, and projects the three
 * `--dsw-specific-backdrop-*` body variables through a presenter-owned style
 * element. Uploads POST raw bytes to /backgrounds and return the stored
 * reference; the Background settings section (registered here) chains
 * setImage after a successful upload.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BackgroundSection } from './BackgroundSection.tsx'
import type { BackgroundSectionInjected } from './BackgroundSection.tsx'
import { createBackgroundSectionStore } from './settings-store.ts'
import { en, zh, type BackgroundKey } from './locales.ts'
import {
  BACKGROUND_PRESETS, BACKGROUND_SETTINGS_NAMESPACE, BACKGROUND_UPLOAD_PATH, BACKDROP_IMAGE_URL,
  DEFAULT_BACKGROUND, backdropVarsCss,
  type BackgroundImageRef, type BackgroundSettings, type BackdropResolution, resolveBackdrop,
} from '../background-settings.ts'

export type {
  BackgroundSectionComponentProps, BackgroundSectionInjected,
} from './BackgroundSection.tsx'
export type { BackgroundSectionState } from './settings-store.ts'
export type { BackgroundKey } from './locales.ts'
export type {
  BackgroundImageRef, BackgroundSettings, BackgroundPreset, BackdropResolution,
} from '../background-settings.ts'

/** Namespace owning this feature's settings-section copy. */
export const SETTINGS_NS = 'settings.background'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Background settings section's copy. */
    'settings.background': BackgroundKey
  }
}

/** Immutable background state published on every change. */
export interface BackgroundSnapshot {
  /** Durable section as last accepted or written. */
  section: BackgroundSettings
  /** What a presenter should paint for the section. */
  backdrop: BackdropResolution
  /** Monotonic change counter. */
  revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    background: BackgroundRuntime
  }
  interface Events {
    /**
     * Background state changed (a validated write or an adopted Host acceptance).
     * @param snapshot - Current immutable background snapshot.
     * @mode emit
     */
    'background/change'(snapshot: BackgroundSnapshot): void
  }
}

/**
 * Project background sections onto the document through one presenter-owned
 * style element in head. Pure DOM writes, no React involvement; `none` and
 * `invalid` sections retract the element so the inert stylesheet defaults
 * take over again.
 */
export class BackgroundPresenter {
  /** The single style node this presenter owns. */
  private style: HTMLStyleElement | undefined

  /**
   * Write the section's variable rules (no-op without a document).
   * @param section - durable section (defaults already applied).
   */
  apply(section: BackgroundSettings): void {
    const css = backdropVarsCss(section)
    if (css === '') {
      this.dispose()
      return
    }
    if (this.style === undefined && typeof document !== 'undefined') {
      this.style = document.createElement('style')
      this.style.dataset.dshBackground = ''
      document.head.append(this.style)
    }
    if (this.style !== undefined) this.style.textContent = css
  }

  /** Retract the presenter-owned style element. */
  dispose(): void {
    this.style?.remove()
    this.style = undefined
  }
}

/**
 * Background preference owner. Reads go through {@link getBackground};
 * preference writes only through the four setters, each validating before the
 * scope write and emitting `background/change`; continuous sync only through
 * scope adoption. Uploads and the availability probe are plain fetches against
 * the Host route.
 */
export class BackgroundRuntime {
  private readonly ctx: Context
  private readonly host: SettingsScope<BackgroundSettings>
  private readonly presenter = new BackgroundPresenter()
  private section: BackgroundSettings = DEFAULT_BACKGROUND
  private revision = 0
  private snapshot: BackgroundSnapshot

  /**
   * @param ctx - owning context (change events are emitted on it; the scope
   * listener is released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the same plugin.
   */
  constructor(ctx: Context, host: SettingsScope<BackgroundSettings>) {
    this.ctx = ctx
    this.host = host
    this.snapshot = this.buildSnapshot()
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-background: settings scope adoption')
    this.adopt()
  }

  /**
   * Read the current immutable snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getBackground(): BackgroundSnapshot {
    return this.snapshot
  }

  /** Retract to no background. */
  setNone(): void {
    this.write({ preference: 'none' })
  }

  /**
   * Select a registered preset.
   * @param id - preset id from the fixed registry; unknown ids throw.
   */
  setPreset(id: string): void {
    if (!BACKGROUND_PRESETS.some(p => p.id === id)) {
      throw new Error(`background preset "${id}" is not registered`)
    }
    this.write({ preference: 'preset', preset: id })
  }

  /**
   * Select a stored image.
   * @param ref - reference returned by {@link uploadImage}.
   */
  setImage(ref: BackgroundImageRef): void {
    this.write({ preference: 'image', image: ref })
  }

  /**
   * Adjust the scrim strength.
   * @param value - percent, 0-90 (schema-validated at the settings boundary).
   */
  setDimming(value: number): void {
    this.write({ dimming: value })
  }

  /**
   * Upload one image and return its durable reference; the preference is left
   * untouched so the caller chains {@link setImage} on success.
   * @param file - browser file object; its type rides the Content-Type header.
   * @returns the stored reference on a 201 response.
   * @throws the response status on any non-201 answer.
   */
  async uploadImage(file: File): Promise<BackgroundImageRef> {
    const response = await fetch(BACKGROUND_UPLOAD_PATH, {
      method: 'POST',
      body: file,
      headers: { 'content-type': file.type },
    })
    if (!response.ok) throw new Error(`background upload failed: ${response.status}`)
    return await response.json() as BackgroundImageRef
  }

  /**
   * Probe whether the current stored image still resolves (dangling-reference
   * detection for the section's error banner).
   * @returns whether the current image route answers 2xx.
   */
  async probeImage(): Promise<boolean> {
    const response = await fetch(BACKDROP_IMAGE_URL, { method: 'HEAD' })
    return response.ok
  }

  /** Adopt the scope's accepted section without writing it back. */
  private adopt(): void {
    const value = this.host.getSnapshot().value
    if (value === undefined) return
    this.section = value
    this.publish()
  }

  /** Release the scope listener and the presenter-owned style element. */
  dispose(): void {
    this.presenter.dispose()
  }

  /** Write one patch's fields through the scope, then publish optimistically. */
  private write(patch: Partial<BackgroundSettings>): void {
    for (const [field, value] of Object.entries(patch)) void this.host.set(field, value)
    this.section = { ...this.section, ...patch }
    this.publish()
  }

  private buildSnapshot(): BackgroundSnapshot {
    return Object.freeze({
      section: this.section,
      backdrop: resolveBackdrop(this.section),
      revision: this.revision,
    })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.presenter.apply(this.section)
    this.ctx.emit('background/change', this.snapshot)
  }
}

/**
 * Required services: settings transport plus slots/locale for the Background
 * section. `remote` carries the forwarded settings invalidation that the
 * scope binder subscribes to on this context.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Client plugin body: provide the background service and register the
 * feature-owned Background settings section (a feature owns its settings
 * surface).
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const host = ctx.settingsScope.bind<BackgroundSettings>({ namespace: BACKGROUND_SETTINGS_NAMESPACE })
  const background = new BackgroundRuntime(ctx, host)
  ctx.provide('background', background)
  ctx.effect(() => () => background.dispose(), 'ui-background: service disposal')

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-background: settings section dictionaries')

  const store = createBackgroundSectionStore()
  let bound: BoundActions<typeof store> | undefined
  const sync = (snapshot: BackgroundSnapshot): void => {
    bound?.sync(snapshot.section, snapshot.backdrop, snapshot.revision)
  }
  ctx.on('background/change', sync)
  const injected = (actions: BoundActions<typeof store>): BackgroundSectionInjected => {
    bound = actions
    // Re-sync from the getter so no event is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync(background.getBackground())
    return {
      setNone: () => { background.setNone() },
      setPreset: (id) => { background.setPreset(id) },
      uploadImage: async (file) => {
        const ref = await background.uploadImage(file)
        background.setImage(ref)
      },
      setDimming: (value) => { background.setDimming(value) },
      probeImage: () => background.probeImage(),
    }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'background',
    order: 5,
    label: () => ctx.locale.bind(SETTINGS_NS)('nav'),
    locale: SETTINGS_NS,
    store,
    inject: injected,
  }, BackgroundSection))
}
```

This file imports three modules that do not exist yet (`./BackgroundSection.tsx`, `./settings-store.ts`, `./locales.ts`). Create them now as minimal placeholders **is not allowed** — instead build them in this task as their real minimal versions:

`src/client/settings-store.ts`:

```ts ignore-check
/**
 * Background section slot store: a mirror of the background service snapshot.
 * The plugin's apply-world change listener is the only writer; the section
 * component reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_BACKGROUND, type BackdropResolution, type BackgroundSettings,
} from '../background-settings.ts'

/** Store state mirrored from the background snapshot. */
export interface BackgroundSectionState {
  /** Durable section as last published. */
  section: BackgroundSettings
  /** Resolution for the section (drives the invalid banner). */
  backdrop: BackdropResolution
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type BackgroundSectionActions = {
  sync: (
    draft: BackgroundSectionState,
    section: BackgroundSettings,
    backdrop: BackdropResolution,
    revision: number,
  ) => void
}

/**
 * Declares the Background section state and write surface.
 * @returns the store handle.
 */
export function createBackgroundSectionStore(): EngineStoreHandle<BackgroundSectionState, BackgroundSectionActions> {
  return defineStore({
    init: (): BackgroundSectionState => ({ section: DEFAULT_BACKGROUND, backdrop: { kind: 'none' }, revision: -1 }),
    actions: {
      sync: (d, section, backdrop, revision) => {
        if (revision <= d.revision) return
        d.section = section
        d.backdrop = backdrop
        d.revision = revision
      },
    },
  })
}
```

`src/client/locales.ts`:

```ts ignore-check
/** `settings.background` namespace dictionaries (the Background section's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '背景',
  'title': '背景',
  'kind.none': '无',
  'kind.preset': '预设',
  'kind.image': '图片',
  'preset.aurora': '极光',
  'preset.dusk': '暮色',
  'preset.mist': '雾',
  'upload': '上传图片',
  'uploading': '上传中…',
  'remove': '移除图片',
  'dimming': '遮罩浓度',
  'imageUnavailable': '背景图片已不可用，请重新上传。',
  'invalid.unknownPreset': '所选预设不存在，请重新选择。',
  'invalid.missingImageRef': '图片引用缺失，请重新上传。',
} satisfies Record<string, string>

/** The settings.background namespace key union. */
export type BackgroundKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Background',
  'title': 'Background',
  'kind.none': 'None',
  'kind.preset': 'Presets',
  'kind.image': 'Image',
  'preset.aurora': 'Aurora',
  'preset.dusk': 'Dusk',
  'preset.mist': 'Mist',
  'upload': 'Upload image',
  'uploading': 'Uploading…',
  'remove': 'Remove image',
  'dimming': 'Dimming',
  'imageUnavailable': 'The background image is no longer available; upload it again.',
  'invalid.unknownPreset': 'The selected preset does not exist; choose again.',
  'invalid.missingImageRef': 'The image reference is missing; upload again.',
} satisfies Record<BackgroundKey, string>
```

`src/client/BackgroundSection.tsx` (full component; its dedicated spec lands in Task 7):

```tsx ignore-check
/**
 * Background settings section: preference cards (none / presets / image),
 * split-swatch preset thumbnails, image upload with auto-select, and the
 * dimming slider. Thumbnails paint both palette modes as one split swatch —
 * a preset's values are per-mode, and the picker must not depend on the live
 * scheme. Registered by this package — the background feature owns its own
 * settings surface.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { BACKDROP_IMAGE_URL, BACKGROUND_PRESETS } from '../background-settings.ts'
import type { BackgroundKey } from './locales.ts'
import type { createBackgroundSectionStore } from './settings-store.ts'
import css from './BackgroundSection.module.css'

/** Injected business face: preference writes, the upload chain, and the probe. */
export interface BackgroundSectionInjected {
  /** Retract to no background. */
  setNone: () => void
  /** Select a registered preset id. */
  setPreset: (id: string) => void
  /** Upload one image and select it on success; rejects on failure. */
  uploadImage: (file: File) => Promise<void>
  /** Adjust the scrim strength (0-90). */
  setDimming: (value: number) => void
  /** Whether the current stored image still resolves. */
  probeImage: () => Promise<boolean>
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type BackgroundSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsStore<ReturnType<typeof createBackgroundSectionStore>>
  & PropsLocale<'settings.background'> & BackgroundSectionInjected

/** Invalid-reason → locale key (the closed union carries no display text). */
const INVALID_KEYS = {
  'unknown-preset': 'invalid.unknownPreset',
  'missing-image-ref': 'invalid.missingImageRef',
} as const satisfies Record<'unknown-preset' | 'missing-image-ref', BackgroundKey>

/**
 * Render the Background section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function BackgroundSection({
  t, useStore, setNone, setPreset, uploadImage, setDimming, probeImage,
}: BackgroundSectionComponentProps) {
  const section = useStore(s => s.section)
  const backdrop = useStore(s => s.backdrop)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [imageUnavailable, setImageUnavailable] = useState(false)
  const imageId = section.image?.attachmentId

  useEffect(() => {
    if (section.preference !== 'image') {
      setImageUnavailable(false)
      return
    }
    let cancelled = false
    probeImage().then(
      (available) => { if (!cancelled) setImageUnavailable(!available) },
      () => { if (!cancelled) setImageUnavailable(true) },
    )
    return () => { cancelled = true }
  }, [section.preference, imageId, probeImage])

  return (
    <div className={css.group}>
      <div className={css.title}>{t('title')}</div>
      {backdrop.kind === 'invalid' && (
        <div className={css.error} role="alert">{t(INVALID_KEYS[backdrop.reason])}</div>
      )}
      <div className={css.cards}>
        <button
          type="button"
          className={clsx(css.card, section.preference === 'none' && css.selected)}
          aria-pressed={section.preference === 'none'}
          onClick={() => { setNone() }}
        >
          {t('kind.none')}
        </button>
        <button
          type="button"
          className={clsx(css.card, section.preference === 'preset' && css.selected)}
          aria-pressed={section.preference === 'preset'}
          onClick={() => {
            const current = section.preset !== undefined && backdrop.kind === 'preset' ? section.preset : BACKGROUND_PRESETS[0]!.id
            setPreset(current)
          }}
        >
          {t('kind.preset')}
        </button>
        <button
          type="button"
          className={clsx(css.card, section.preference === 'image' && css.selected)}
          aria-pressed={section.preference === 'image'}
          onClick={() => { fileRef.current?.click() }}
        >
          {t('kind.image')}
        </button>
      </div>
      {section.preference === 'preset' && (
        <div className={css.presets} role="radiogroup" aria-label={t('kind.preset')}>
          {BACKGROUND_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={section.preset === preset.id}
              className={clsx(css.swatch, section.preset === preset.id && css.selected)}
              style={{
                background: `linear-gradient(to bottom, ${preset.css.light} 0 50%, ${preset.css.dark} 50% 100%)`,
              }}
              onClick={() => { setPreset(preset.id) }}
            >
              {t(`preset.${preset.id}` as BackgroundKey)}
            </button>
          ))}
        </div>
      )}
      {(section.preference === 'image' || section.image !== undefined) && (
        <div className={css.imageRow}>
          {section.image !== undefined && (
            <div
              className={css.preview}
              style={{ backgroundImage: `url("${BACKDROP_IMAGE_URL}")` }}
              aria-label={t('kind.image')}
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className={css.fileInput}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file === undefined) return
              setBusy(true)
              setUploadError(null)
              uploadImage(file)
                .catch((error: unknown) => { setUploadError(error instanceof Error ? error.message : String(error)) })
                .finally(() => { setBusy(false) })
            }}
          />
          <button type="button" className={css.action} disabled={busy} onClick={() => { fileRef.current?.click() }}>
            {busy ? t('uploading') : t('upload')}
          </button>
          {section.image !== undefined && (
            <button type="button" className={css.action} onClick={() => { setNone() }}>{t('remove')}</button>
          )}
          {uploadError !== null && <span className={css.error} role="alert">{uploadError}</span>}
          {imageUnavailable && <span className={css.error} role="alert">{t('imageUnavailable')}</span>}
        </div>
      )}
      <label className={css.dimming}>
        <span>{t('dimming')}</span>
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={section.dimming}
          onChange={(event) => { setDimming(Number(event.currentTarget.value)) }}
        />
      </label>
    </div>
  )
}
```

`src/client/BackgroundSection.module.css` (token idioms from `AppearanceRow.module.css`):

```css
/* Background settings section: preference cards, split-swatch presets, image
 * row, dimming slider. */

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
}

.title {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.cards {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.card {
  box-sizing: border-box;
  flex: 1 1 120px;
  padding: 12px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.card:hover:not(.selected) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.selected {
  background: var(--dsw-alias-bg-module-platform);
  border-color: var(--dsw-static-neutral-bluish-400);
}

.presets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Split swatch: the preset's light value above, dark below — the picker shows
 * both palette modes without depending on the live scheme. */
.swatch {
  box-sizing: border-box;
  width: 132px;
  height: 72px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-shadow: 0 0 4px var(--dsw-alias-bg-overlay);
}

.swatch.selected {
  border-color: var(--dsw-static-neutral-bluish-400);
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.imageRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview {
  width: 132px;
  height: 72px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background-size: cover;
  background-position: center;
}

.fileInput {
  display: none;
}

.action {
  padding: 6px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.action:disabled {
  opacity: 0.5;
  cursor: default;
}

.error {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}

.dimming {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

.dimming input {
  flex: 1;
  accent-color: var(--dsw-alias-brand-primary);
}
```

- [ ] **Step 4: Run the spec**

Run: `pnpm exec vitest run packages/client/ui-background/tests/background.client.spec.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/client/ui-background/src/client
git commit -m "feat(client/ui-background): background service, presenter, section, and copy"
```

---

### Task 6: Section store and apply wiring specs

**Files:**
- Test: `packages/client/ui-background/tests/settings-store.client.spec.ts`, `packages/client/ui-background/tests/apply.client.spec.ts`

- [ ] **Step 1: Write `tests/settings-store.client.spec.ts`** (store idiom from `packages/client/ui-theme/tests/settings-store.client.spec.ts`)

```ts ignore-check
/** Section store: init shape, mirrored sync, and the stale-revision guard. */
import { describe, expect, it } from 'vitest'
import { createBackgroundSectionStore } from '../src/client/settings-store.ts'
import { DEFAULT_BACKGROUND } from '../src/background-settings.ts'

describe('createBackgroundSectionStore', () => {
  it('starts at the default section with revision -1', () => {
    const store = createBackgroundSectionStore().create()
    expect(store.getSnapshot()).toEqual({
      section: DEFAULT_BACKGROUND,
      backdrop: { kind: 'none' },
      revision: -1,
    })
  })

  it('mirrors sync writes and drops stale revisions', () => {
    const store = createBackgroundSectionStore().create()
    store.actions.sync({ preference: 'preset', preset: 'mist', dimming: 45 }, { kind: 'preset', css: { light: 'a', dark: 'b' } }, 3)
    expect(store.getSnapshot().section.preference).toBe('preset')
    store.actions.sync(DEFAULT_BACKGROUND, { kind: 'none' }, 3)
    expect(store.getSnapshot().section.preference).toBe('preset')
    store.actions.sync(DEFAULT_BACKGROUND, { kind: 'none' }, 4)
    expect(store.getSnapshot().backdrop).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Write `tests/apply.client.spec.ts`** (bench idiom copied from `packages/client/ui-theme/tests/apply.client.spec.ts`, adapted to the section slot)

```ts ignore-check
/** ui-background apply wiring: service provision, settings dictionaries riding
 * the locale service, section registration into settings.section, snapshot
 * projection into the section store, and HMR collapse recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject, SETTINGS_NS } from '../src/client/index.ts'
import { BackgroundSection } from '../src/client/BackgroundSection.tsx'
import { BackgroundSettingsSchema, BACKGROUND_SETTINGS_NAMESPACE, type BackgroundSettings } from '../src/background-settings.ts'

usePinnedBrowserLanguages('zh-CN')

const SLOT = 'settings.section'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  let section: BackgroundSettings | undefined
  const namespace = () => ({
    ns: BACKGROUND_SETTINGS_NAMESPACE,
    schema: BackgroundSettingsSchema.toJSON(),
    value: section ?? { preference: 'none', dimming: 45 },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  })
  const describe = vi.fn(() => Promise.resolve({
    rpcId: 'background-describe' as never,
    result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [namespace()] } },
  }))
  const mutate = vi.fn(() => Promise.resolve({
    rpcId: 'background-mutate' as never,
    result: { ok: true as const, value: namespace() },
  }))
  ctx.provide('connection', { api: { settings: { describe, mutate } }, isLoopback: true } as never)
  new TestRemote(ctx)
  await ctx.plugin(SettingsScopeBinder).await()
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, locale, describe, mutate,
    setHostSection: (next: BackgroundSettings) => { section = next },
  }
}

/** Stand in for the settings shell: declare the section list slot from root. */
function declareSections(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

describe('ui-background apply', () => {
  it('declares the slot and locale services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('provides the service, registers localized copy, and registers the section', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.locale.bind(SETTINGS_NS)('nav')).toBe('背景')
    b.locale.setLocale('en')
    expect(b.locale.bind(SETTINGS_NS)('nav')).toBe('Background')
    const entry = b.slots.entries(SLOT).find(e => e.component === BackgroundSection)!
    expect(entry.options).toMatchObject({ id: 'background', order: 5 })
    expect(entry.locale).toBe(SETTINGS_NS)
  })

  it('routes face writes back through the service', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries(SLOT).find(e => e.component === BackgroundSection)!
    const handle = entry.store as ReturnType<typeof import('../src/client/settings-store.ts').createBackgroundSectionStore>
    const instance = handle.create()
    const face = (entry.inject as unknown as (a: typeof instance.actions) => import('../src/client/BackgroundSection.tsx').BackgroundSectionInjected)(instance.actions)
    await face.uploadImage(new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' })).catch(() => {})
    // fetch is absent in this lane for the upload path; drive a direct write instead.
    face.setPreset('aurora')
    expect(b.mutate).toHaveBeenCalled()
    face.setDimming(70)
    expect(instance.getSnapshot().section.dimming).toBe(70)
  })

  it('recovers after an HMR collapse of the declaring entry', async () => {
    const b = await bench()
    const host = declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    host()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    declareSections(b.slots)
    await Promise.resolve()
    expect(b.slots.entries(SLOT).some(e => e.component === BackgroundSection)).toBe(true)
  })

  it('teardown removes the section and the dictionaries', async () => {
    const b = await bench()
    declareSections(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    expect(b.locale.bind(SETTINGS_NS)('nav')).toBe('nav')
  })
})
```

Note: the `uploadImage` catch in the third test exists because plain node lane has no `fetch` to stub here; the upload path itself is covered in `background.client.spec.ts` (Task 5). If `fetch` exists in the lane and the call rejects, the catch keeps the test focused on the direct writes.

- [ ] **Step 3: Run both specs**

Run: `pnpm exec vitest run packages/client/ui-background/tests/settings-store.client.spec.ts packages/client/ui-background/tests/apply.client.spec.ts`
Expected: all passed.

- [ ] **Step 4: Commit**

```bash
git add packages/client/ui-background/tests/settings-store.client.spec.ts packages/client/ui-background/tests/apply.client.spec.ts
git commit -m "test(client/ui-background): section store and apply wiring specs"
```

---

### Task 7: Section component spec

**Files:**
- Test: `packages/client/ui-background/tests/BackgroundSection.client.spec.tsx`

- [ ] **Step 1: Write the spec** (mount harness mirrored from `packages/client/ui-theme/tests/appearance-row.client.spec.tsx`)

```tsx ignore-check
// @vitest-environment jsdom
/** BackgroundSection behavior: preference cards drive the injected face,
 * preset swatches select ids, upload chains through the face, and invalid
 * snapshots render the error banner. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { BackgroundSection } from '../src/client/BackgroundSection.tsx'
import { createBackgroundSectionStore } from '../src/client/settings-store.ts'
import { DEFAULT_BACKGROUND, type BackgroundSettings } from '../src/background-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'nav': 'Background',
  'title': 'Background',
  'kind.none': 'None',
  'kind.preset': 'Presets',
  'kind.image': 'Image',
  'preset.aurora': 'Aurora',
  'preset.dusk': 'Dusk',
  'preset.mist': 'Mist',
  'upload': 'Upload image',
  'uploading': 'Uploading…',
  'remove': 'Remove image',
  'dimming': 'Dimming',
  'imageUnavailable': 'The background image is no longer available; upload it again.',
  'invalid.unknownPreset': 'The selected preset does not exist; choose again.',
  'invalid.missingImageRef': 'The image reference is missing; upload again.',
}

function mountSection(section: BackgroundSettings, backdrop = { kind: 'none' } as const) {
  const store = createBackgroundSectionStore().create()
  store.actions.sync(section, backdrop, 0)
  const face = {
    setNone: vi.fn(),
    setPreset: vi.fn(),
    uploadImage: vi.fn(() => Promise.resolve()),
    setDimming: vi.fn(),
    probeImage: vi.fn(() => Promise.resolve(true)),
  }
  const useStore = (selector: (state: typeof store extends { getSnapshot(): infer S } ? S : never) => unknown) =>
    useSyncExternalStore(
      (onChange) => store.subscribe(onChange),
      () => selector(store.getSnapshot()),
    )
  render(
    <BackgroundSection
      {...({} as never)}
      t={(key: string) => COPY[key] ?? key}
      useStore={useStore as never}
      {...face}
    />,
  )
  return face
}

describe('BackgroundSection', () => {
  it('drives the none card and a preset swatch through the face', () => {
    const face = mountSection({ preference: 'none', dimming: 45 })
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))
    expect(face.setPreset).toHaveBeenCalledWith('aurora')

    const section: BackgroundSettings = { preference: 'preset', preset: 'mist', dimming: 45 }
    const presetFace = mountSection(section, { kind: 'preset', css: { light: 'a', dark: 'b' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk' }))
    expect(presetFace.setPreset).toHaveBeenCalledWith('dusk')
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(presetFace.setNone).toHaveBeenCalled()
  })

  it('uploads through the file input and surfaces failures', async () => {
    const section: BackgroundSettings = {
      preference: 'image',
      image: { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 3, width: 2, height: 2 },
      dimming: 45,
    }
    const face = mountSection(section, { kind: 'image' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1])], 'bg.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => { expect(face.uploadImage).toHaveBeenCalledWith(file) })

    const failing = mountSection(section, { kind: 'image' })
    failing.uploadImage.mockRejectedValue(new Error('413'))
    const retryInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(retryInput, { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('413')
  })

  it('renders the invalid banner and drives the dimming slider', () => {
    const face = mountSection(
      { preference: 'preset', preset: 'gone', dimming: 45 },
      { kind: 'invalid', reason: 'unknown-preset' },
    )
    expect(screen.getByRole('alert')).toHaveTextContent('preset does not exist')
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '60' } })
    expect(face.setDimming).toHaveBeenCalledWith(60)
  })

  it('probes availability while an image stands', async () => {
    const section: BackgroundSettings = {
      preference: 'image',
      image: { attachmentId: `sha256:${'c'.repeat(64)}`, mediaType: 'image/png', bytes: 3, width: 2, height: 2 },
      dimming: DEFAULT_BACKGROUND.dimming,
    }
    mountSection(section, { kind: 'image' })
    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert')
      expect(alerts).toHaveLength(0)
    })
  })
})
```

If `store.subscribe`'s signature differs from `(onChange) => () => void`, adapt the `useStore` binding to the real `EngineStoreHandle` API shown in `packages/client/ui-theme/tests/appearance-row.client.spec.tsx` (the sanctioned zero-machinery path is `createBackgroundSectionStore().create()` plus `store.actions.sync(...)`; the selector hook can also be lifted from that file's mount helper).

Two branch-covering cases added during Task 5 review (the per-file 100% branch gate needs them; the plan's original four cases cannot reach them):

- **Pending upload** — `mountSection(section, { kind: 'image' })` with `face.uploadImage.mockImplementation(() => new Promise(() => {}))`; after firing change on the file input, assert the upload button renders `COPY['uploading']` (the `busy` arm).
- **Unavailable banner** — `mountSection(section, { kind: 'image' })` with `face.probeImage.mockResolvedValue(false)`; `await screen.findByRole('alert')` has text `COPY['imageUnavailable']` (the corrected inversion: `available=false` shows the banner; `available=true` hides it — the existing fourth case already pins the hidden arm).
- **Probe rejection** — `face.probeImage.mockRejectedValue(new Error('net down'))`; `await screen.findByRole('alert')` has text `COPY['imageUnavailable']` (the rejection handler arm of the race-guarded effect).
- **Stale probe cannot overwrite a newer verdict** — `mountSection` with `face.probeImage.mockImplementationOnce(() => new Promise<boolean>(() => {}))` (first probe stays pending), then re-sync the same store with a section whose `image.attachmentId` differs and let the second probe resolve `false` (banner shows); then resolve the first probe's promise with `true` and assert the banner is still shown (the `!cancelled` guard arm). If the mount harness makes deferred control awkward, assert the same invariant by unmounting before resolving the pending probe and verifying no state write surfaces (react 18 no-ops it) — pick the form that genuinely executes the `if (!cancelled)` false arm.

- [ ] **Step 2: Run the spec**

Run: `pnpm exec vitest run packages/client/ui-background/tests/BackgroundSection.client.spec.tsx`
Expected: 13 passed (base 4 + review amendments + branch-forcing cases landed in execution; the shipped file has 13).

- [ ] **Step 3: Commit**

```bash
git add packages/client/ui-background/tests/BackgroundSection.client.spec.tsx
git commit -m "test(client/ui-background): background section component spec"
```

---

### Task 8: Layout backdrop layers and paint sites

**Files:**
- Modify: `packages/client/ui-layout/src/client/AppFrame.tsx`, `packages/client/ui-layout/src/client/AppFrame.module.css`, `packages/client/web/src/base.css`, `packages/client/web/src/AppRoot.module.css`
- Create: `packages/client/ui-layout/tests/backdrop-layers.client.spec.tsx`

- [ ] **Step 1: Write the failing spec** — `packages/client/ui-layout/tests/backdrop-layers.client.spec.tsx` (AppFrame mount with the minimal four-share stubs; CSS-contract assertions read the stylesheets from disk, the idiom of `packages/client/ui-theme/tests/scrollbar-styles.client.spec.ts`)

```tsx ignore-check
// @vitest-environment jsdom
/** Backdrop layers: AppFrame renders the two inert layers, and the layout and
 * shell stylesheets consume the three --dsw-specific-backdrop-* variables
 * with inert fallbacks. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AppFrame } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx'

afterEach(cleanup)

function mountFrame() {
  render(
    <AppFrame
      {...({
        useStore: () => ({ sidebar: 240, details: 0, narrowExpanded: false, narrow: false }),
        useSessions: () => undefined,
        actions: { setSidebar: () => {}, setDetails: () => {}, closeDetails: () => {}, setNarrow: () => {}, toggleSidebar: () => {} },
        renderSlot: () => null,
      } as never)}
    />,
  )
}

describe('backdrop layers', () => {
  it('renders the inert backdrop and scrim layers behind the columns', () => {
    mountFrame()
    const frame = document.querySelector('[class*="frame"]') as HTMLElement
    expect(frame.querySelector('[class*="backdrop"]')).not.toBeNull()
    expect(frame.querySelector('[class*="scrim"]')).not.toBeNull()
  })
})

describe('backdrop stylesheet contract', () => {
  const here = fileURLToPath(new URL('../src/client', import.meta.url))

  it('AppFrame consumes the surface var and both layer vars with fallbacks', () => {
    const css = readFileSync(`${here}/AppFrame.module.css`, 'utf8')
    expect(css).toContain('background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))')
    expect(css).toContain('background-image: var(--dsw-specific-backdrop-image, none)')
    expect(css).toContain('background: var(--dsw-specific-backdrop-scrim, transparent)')
    expect(css).toContain('pointer-events: none')
  })

  it('the shell body and boot page repaint through the surface var', () => {
    const base = readFileSync(fileURLToPath(new URL('../../web/src/base.css', import.meta.url)), 'utf8')
    expect(base).toContain('background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base))')
    const boot = readFileSync(fileURLToPath(new URL('../../web/src/AppRoot.module.css', import.meta.url)), 'utf8')
    expect(boot).toContain('background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base, #f9fafb))')
  })
})
```

Adapt the `useStore` stub's state fields to the real `createLayoutStore` init shape (read `packages/client/ui-layout/src/client/stores.ts` first; the existing `tests/app-frame.client.spec.tsx` mounts with a real store instance — prefer that sanctioned path: `createLayoutStore().create()` and pass its snapshot through).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client/ui-layout/tests/backdrop-layers.client.spec.tsx`
Expected: FAIL — layers missing, CSS assertions miss.

- [ ] **Step 3: Edit `AppFrame.tsx`** — in the returned JSX, add the layers as the first children inside the `css.frame` div, before `<div className={css.sidebarCol}>`:

```tsx ignore-check
      {/* Inert backdrop layers: painted only while the background plugin's
          body variables stand; below every column, never interactive. */}
      <div className={css.backdrop} aria-hidden="true" />
      <div className={css.scrim} aria-hidden="true" />
```

- [ ] **Step 4: Edit `AppFrame.module.css`** — change `.frame`'s background and append the layer rules:

```css
.frame {
  position: relative; /* anchors the drag handles, which straddle column borders */
  display: grid;
  grid-template-rows: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base));
  /* Collapse/expand animates the tracks on the deepsuite sider curve
     (--ds-ease-in-out / --ds-transition-duration-slow, ui-theme base.css). */
  transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}

/* Backdrop layers sit at the bottom of the frame's paint order: the ui-background
   plugin sets the body variables; unset variables keep both layers inert. The
   frame root goes transparent through the same variables while a backdrop is
   active, so negative z-index still paints above body's own background. */
.backdrop {
  position: absolute;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background-image: var(--dsw-specific-backdrop-image, none);
  background-size: cover;
  background-position: center;
}

.scrim {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--dsw-specific-backdrop-scrim, transparent);
}
```

(Keep the rest of `.frame`'s rules — `[data-dragging]`, reduced-motion, handles — exactly as they are.)

- [ ] **Step 5: Edit `packages/client/web/src/base.css`** — body rule:

```css
body {
  font-family: var(--dsw-font-family);
  /* Grayscale antialiasing over subpixel rendering: WebKit/Blink and the
     Firefox macOS equivalent; other engines ignore both lines. */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--dsw-alias-label-primary);
  /* Transparent while a backdrop is active (ui-background body variables);
     the flat base token otherwise. */
  background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base));
}
```

- [ ] **Step 6: Edit `packages/client/web/src/AppRoot.module.css`** — the `.boot` rule's background line becomes:

```css
  background: var(--dsw-specific-backdrop-surface, var(--dsw-alias-bg-base, #f9fafb));
```

- [ ] **Step 7: Run the new spec and the existing layout suite**

Run: `pnpm exec vitest run packages/client/ui-layout/tests/backdrop-layers.client.spec.tsx && pnpm exec vitest run packages/client/ui-layout/tests/app-frame.client.spec.tsx`
Expected: all passed (the existing suite proves the layers did not disturb the frame's behavior).

- [ ] **Step 8: Commit**

```bash
git add packages/client/ui-layout/src/client/AppFrame.tsx packages/client/ui-layout/src/client/AppFrame.module.css packages/client/ui-layout/tests/backdrop-layers.client.spec.tsx packages/client/web/src/base.css packages/client/web/src/AppRoot.module.css
git commit -m "feat(client/ui-layout): inert backdrop layers consuming the background variables"
```

---

### Task 9: Composition wiring (bundle, boot table, module roster)

**Files:**
- Modify: `packages/bundle/web-app/package.json`, `packages/bundle/web-app/cordis.patch.yml`, `apps/web/tests/assembled-boot.ts`

- [ ] **Step 1: Add the dependency** — in `packages/bundle/web-app/package.json` `dependencies`, after `"@deepseek-ai/dsh-client-ui-agent-preset"`:

```json
    "@deepseek-ai/dsh-client-ui-agent-preset": "workspace:^",
    "@deepseek-ai/dsh-client-ui-background": "workspace:^",
```

- [ ] **Step 2: Add the roster row** — in `packages/bundle/web-app/cordis.patch.yml`, after the `ui-theme` entry (line ~175). NOTE (Task 4 amendment): the Host half's `apply(ctx, config)` takes `trustedHosts` (validated at load; default `[]` = loopback-only), mirroring the `connection` row — inject `webRuntime` and pass the same expression:

```yaml
    # User-configurable background: durable none/preset/image preference over
    # the attachments store, /backgrounds upload-and-serve route (fenced by the
    # connection trust module), boot backdrop style, and the Background
    # settings section.
    - id: ui-background
      name: '@deepseek-ai/dsh-client-ui-background'
      inject: [webRuntime]
      config:
        trustedHosts: !!js ctx.webRuntime.trustedHosts
```

- [ ] **Step 3: Add the assembled-boot module row** — in `apps/web/tests/assembled-boot.ts`, after the `ui-theme` row (line ~28):

```ts ignore-check
  { id: '@deepseek-ai/dsh-client-ui-background', bundlePath: 'packages/client/ui-background/lib/client.js', url: '/plugins/ui-background.js', rev: 'fx', inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-api-remotes'], immediately: true },
```

- [ ] **Step 4: Install, build, and run the assembled boot smoke**

Run: `pnpm install --ignore-scripts && pnpm run build && pnpm exec vitest run apps/web/tests/built-boot.snapshot.ts --config vitest.web.config.ts`
Expected: pass. If the built-boot golden pins the module roster or injected CSS tags and now diffs, inspect the diff — it should show exactly the new `ui-background` row/CSS tag; refresh the golden the way the lane documents (`DSH_SNAPSHOT=record` or the lane's refresh flow in `apps/web/tests/README.md`) and review the diff.

- [ ] **Step 5: Verify the config gate**

Run: `pnpm run verify-cordis-config`
Expected: pass (the raw plugin name appears in the resolver manifest via the bundle dependency).

- [ ] **Step 6: Commit**

```bash
git add packages/bundle/web-app/package.json packages/bundle/web-app/cordis.patch.yml apps/web/tests/assembled-boot.ts pnpm-lock.yaml
git commit -m "feat(bundle/web-app): compose the ui-background plugin"
```

---

### Task 10: Chromium e2e journey (the product-user-visible snapshot)

**Files:**
- Create: `apps/web/tests/background-settings.e2e.ts` (+ golden dir `apps/web/tests/snapshots/background-settings/`)
- Modify (Task 9 review amendment): the 11 settings-dialog goldens under `apps/web/tests/snapshots/` that pin the settings nav now include the 背景 section — they must be REFRESHED by the lane's refresh flow in this same task: `settings-chrome/dialog.expected.md`, `plugin-config/section.expected.md`, `agent-preset-authoring/{section,created,damaged}.expected.md`, `models-settings/{empty,configured,declared,declared-edit}.expected.md`, `onboarding-usable-provider/dismissed.expected.md`, `onboarding-deepseek-config/models.expected.md`. Review each diff — it must be exactly the inserted nav block (`button "背景"`) and nothing else.

- [ ] **Step 0: Browser availability.** Run `pnpm exec playwright install chromium` (the lane's pinned version). If the download fails even after one unchanged retry with host escalation, STOP and report BLOCKED with the exact failure output — the lane cannot capture or refresh goldens without the browser, and CI's replay gate would red-light this stack; the controller will escalate to the user for a browser-capable environment.

- [ ] **Step 1: Read the lane's helpers before writing** — `apps/web/tests/cold-blank-session.e2e.ts` (full file) and `apps/web/tests/scaffold.ts` exports (`launchWebScaffold`, `webSnapshotMode`, `captureStableAria`, `compareOrRefreshGolden`), plus `apps/web/tests/support.ts` (`newEnglishPage`). The scenario below follows their exact call shapes; if a signature differs, adapt to what those files show.

- [ ] **Step 2: Write `apps/web/tests/background-settings.e2e.ts`**

```ts ignore-check
/** Background settings journey: opening Settings → Background, selecting a
 * preset paints the backdrop behind the conversation, the dimming slider
 * changes the scrim live, and None retracts to the flat page. The web lane's
 * golden pins the stable aria of the section page. */

import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/background-settings', import.meta.url))
const SECTION_EXPECTED = join(SNAPSHOT_DIR, 'section.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: background settings journey', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await saveFailureShot(page, 'background-settings')
    await tripwire.conclude()
    await browser.close()
    await scaffold.close()
  })

  it('selects a preset, dims, and retracts', async () => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Background' }).click()
    await page.getByRole('radio', { name: 'Aurora' }).click()

    const paint = await page.evaluate(() => {
      const backdrop = document.querySelector('[class*="backdrop"]') as HTMLElement | null
      const scrim = document.querySelector('[class*="scrim"]') as HTMLElement | null
      return {
        image: getComputedStyle(backdrop!).backgroundImage,
        scrimColor: getComputedStyle(scrim!).backgroundColor,
      }
    })
    expect(paint.image).toContain('linear-gradient')
    expect(paint.scrimColor).not.toBe('rgba(0, 0, 0, 0)')

    await compareOrRefreshGolden(SECTION_EXPECTED, await captureStableAria(page))

    const slider = page.getByRole('slider')
    await slider.fill('80')
    const dimmed = await page.evaluate(() => {
      const scrim = document.querySelector('[class*="scrim"]') as HTMLElement
      return getComputedStyle(scrim).backgroundColor
    })
    expect(dimmed).not.toBe(paint.scrimColor)

    await page.getByRole('button', { name: 'None' }).click()
    await page.evaluate(() => {
      const style = document.querySelector('style[data-dsh-background]')
      if (style !== null) throw new Error('background style must retract on none')
    })
  })
})
```

- [ ] **Step 3: Record/verify the golden**

Run: `pnpm exec vitest run apps/web/tests/background-settings.e2e.ts --config vitest.web.config.ts`
Expected: in replay mode the assertions pass and the golden comparison either passes or reports a missing golden; record with the lane's record mode (`DSH_SNAPSHOT=record`, per `apps/web/tests/README.md`), commit the golden, then rerun in replay mode and see it pass. Review the golden diff — it must contain only the Background section aria.

- [ ] **Step 3b: Refresh the 11 settings-dialog goldens (Task 9 amendment).** With the browser working, refresh the goldens that pin the settings nav (list in the Files section above): run the lane in refresh mode (`DSH_SNAPSHOT=refresh pnpm run test:web` per the lane docs, or the scoped equivalent), then `git diff` each of the 11 files and confirm every diff is exactly the inserted nav block (`button "背景"`). Then re-run the affected scenarios in replay mode and see them pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/background-settings.e2e.ts apps/web/tests/snapshots/background-settings apps/web/tests/snapshots/settings-chrome apps/web/tests/snapshots/plugin-config apps/web/tests/snapshots/agent-preset-authoring apps/web/tests/snapshots/models-settings apps/web/tests/snapshots/onboarding-usable-provider apps/web/tests/snapshots/onboarding-deepseek-config
git commit -m "test(web): background settings e2e journey with goldens"
```

---

### Task 11: Package docs, spec amendments, and gates

**Files:**
- Create: `packages/client/ui-background/README.md`, `README.zh.md`, `README.i18n.yaml`
- Modify: `.agents/notes/proposed/feature/2026-08-15-web-client-background.md`, `.agents/notes/proposed/feature/2026-08-15-web-client-background.zh.md`, `.agents/notes/proposed/feature/2026-08-15-web-client-background.i18n.yaml`
- Modify: `scripts/verify-package-readme-model-experience.ts` (plan amendment, found in Task 1 review: the short Model Experience form requires an audited row for the package)

- [ ] **Step 1: Write `README.md`** (headings mirror `packages/client/ui-theme/README.md`; the invariants gate checks package READMEs)

```markdown
# @deepseek-ai/dsh-client-ui-background

English | [中文](README.zh.md)

Background plugin: the durable none / built-in preset / one uploaded image preference for the Web client. The Host half registers the `ui-background` settings namespace, serves `/backgrounds` (POST admission through the attachments store's image policy, GET the current image with ETag revalidation), and injects the backdrop body variables into the index HTML so the first paint already carries the background. The browser half provides `ctx.background` (`BackgroundRuntime`): validated preference writes through the Host settings scope, immutable `BackgroundSnapshot`s on the `background/change` event, raw-byte uploads, and the Background settings section. Presentation is three body-level CSS variables (`--dsw-specific-backdrop-image/-scrim/-surface`); `ui-layout` renders the inert layers that consume them and stays correct without this plugin.

Upload admission reuses `ctx.attachments.imageLimits` (media types, byte cap), so one deployment policy governs chat images and backgrounds. Stored images are content-addressed objects in the attachments store; settings hold only the reference. The scrim resolves `color-mix()` against `--dsw-alias-bg-base`, so it follows light/dark without extra state, and presets ship both palette modes as one `body` + `body[data-ds-dark-theme]` rule pair.

## Model Experience

None, as the service manages a browser preference; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Replaced images are not garbage-collected; orphaned store objects accumulate, bounded by the upload size cap.
- `POST /backgrounds` fences writes with `sec-fetch-site`; it does not carry the `/api` bridge's full trust fence.
- URL-pasted images, per-workspace backgrounds, animated backgrounds, and sidebar translucency are out of scope by design.
```

- [ ] **Step 2: Write `README.zh.md`** as a faithful translation of the above (language switcher line: `[English](README.md) | 中文`).

- [ ] **Step 2b: Register the package's Model Experience audit row.** In `scripts/verify-package-readme-model-experience.ts`, add to the `SENTENCE_MODEL_EXPERIENCE` map (mirroring the `packages/client/ui-theme` row's shape, next to the other client-ui rows):

```ts ignore-check
  'packages/client/ui-background': { kind: 'none', reason: 'Browser-side UI plugin layer; registers nothing model-facing.' },
```

Match the entry shape the script actually declares (read the map's type first; `kind: 'none'` rows carry a `reason`). Include this file in the Step 8 commit.

- [ ] **Step 3: Record the README pair**

Run: `pnpm run verify-translation-pairing --write packages/client/ui-background/README.md`
Expected: `1 record(s) written`.

- [ ] **Step 4: Amend the spec note.** In `.agents/notes/proposed/feature/2026-08-15-web-client-background.md`, apply these edits (and mirror them in the `.zh.md`):

  1. In "Storage and upload route", replace the `GET /backgrounds/<id>` bullet with:

```markdown
- `GET /backgrounds/current` — serves the section's current image. The handler resolves the full reference from the settings section (`readImage` verifies mediaType/bytes/width/height, which a bare id cannot supply) and answers `ETag: "<attachmentId>"` with `Cache-Control: no-cache`: an unchanged reload revalidates to 304, a switch changes the ETag and re-fetches.
```

  2. In the same section, replace the `maxImageBytes` Config-field sentence with: admission reuses `ctx.attachments.imageLimits` (the deployment-resolved attachment policy) — no second knob.

  3. In "Rendering pipeline", replace the `BackgroundPresenter`-in-ui-layout sentence with: the presenter lives in `ui-background` and writes one presenter-owned `<style>` element; preset variants ride the `body` + `body[data-ds-dark-theme]` rule pair, so no theme subscription exists. `ui-layout` renders the two inert layers and consumes the variables — it never consumes the service.

  4. Add one line at the end of "Proposal": *Amended 2026-08-16 while planning: `/backgrounds/current` + ETag serving, presenter placement in ui-background, and imageLimits reuse — decided against the original `<id>` route, layout-side presenter, and plugin Config cap.*

- [ ] **Step 5: Re-record the note pair**

Run: `pnpm run verify-translation-pairing --write .agents/notes/proposed/feature/2026-08-15-web-client-background.md`
Expected: `1 record(s) written`.

- [ ] **Step 6: Run the doc gates**

Run: `pnpm run verify-agent-note-format && pnpm run verify-translation-pairing && pnpm run verify-doc-budgets`
Expected: all pass.

- [ ] **Step 7: Run the full evidence set for the touched surfaces** (per `.agents/skills/dsh-pre-push-checks/SKILL.md`; run what changed, not the whole suite):

```bash
pnpm exec vitest run packages/client/ui-background packages/client/ui-layout packages/client/web
pnpm run typecheck
pnpm run lint
pnpm run test:coverage
pnpm run doc-sync
pnpm run build && pnpm run test:web
pnpm run hygiene
```

Expected: every command passes. `test:coverage` enforces per-file 100% on the new `src/` files — if a branch is unreachable by design (e.g. the presenter's no-document guard), use the repo's `/* v8 ignore next */` idiom with a justification comment, as `ui-theme` does.

- [ ] **Step 8: Commit**

```bash
git add packages/client/ui-background/README.md packages/client/ui-background/README.zh.md packages/client/ui-background/README.i18n.yaml scripts/verify-package-readme-model-experience.ts .agents/notes/proposed/feature
git commit -m "docs: background package READMEs and spec amendments"
```

---

## Self-review record (already applied)

- **Spec coverage**: settings namespace (T4), upload route + serving (T4), boot injection (T3), service + event (T5), presets registry (T2), settings section UI incl. upload/dimming/remove/invalid banner/probe (T5, T7), layout layers + three paint sites (T8), persistence via settingsScope (T5–T6), snapshot coverage through the web e2e lane (T10), gates (T11). The spec's "url-pasted images / GC / animated / per-workspace" non-goals stay unimplemented.
- **Placeholders**: none; every step carries complete code or an exact edit. The two explicit adaptation notes (e2e helper signatures, layout store stub shape) name the file to mirror, not a gap.
- **Type consistency**: `BackgroundSettings`/`BackgroundImageRef`/`BackdropResolution` are defined once in `background-settings.ts` and imported everywhere; `BackgroundSectionInjected` matches between `BackgroundSection.tsx` and the apply `injected` factory; store action signature `sync(section, backdrop, revision)` matches both call sites.
