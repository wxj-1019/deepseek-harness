/**
 * Vision-model routing: when a turn's step messages carry images, requests are
 * rerouted to the deployment-configured vision model; text-only turns keep the
 * session's own model. Routing rides the `agent/pre-step` and `agent/request`
 * waterfalls, so the loop logs the effective provider/model in
 * `request/header` and in each `assistant/message` source — routing never
 * mutates messages and stays reconstructable from the session log.
 *
 * The host image preflight and the `read_image` tool gate consult the
 * `visionRoute` service (declared by `@deepseek-ai/dsh-llm`) so an
 * image-bearing request is accepted and rerouted instead of refused while a
 * vision model is configured.
 * @module @deepseek-ai/dsh-llm-vision-route
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { contentHasImage } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, VisionRouteService } from '@deepseek-ai/dsh-llm'
// Type-only: pulls the settings service Context merge (ctx.settings).
import type {} from '@deepseek-ai/dsh-settings'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Deployment vision-model routing; absent until this plugin mounts. */
    visionRoute?: VisionRouteService
  }
}

/** Settings namespace carrying the deployment's vision-model route. */
export const VISION_MODEL_SETTINGS_NAMESPACE = 'vision-model'

/** Stored and composed vision-model routing configuration. */
export interface VisionModelSettings {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
}

/** Schema of the vision-model settings section. */
export const VISION_MODEL_SETTINGS_SCHEMA: z<VisionModelSettings> = z.object({
  provider: z.string().required(),
  model: z.string().required(),
})

/** Composition entry: routing stays off until the settings document names a model. */
const ROUTING_OFF: VisionModelSettings = { provider: '', model: '' }

/** The plugin takes no composition config; the settings namespace is its configuration. */
export type Config = Readonly<Record<string, never>>
export const Config = z.object({}) as unknown as z<Config>

/**
 * Owns the vision-model routing policy: the configured route, the per-agent
 * open-turn image state, and the `agent/request` waterfall that switches.
 * The settings source is read live, so a change takes effect on the next
 * request without a restart.
 */
export class VisionRouteConfig extends Service implements VisionRouteService {
  private source: () => VisionModelSettings

  /** Per-agent open-turn image state; the value is the turn number, 0 = none. */
  private readonly imagesInTurn = new WeakMap<Agent, number>()

  constructor(ctx: Context, _config: Config = {}) {
    super(ctx, 'visionRoute')
    this.source = () => ROUTING_OFF
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, VISION_MODEL_SETTINGS_NAMESPACE, VISION_MODEL_SETTINGS_SCHEMA, ROUTING_OFF, {
        setSource: (source) => { this.source = source },
        // Every consumer reads through configured(), so no registration-level
        // fact needs rebuilding when the settings document changes.
        onChange: () => {},
      })
    })
    ctx.on('agent/pre-step', async (payload, next) => {
      // One flag per open turn: a turn that ever carried an image keeps
      // routing for all of its steps, and a fresh turn recomputes.
      if (this.imagesInTurn.get(payload.agent) !== payload.turn) {
        this.imagesInTurn.set(
          payload.agent,
          payload.messages.some(message => contentHasImage(message.content)) ? payload.turn : 0,
        )
      }
      return next()
    })
    ctx.on('agent/request', async (payload, next): Promise<LlmCallConfig> => {
      const resolved = await next()
      const vision = this.configured()
      if (vision === undefined) return resolved
      // Once a session's history carries an image, every later request carries
      // it too, and a text-only adapter rejects the whole request
      // (UNSUPPORTED_CONTENT). Routing is therefore session-persistent: the
      // first image-bearing turn switches the session to the vision model, and
      // the routed header keeps serving every later request — the same
      // invariant as the selectModel guard ("session already contains images").
      if (this.imagesInTurn.get(payload.agent) !== payload.turn) return resolved
      if (resolved.provider === vision.provider && resolved.model === vision.model) return resolved
      // A session model that already carries images needs no routing.
      if (await this.imageCapable(resolved.provider, resolved.model)) return resolved
      if (!await this.imageCapable(vision.provider, vision.model)) {
        this.ctx.logger.warn(
          'llm-vision-route: configured vision model %s/%s does not declare image input; keeping %s/%s',
          vision.provider, vision.model, resolved.provider, resolved.model,
        )
        return resolved
      }
      return this.switchModel(resolved, vision.provider, vision.model)
    })
  }

  /**
   * The configured vision model route, or undefined while routing is off.
   * @returns a detached provider/model pair when the settings document names one.
   */
  configured(): { provider: string; model: string } | undefined {
    const settings = this.source()
    return settings.provider.length > 0 && settings.model.length > 0
      ? { provider: settings.provider, model: settings.model }
      : undefined
  }

  /**
   * Whether the configured vision model declares image input. Absent
   * configuration or an unregistered or non-vision route answers false, so
   * consumers keep their refusal behavior.
   * @returns fulfillment with the capability verdict.
   */
  async resolvesImages(): Promise<boolean> {
    const vision = this.configured()
    if (vision === undefined) return false
    return this.imageCapable(vision.provider, vision.model)
  }

  private async imageCapable(provider: string, model: string): Promise<boolean> {
    // The plugin context resolves services through `get` (property access is
    // inject-limited on plugin fibers); a not-yet-mounted llm answers false,
    // keeping the consumer's refusal behavior.
    const llm = this.ctx.get('llm')
    if (llm === undefined) return false
    try {
      const info = await llm.resolveModelInfo(provider, model)
      return info.inputModalities?.includes('image') ?? false
    } catch {
      // A route the registry does not know cannot carry images; the adapter
      // boundary answers authoritatively when a request actually dispatches.
      return false
    }
  }

  /** Replace provider/model on a config, dropping an inherited reasoning effort. */
  private switchModel(config: LlmCallConfig, provider: string, model: string): LlmCallConfig {
    const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = config
    return { ...withoutInheritedEffort, provider, model }
  }
}

export default VisionRouteConfig
