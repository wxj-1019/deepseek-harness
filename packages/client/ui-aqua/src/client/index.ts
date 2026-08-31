/**
 * Aqua client plugin body: the toggleable glassmorphism skin over the durable
 * `ui-aqua` section. {@link AquaRuntime} owns the preference (scope adoption,
 * optimistic writes, the wallpaper upload chain, the one-time migration from
 * the absorbed upstream's localStorage), applies/retracts the theme layer
 * through {@link AquaLayer}, and registers two settings surfaces:
 * - the master on/off card into the Plugins section (`settings.plugin.item`,
 *   same shape as the other plugin cards);
 * - every glass knob into the General section's Appearance row area
 *   (`settings.general.item`, right under 外观).
 * One click on the master switch returns the stock UI (every layer is an
 * effect, disposed on flip).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `settings.plugin.item` SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Type-only: pulls the `settings.general.item` SlotMap merge and the
// ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AquaPluginCard, type AquaPluginCardInjected } from './AquaPluginCard.tsx'
import { AquaAppearanceRow, type AquaAppearanceRowInjected } from './AquaAppearanceRow.tsx'
import { createAquaRowStore } from './settings-store.ts'
import { en, NS, zh } from './locales.ts'
import { AquaLayer } from './theme-layer.ts'
import { AquaRuntime, type AquaSnapshot } from './runtime.ts'
import { AQUA_SETTINGS_NAMESPACE, type AquaSection } from '../aqua-settings.ts'
// Side-effect imports: the theme-layer stylesheet (unloaded with the plugin)
// and the self-hosted Space Grotesk @font-face (no shell dependency).
import './aqua.module.css'
import './fonts.module.css'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

export type { AquaSnapshot } from './runtime.ts'
export { AquaRuntime } from './runtime.ts'
export type { AquaSettingsPayload } from './settings-store.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Aqua section changed (a validated write or an adopted Host acceptance).
     * @param snapshot - Current immutable section snapshot.
     * @mode emit
     */
    'aqua/change'(snapshot: AquaSnapshot): void
  }
}

/** Required services: theme override stack, settings transport, and the settings-card surfaces. */
export const inject = ['theme', 'slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Client plugin body.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-aqua: settings dictionaries')

  const host = ctx.settingsScope.bind<AquaSection>({
    namespace: AQUA_SETTINGS_NAMESPACE,
  })
  const layer = new AquaLayer(ctx)
  const runtime = new AquaRuntime(ctx, host, layer)

  // Two store mirrors of the same section state: one for the Plugins card
  // (master switch) and one for the General section's Appearance row (knobs).
  const pluginStore = createAquaRowStore()
  const appearanceStore = createAquaRowStore()
  let pluginBound: BoundActions<typeof pluginStore> | undefined
  let appearanceBound: BoundActions<typeof appearanceStore> | undefined
  const sync = (): void => {
    const payload = { ...runtime.getAqua().section, dark: layer.getDark() }
    pluginBound?.sync(payload, runtime.getAqua().revision)
    appearanceBound?.sync(payload, runtime.getAqua().revision)
  }
  // Every runtime publication reaches both stores; the Appearance switch
  // additionally re-syncs so the row re-renders with the brightness knob's
  // new half-range (the revision guard drops no-op duplicates).
  ctx.on('aqua/change', sync)
  ctx.effect(() => ctx.on('theme/change', () => { sync() }), 'ui-aqua: appearance scheme sync')

  const pluginInjected = (actions: BoundActions<typeof pluginStore>): AquaPluginCardInjected => {
    pluginBound = actions
    // Re-sync from the runtime so no flip is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync()
    return {
      setEnabled: (enabled) => {
        runtime.setEnabled(enabled)
      },
    }
  }
  const appearanceInjected = (actions: BoundActions<typeof appearanceStore>): AquaAppearanceRowInjected => {
    appearanceBound = actions
    sync()
    return {
      setMode: (mode) => {
        runtime.setMode(mode)
      },
      setBlur: (blur) => {
        runtime.setKnob('blur', blur)
      },
      setFrost: (frost) => {
        runtime.setKnob('frost', frost)
      },
      setFluidHue: (fluidHue) => {
        runtime.setKnob('fluidHue', fluidHue)
      },
      setFluidDepth: (fluidDepth) => {
        runtime.setKnob('fluidDepth', fluidDepth)
      },
      setBgBrightness: (bgBrightness) => {
        runtime.setKnob('bgBrightness', bgBrightness)
      },
      setBackground: (background) => {
        runtime.setBackground(background)
      },
      uploadWallpaper: async (file) => { await runtime.uploadWallpaper(file) },
      clearWallpaper: () => {
        runtime.clearWallpaper()
      },
      setWhale: (whale) => {
        runtime.setFlag('whale', whale)
      },
      setCritters: (critters) => {
        runtime.setFlag('critters', critters)
      },
      setMesh: (mesh) => {
        runtime.setFlag('mesh', mesh)
      },
      setSpotlight: (spotlight) => {
        runtime.setFlag('spotlight', spotlight)
      },
      setPress: (press) => {
        runtime.setFlag('press', press)
      },
      setWallpaperBlur: (wallpaperBlur) => {
        runtime.setKnob('wallpaperBlur', wallpaperBlur)
      },
      setWallpaperFrost: (wallpaperFrost) => {
        runtime.setKnob('wallpaperFrost', wallpaperFrost)
      },
      setVideoBlur: (videoBlur) => {
        runtime.setKnob('videoBlur', videoBlur)
      },
      setVideoBrightness: (videoBrightness) => {
        runtime.setKnob('videoBrightness', videoBrightness)
      },
    }
  }

  // Master switch card in the Plugins configurable tab, keyed by the settings
  // namespace it edits (the tab pairs served namespaces with card keys).
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: AQUA_SETTINGS_NAMESPACE,
    store: pluginStore,
    locale: NS,
    inject: pluginInjected,
  }, AquaPluginCard))

  // Glass knobs row in the General section, directly under Appearance (10).
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'aqua',
    order: 11,
    store: appearanceStore,
    locale: NS,
    inject: appearanceInjected,
  }, AquaAppearanceRow))
}
