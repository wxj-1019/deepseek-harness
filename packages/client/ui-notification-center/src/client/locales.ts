/** `notificationCenter` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'notificationCenter'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'bell.aria': '通知',
  'bell.unread': '{count} 条未读',
  'panel.aria': '通知中心',
  'panel.empty': '暂无通知',
  'panel.markAllRead': '全部已读',
  'panel.clearRead': '清除已读',
  'panel.close': '关闭',
  'row.markRead': '标记已读',
  'row.unread': '未读',
  'kind.session-completed': '会话完成',
  'kind.approval-decided': '审批答复',
  'kind.job-finished': '任务结束',
  'kind.reminder-dispatched': '提醒触发',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<NotificationCenterKey, string> = {
  'bell.aria': 'Notifications',
  'bell.unread': '{count} unread',
  'panel.aria': 'Notification center',
  'panel.empty': 'No notifications',
  'panel.markAllRead': 'Mark all read',
  'panel.clearRead': 'Clear read',
  'panel.close': 'Close',
  'row.markRead': 'Mark read',
  'row.unread': 'Unread',
  'kind.session-completed': 'Session completed',
  'kind.approval-decided': 'Approval answered',
  'kind.job-finished': 'Job finished',
  'kind.reminder-dispatched': 'Reminder fired',
}

/** Key domain of the `notificationCenter` namespace (zh is the source of truth). */
export type NotificationCenterKey = keyof typeof zh
