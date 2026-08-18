/**
 * Copy dictionaries. Chinese is the key-set source of truth; English mirrors
 * it key-for-key (the browser-plugin spec asserts parity).
 */

/** Locale namespace owned by this plugin. */
export const NS = 'settings.desktopNotify'

/** Chinese dictionary (source of truth). */
export const zh = {
  rowTitle: '任务完成桌面通知',
  rowDescription: '任务结束且你未盯着该会话时弹出系统桌面通知，点击通知跳转到对应会话',
  on: '开',
  off: '关',
  body: '任务已完成',
  permissionDenied: '浏览器已拒绝通知权限：在地址栏左侧的站点设置中重新允许后才能开启',
  unsupported: '当前浏览器不支持桌面通知',
} as const

/** Dictionary key type. */
export type DesktopNotifyKey = keyof typeof zh

/** English dictionary. */
export const en: Record<DesktopNotifyKey, string> = {
  rowTitle: 'Desktop notification on completion',
  rowDescription: 'Pop a system desktop notification when a task finishes while you are not watching that session; click it to jump to the session',
  on: 'On',
  off: 'Off',
  body: 'Task completed',
  permissionDenied: 'The browser denied notification permission: re-enable it in the site settings beside the address bar first',
  unsupported: 'This browser does not support desktop notifications',
}
