/** `sessionPins` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sessionPins'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'pin.toggle.pin': '置顶',
  'pin.toggle.unpin': '取消置顶',
  'section.label': '置顶会话',
  'section.empty': '暂无置顶会话',
  'row.unpin': '取消置顶',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<SessionPinsKey, string> = {
  'pin.toggle.pin': 'Pin',
  'pin.toggle.unpin': 'Unpin',
  'section.label': 'Pinned sessions',
  'section.empty': 'No pinned sessions',
  'row.unpin': 'Unpin',
}

/** Key domain of the `sessionPins` namespace (zh is the source of truth). */
export type SessionPinsKey = keyof typeof zh
