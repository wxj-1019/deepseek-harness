/** `settings.background` namespace dictionaries (the Background section's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '背景',
  'title': '背景',
  'kind.none': '无',
  'kind.preset': '预设',
  'kind.image': '图片',
  'preset.aurora': '极光',
  'preset.dusk': '暮色',
  'preset.mist': '雾',
  'upload': '上传图片',
  'uploading': '上传中…',
  'remove': '移除图片',
  'dimming': '遮罩浓度',
  'imageUnavailable': '背景图片已不可用，请重新上传。',
  'invalid.unknownPreset': '所选预设不存在，请重新选择。',
  'invalid.missingImageRef': '图片引用缺失，请重新上传。',
} satisfies Record<string, string>

/** The settings.background namespace key union. */
export type BackgroundKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Background',
  'title': 'Background',
  'kind.none': 'None',
  'kind.preset': 'Presets',
  'kind.image': 'Image',
  'preset.aurora': 'Aurora',
  'preset.dusk': 'Dusk',
  'preset.mist': 'Mist',
  'upload': 'Upload image',
  'uploading': 'Uploading…',
  'remove': 'Remove image',
  'dimming': 'Dimming',
  'imageUnavailable': 'The background image is no longer available; upload it again.',
  'invalid.unknownPreset': 'The selected preset does not exist; choose again.',
  'invalid.missingImageRef': 'The image reference is missing; upload again.',
} satisfies Record<BackgroundKey, string>
