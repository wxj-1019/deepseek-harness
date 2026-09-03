/**
 * Bilingual dictionaries for the component library settings card.
 * @module @deepseek-ai/dsh-client-ui-component-library/src/client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.componentLibrary'

/** English copy for the card. */
const en = {
  'card.title': 'Component library',
  'card.description': 'UI components learned from this checkout’s packages/client tree; the model queries them before writing UI code.',
  'card.empty': 'No components learned yet. The library fills itself as the scanner walks the checkout.',
  'card.searchPlaceholder': 'Search by name, package, or keyword',
  'card.pendingReview': 'pending review',
  'card.originScanned': 'scanned',
  'card.originModel': 'model',
  'card.approve': 'Approve',
  'card.discard': 'Discard',
  'card.entries': 'components',
  'card.unavailable': 'The component library is unavailable; check the Host log.',
} as const

/** 中文文案。 */
const zh: Record<keyof typeof en, string> = {
  'card.title': '组件库',
  'card.description': '从本检出的 packages/client 树学习到的 UI 组件；模型在编写 UI 代码前会先查询它们。',
  'card.empty': '尚未学习到任何组件。扫描器遍历检出后组件库会自动填充。',
  'card.searchPlaceholder': '按名称、包或关键词搜索',
  'card.pendingReview': '待审核',
  'card.originScanned': '扫描',
  'card.originModel': '模型',
  'card.approve': '通过',
  'card.discard': '丢弃',
  'card.entries': '个组件',
  'card.unavailable': '组件库不可用；请查看 Host 日志。',
}

/** The dictionary's key union — the namespace's complete key set. */
export type ComponentLibraryLocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The component library settings card's copy. */
    'settings.componentLibrary': ComponentLibraryLocaleKey
  }
}

export { en, zh }
