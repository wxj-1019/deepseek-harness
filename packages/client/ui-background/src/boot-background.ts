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
