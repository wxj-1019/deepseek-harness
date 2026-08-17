/** Vision-model routing setting copy (section nav + page). */
export const en = {
  nav: 'Vision model',
  provider: 'Provider',
  model: 'Model',
  unconfigured: 'Not configured',
  unconfiguredHint:
    'While no vision model is configured, image-bearing messages are refused when the session model does not accept images.',
  configuredHint:
    'Requests that carry images automatically switch to this model; text-only requests keep the session model.',
  save: 'Save',
  clear: 'Clear',
  saved: 'Saved',
  noImageModels:
    'No image-capable models are available. Add a vision-model provider on the Models page first.',
  loadFailed: 'The model catalog could not be loaded.',
  readOnly: 'The settings document is read-only in this deployment.',
  emptyProvider: 'Select a provider',
  emptyModel: 'Select a model',
  conflict: 'These settings changed elsewhere. Reopen the page to edit the current values.',
} as const

/** Copy key union of the vision-model settings page, mirrored by the zh dictionary. */
export type VisionModelKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in keyof typeof en]: string } = {
  nav: '识图模型',
  provider: '提供方',
  model: '模型',
  unconfigured: '未配置',
  unconfiguredHint: '未配置识图模型时，如果会话模型不支持图片，发送带图片的消息会被拒绝。',
  configuredHint: '消息带图片时，请求会自动切换到该模型；纯文本请求仍使用会话当前模型。',
  save: '保存',
  clear: '清除',
  saved: '已保存',
  noImageModels: '当前没有支持图片输入的模型。请先在“模型”页添加一个视觉模型提供方。',
  loadFailed: '无法加载模型列表。',
  readOnly: '此部署的设置文档为只读。',
  emptyProvider: '选择提供方',
  emptyModel: '选择模型',
  conflict: '这些设置已在别处修改。请重新打开本页后再编辑。',
}
