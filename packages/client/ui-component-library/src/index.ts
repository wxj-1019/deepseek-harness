/**
 * Host registration for the component library settings card. The
 * `component-library` namespace, the learning pipeline, and the Remote face
 * are owned by `@deepseek-ai/dsh-component-library` — this package
 * contributes only the browser card, so the Host half has nothing to
 * register.
 * @module @deepseek-ai/dsh-client-ui-component-library
 */

/**
 * No Host-side work: the domain and its live pipeline are owned by
 * `dsh-component-library`.
 * @param _ctx - Host context (unused).
 */
export function apply(_ctx: unknown): void {}
