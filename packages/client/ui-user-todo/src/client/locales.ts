/** `userTodo` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'userTodo'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'button.label': '今日待办',
  'button.aria': '今日待办',
  'count.pending': '{count} 项未完成',
  'panel.aria': '今日待办清单',
  'panel.empty': '今天没有待办，享受当下。',
  'add.placeholder': '添加待办，回车确认',
  'add.submit': '添加',
  'row.check.done': '标记为完成',
  'row.check.undo': '标记为未完成',
  'row.delete': '删除',
  'row.open': '打开会话',
  'panel.close': '收起',
  'session.label': '关联会话',
  'session.none': '不关联会话',
  'history.toggle': '更早的已完成（{count}）',
  'row.edit': '编辑标题',
  'link.label': '关联项目',
  'link.none': '不关联项目',
  'error.load': '加载失败：{message}',
  'error.action': '操作失败：{message}',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<UserTodoKey, string> = {
  'button.label': 'Today\u2019s todos',
  'button.aria': 'Today\u2019s todos',
  'count.pending': '{count} open',
  'panel.aria': 'Daily todo list',
  'panel.empty': 'Nothing for today. Enjoy the moment.',
  'add.placeholder': 'Add a todo, Enter to confirm',
  'add.submit': 'Add',
  'row.check.done': 'Mark as done',
  'row.check.undo': 'Mark as open',
  'row.delete': 'Delete',
  'row.open': 'Open session',
  'panel.close': 'Collapse',
  'session.label': 'Linked session',
  'session.none': 'No session',
  'history.toggle': 'Earlier completed ({count})',
  'row.edit': 'Edit title',
  'link.label': 'Linked project',
  'link.none': 'No project',
  'error.load': 'Failed to load: {message}',
  'error.action': 'Action failed: {message}',
}

/** Key domain of the `userTodo` namespace (zh is the source of truth). */
export type UserTodoKey = keyof typeof zh
