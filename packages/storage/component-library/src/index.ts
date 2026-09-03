/**
 * Project-local component library: learns UI components from the checkout's
 * `packages/client` tree into a durable storage domain and serves them to the
 * model (component_query / component_record tools, an always-on prompt
 * section, a generated skill) and to the web settings panel (Remote face +
 * `component-library/changed`).
 * @module @deepseek-ai/dsh-component-library
 */

export type * from './types.ts'
export { componentLibraryDomainSpec, componentRecordSchema } from './spec.ts'
export {
  extractComponents,
  extractCssTokenRefs,
  type ExtractedComponent,
} from './extract.ts'
export { parseDesignTokens } from './tokens.ts'
export {
  CLIENT_TREE,
  THEME_STYLESHEET,
  extractFile,
  recordPath,
  scanComponentLibrary,
  scanDesignTokens,
} from './scanner.ts'
export { ComponentLibraryWatcher } from './watcher.ts'
export {
  COMPONENT_LIBRARY_SETTINGS_NAMESPACE,
  ComponentLibraryService,
  ComponentLibrarySettingsSchema,
  DEFAULT_QUERY_LIMIT,
  resolveComponentLibrarySpec,
  type ComponentLibrarySettings,
  type ComponentLibrarySpec,
  type Config,
} from './service.ts'

export { default } from './service.ts'
