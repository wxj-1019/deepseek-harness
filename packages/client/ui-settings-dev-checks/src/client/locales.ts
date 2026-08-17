/** Dev-checks settings page copy (section nav + page). */
export const en = {
  nav: 'Dev checks',
  pageHint:
    'Per-machine switches for the heavy routine quality gates. Off means the routine entry point skips the gate on this machine; CI always runs the full gate, and explicit full runs (check:all) are never narrowed. Stored in the dev-checks section of $DSH_HOME/settings.yaml.',
  'e2e.label': 'E2E (real API)',
  'e2e.description': 'pnpm run test:e2e — real DeepSeek API calls across the suite; the slowest lane.',
  'coverage.label': 'Coverage',
  'coverage.description': 'pnpm run test:coverage — the full instrumented unit run with per-file 100% thresholds.',
  'snapshot.label': 'Snapshot replay',
  'snapshot.description': 'pnpm run test:snapshot — keyless transcript replay over the built examples.',
  'docSync.label': 'Doc sync',
  'docSync.description': 'pnpm run doc-sync — the documentation gate aggregate, including the site build.',
  'buildHygiene.label': 'Build & hygiene',
  'buildHygiene.description': 'Agent-selected build, hygiene, and built-artifact smokes. Advisory only: the scripts themselves stay unguarded.',
  'prePushTypecheck.label': 'Pre-push typecheck',
  'prePushTypecheck.description': 'The repository typecheck in the lefthook pre-push hook.',
  on: 'On',
  off: 'Off',
  readOnly: 'The settings document is read-only in this deployment.',
  unavailable: 'This settings namespace is not exposed by the current deployment.',
} as const

/** Copy key union of the dev-checks settings page, mirrored by the zh dictionary. */
export type DevChecksKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in keyof typeof en]: string } = {
  nav: '开发校验',
  pageHint:
    '本页开关只影响本机的例行质量检查：关闭后对应的日常入口会在本机跳过；CI 始终全量运行，显式全量入口（check:all）也不受影响。设置保存在 $DSH_HOME/settings.yaml 的 dev-checks 段。',
  'e2e.label': 'E2E（真实 API）',
  'e2e.description': 'pnpm run test:e2e —— 全套件真实调用 DeepSeek API，是最慢的一条。',
  'coverage.label': '覆盖率',
  'coverage.description': 'pnpm run test:coverage —— 全量单测插桩运行，带每文件 100% 门槛。',
  'snapshot.label': '快照回放',
  'snapshot.description': 'pnpm run test:snapshot —— 基于构建产物的免 key 转录回放。',
  'docSync.label': '文档门禁',
  'docSync.description': 'pnpm run doc-sync —— 文档检查聚合，含站点构建。',
  'buildHygiene.label': '构建与卫生',
  'buildHygiene.description': '由 agent 按需选择的 build、hygiene 与构建产物冒烟。仅作建议：脚本本身不拦截。',
  'prePushTypecheck.label': '推送前 typecheck',
  'prePushTypecheck.description': 'lefthook pre-push 钩子中的仓库 typecheck。',
  on: '开',
  off: '关',
  readOnly: '此部署的设置文档为只读。',
  unavailable: '当前部署未暴露此设置命名空间。',
}
