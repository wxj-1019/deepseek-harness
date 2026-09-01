/**
 * Locale dictionaries for the Git commit-rail conversation view. The view
 * namespace is registered against the locale seat like every other client
 * plugin dictionary.
 * @module @deepseek-ai/dsh-client-ui-git-graph/client/locales
 */

export const NS = 'ui-git-graph'

/** Chinese dictionary. */
export const zh = {
  'view.git': 'Git',
  'branch': '分支',
  'history': '历史',
  'notRepo': '当前工作区不是 Git 仓库',
  'loadMore': '加载更多',
  'loading': '加载中…',
  'error': '加载失败',
  'refresh': '刷新',
} as const

/** English dictionary (mirrors zh key-for-key). */
export const en: Record<keyof typeof zh, string> = {
  'view.git': 'Git',
  'branch': 'Branch',
  'history': 'History',
  'notRepo': 'The current workspace is not a Git repository',
  'loadMore': 'Load more',
  'loading': 'Loading…',
  'error': 'Failed to load',
  'refresh': 'Refresh',
}

export type GitGraphKey = keyof typeof zh
