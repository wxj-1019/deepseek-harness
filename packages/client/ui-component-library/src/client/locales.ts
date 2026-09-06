/**
 * Bilingual dictionaries for the component library surfaces: the settings
 * card and the conversation-view gallery.
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
  'gallery.tab': 'Components',
  'gallery.searchPlaceholder': 'Search components…',
  'gallery.allPackages': 'All packages',
  'gallery.count': 'components',
  'gallery.empty': 'No components match. Clear the search or pick another package.',
  'gallery.pickOne': 'Select a component on the left to see its contract.',
  'gallery.props': 'Props',
  'gallery.propsRaw': 'Props type (unresolved)',
  'gallery.propsNone': 'This component takes no props.',
  'gallery.required': 'required',
  'gallery.tokens': 'Design tokens',
  'gallery.tokensNone': 'No `--dsw-*` tokens referenced.',
  'gallery.example': 'Usage example',
  'gallery.copy': 'Copy',
  'gallery.copied': 'Copied',
  'gallery.exampleMissing': 'No usage example captured for this component yet.',
  'gallery.path': 'Source',
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
  'gallery.tab': '组件',
  'gallery.searchPlaceholder': '搜索组件…',
  'gallery.allPackages': '全部包',
  'gallery.count': '个组件',
  'gallery.empty': '没有匹配的组件。请清空搜索或换一个包。',
  'gallery.pickOne': '在左侧选择一个组件查看它的契约。',
  'gallery.props': 'Props',
  'gallery.propsRaw': 'Props 类型（未能解析）',
  'gallery.propsNone': '该组件不接收 props。',
  'gallery.required': '必填',
  'gallery.tokens': '设计令牌',
  'gallery.tokensNone': '未引用 `--dsw-*` 令牌。',
  'gallery.example': '用法示例',
  'gallery.copy': '复制',
  'gallery.copied': '已复制',
  'gallery.exampleMissing': '该组件尚未捕获用法示例。',
  'gallery.path': '源码',
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
