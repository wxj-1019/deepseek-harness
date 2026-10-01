/**
 * Bilingual dictionaries for the component library surfaces: the
 * conversation-view gallery.
 * @module @deepseek-ai/dsh-client-ui-component-library/src/client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.componentLibrary'

/** English copy for the gallery. */
const en = {
  'card.originScanned': 'scanned',
  'card.originModel': 'model',
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
  'gallery.preview': 'Live preview',
  'gallery.example': 'Usage example',
  'gallery.copy': 'Copy',
  'gallery.copied': 'Copied',
  'gallery.exampleMissing': 'No usage example captured for this component yet.',
  'gallery.path': 'Source',
} as const

/** 中文文案。 */
const zh: Record<keyof typeof en, string> = {
  'card.originScanned': '扫描',
  'card.originModel': '模型',
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
  'gallery.preview': '实时预览',
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
    /** The component library gallery's copy. */
    'settings.componentLibrary': ComponentLibraryLocaleKey
  }
}

export { en, zh }
