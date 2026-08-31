/**
 * Publish the fork-only @deepseek-ai packages under the owner's npm scope
 * (@wxj-1019), so DSH Desktop can install them through npm aliases while
 * cordis compositions keep their original package names.
 *
 * Prerequisites: `npm adduser` once on this machine; packages build with the
 * workspace's own toolchain before publishing.
 *
 * Usage:
 *   node scripts/publish-fork-packages.mjs            # publish all fork-only packages
 *   node scripts/publish-fork-packages.mjs mcp-servers # publish one package
 *
 * For each package the script:
 *   1. builds it (pnpm --filter build),
 *   2. rewrites package.json in a temp clone of the publish surface: name
 *      (@deepseek-ai/x -> @wxj-1019/x), version (aligned to RUNTIME_VERSION),
 *      workspace:^ dependencies rewritten to the runtime version (or to the
 *      @wxj-1019 scope for sibling fork-only packages),
 *   3. publishes with --access public,
 *   4. restores the working tree.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SCOPE = '@wxj-1019'
const RUNTIME_VERSION = '0.1.1-rc.2'

/** Package directory -> npm name, for sibling-scope rewriting. */
const FORK_ONLY = {
  'client/ui-aqua': '@deepseek-ai/dsh-client-ui-aqua',
  'client/ui-desktop-notify': '@deepseek-ai/dsh-client-ui-desktop-notify',
  'client/ui-settings-dev-checks': '@deepseek-ai/dsh-client-ui-settings-dev-checks',
  'client/ui-settings-mcp': '@deepseek-ai/dsh-client-ui-settings-mcp',
  'client/ui-settings-vision-model': '@deepseek-ai/dsh-client-ui-settings-vision-model',
  'llm/llm-vision-route': '@deepseek-ai/dsh-llm-vision-route',
  'mcp/mcp-servers': '@deepseek-ai/dsh-mcp-servers',
}
const OLD_NAME_TO_DIR = new Map(Object.entries(FORK_ONLY).map(([dir, name]) => [name, dir]))

const run = (command, args, cwd = ROOT) => execFileSync(command, args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

const target = process.argv[2]
const entries = target === undefined
  ? Object.entries(FORK_ONLY)
  : Object.entries(FORK_ONLY).filter(([dir]) => dir.endsWith(target) || dir === target)
if (entries.length === 0) {
  console.error(`publish-fork-packages: unknown package "${target}" (choose from ${Object.keys(FORK_ONLY).join(', ')})`)
  process.exit(1)
}

try {
  run('npm', ['whoami'])
} catch {
  console.error('publish-fork-packages: run `npm adduser` first')
  process.exit(1)
}

for (const [dir, originalName] of entries) {
  const pkgDir = resolve(ROOT, 'packages', dir)
  const manifestPath = join(pkgDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const shortName = originalName.slice('@deepseek-ai/'.length)
  const scopedName = `${SCOPE}/${shortName}`

  console.log(`\n== ${originalName} -> ${scopedName}@${RUNTIME_VERSION}`)
  const buildScript = manifest.scripts?.build
  if (buildScript === undefined) {
    // These packages have no standalone build script; the workspace build
    // (tsc -b) already emitted lib/. Require the artifact instead of rebuilding.
    if (!existsSync(join(pkgDir, 'lib', 'index.js'))) {
      console.error(`publish-fork-packages: ${originalName} has no build script and no lib/index.js — run \`pnpm run build\` first`)
      process.exit(1)
    }
  } else {
    run('pnpm', ['--filter', shortName, 'run', 'build'], ROOT)
  }

  // Stage the publish surface in a temp clone of the package directory so the
  // working tree is never touched by the name/version/dependency rewrite.
  const stage = mkdtempSync(join(tmpdir(), 'dsh-publish-'))
  cpSync(pkgDir, join(stage, 'pkg'), { recursive: true })
  const stagedManifestPath = join(stage, 'pkg', 'package.json')
  const staged = JSON.parse(readFileSync(stagedManifestPath, 'utf8'))
  staged.name = scopedName
  staged.version = RUNTIME_VERSION
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(staged[section] ?? {})) {
      if (!dep.startsWith('@deepseek-ai/dsh-') && dep !== '@deepseek-ai/dsh' && dep !== '@deepseek-ai/cordis') continue
      if (dep === '@deepseek-ai/cordis') {
        staged[section][dep] = range.replace(/^workspace:/, '')
        continue
      }
      const sibling = OLD_NAME_TO_DIR.get(dep)
      staged[section][dep] = sibling === undefined
        ? RUNTIME_VERSION // official runtime family
        : `${SCOPE}/${dep.slice('@deepseek-ai/'.length)}@${RUNTIME_VERSION}`
    }
  }
  delete staged.private
  delete staged.publishConfig
  writeFileSync(stagedManifestPath, `${JSON.stringify(staged, null, 2)}\n`)

  run('npm', ['publish', '--access', 'public'], join(stage, 'pkg'))
  rmSync(stage, { recursive: true, force: true })
  console.log(`published ${scopedName}@${RUNTIME_VERSION}`)
}

console.log(`\npublish-fork-packages: all ${entries.length} package(s) published under ${SCOPE}`)
