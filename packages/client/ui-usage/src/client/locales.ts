/** `usage` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'usage'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'view.usage': '用量',
  'pageHint': '每个会话的累计 token 用量（provider 上报值）。打开过的会话即时更新。',
  'summary.aria': '用量汇总',
  'summary.cacheHit': '缓存命中',
  'summary.today': '今日',
  'col.session': '会话',
  'col.model': '模型',
  'col.day': '日期',
  'col.requests': '请求',
  'col.input': '输入',
  'col.output': '输出',
  'col.cacheRead': '缓存读',
  'col.cacheWrite': '缓存写',
  'col.total': '合计',
  'col.share': '占比',
  'col.cost': '成本',
  'col.lastActive': '最近活跃',
  'totals.label': '合计',
  'empty': '暂无用量记录',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<UsageKey, string> = {
  'view.usage': 'Usage',
  'pageHint': 'Accumulated per-session token usage as reported by providers. Opened sessions update live.',
  'summary.aria': 'Usage summary',
  'summary.cacheHit': 'Cache hit',
  'summary.today': 'Today',
  'col.session': 'Session',
  'col.model': 'Model',
  'col.day': 'Day',
  'col.requests': 'Requests',
  'col.input': 'Input',
  'col.output': 'Output',
  'col.cacheRead': 'Cache read',
  'col.cacheWrite': 'Cache write',
  'col.total': 'Total',
  'col.share': 'Share',
  'col.cost': 'Cost',
  'col.lastActive': 'Last active',
  'totals.label': 'Total',
  'empty': 'No usage recorded yet',
}

/** Key domain of the `usage` namespace (zh is the source of truth). */
export type UsageKey = keyof typeof zh
