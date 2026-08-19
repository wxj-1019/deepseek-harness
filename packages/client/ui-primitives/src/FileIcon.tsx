// FileIcon: per-type file glyph for file trees and file rows, in the spirit
// of VS Code icon themes. Unlike the monochrome ic_ds_* set (currentColor
// only), a file type carries an identity color — the same choice VS Code
// ships as static icon-theme SVGs — so the palette lives in the glyph table
// below rather than in --dsw-* tokens. The untyped fallback glyph stays
// currentColor to follow the surrounding text color like every other icon.

/** Props shared by every FileIcon render. */
export interface FileIconProps {
  /** File name (basename); the kind is a pure function of this string. */
  name: string
  /** Glyph size in px (default 16, the tree row size). */
  size?: number | undefined
  /** Extra class for layout placement. */
  className?: string | undefined
}

/** Every rendered file kind; the mapping below decides which name gets which. */
export type FileIconKind =
  | 'typescript' | 'javascript' | 'vue' | 'html' | 'css' | 'json' | 'markdown'
  | 'config' | 'python' | 'shell' | 'powershell' | 'image' | 'text' | 'archive'
  | 'pdf' | 'rust' | 'go' | 'java' | 'cpp' | 'generic'

/**
 * Resolve a file name to its icon kind. Lowercases first (Windows names,
 * `A.TS`), then consults the extensionless-name table (dotfiles and
 * well-known build files), then the extension table; names with no dot or an
 * unknown extension fall to `generic`.
 * @param name - file basename, any case, any number of dots.
 * @returns the kind whose color and label the icon renders.
 */
export function fileIconKind(name: string): FileIconKind {
  const lower = name.toLowerCase()
  if (NAME_KINDS[lower] !== undefined) return NAME_KINDS[lower]
  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return 'generic'
  const kind = EXT_KINDS[lower.slice(dot + 1)]
  return kind === undefined ? 'generic' : kind
}

/** Extensionless files whose whole name carries the type. */
const NAME_KINDS: Readonly<Record<string, FileIconKind>> = {
  dockerfile: 'config',
  makefile: 'config',
  '.gitignore': 'config',
  '.gitattributes': 'config',
  '.npmrc': 'config',
  '.editorconfig': 'config',
  '.env': 'config',
}

/** Extension table, keyed lowercase. */
const EXT_KINDS: Readonly<Record<string, FileIconKind>> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  vue: 'vue',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  json: 'json', jsonc: 'json',
  md: 'markdown', mdx: 'markdown',
  yml: 'config', yaml: 'config', toml: 'config', ini: 'config', cfg: 'config', conf: 'config',
  py: 'python', pyw: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image',
  ico: 'image', webp: 'image', bmp: 'image', avif: 'image',
  log: 'text', txt: 'text', text: 'text', err: 'text',
  zip: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive', rar: 'archive', xz: 'archive', br: 'archive',
  pdf: 'pdf',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
}

/** Badge kinds: rounded plate in the type color with a short label. */
interface BadgeGlyphSpec {
  /** Badge background color. */
  bg: string
  /** Label color. */
  fg: string
  /** Up to three characters; the font size adapts to the label length. */
  label: string
}

/** Badge table, VS Code material-theme style letter plates. */
const BADGES: Readonly<Partial<Record<FileIconKind, BadgeGlyphSpec>>> = {
  typescript: { bg: '#3178c6', fg: '#ffffff', label: 'TS' },
  javascript: { bg: '#f0db4e', fg: '#1e1e1e', label: 'JS' },
  vue: { bg: '#41b883', fg: '#ffffff', label: 'V' },
  html: { bg: '#e44d26', fg: '#ffffff', label: '<>' },
  css: { bg: '#42a5f5', fg: '#ffffff', label: 'CSS' },
  json: { bg: '#cbcb41', fg: '#1e1e1e', label: '{}' },
  markdown: { bg: '#519aba', fg: '#ffffff', label: 'MD' },
  config: { bg: '#a074c4', fg: '#ffffff', label: 'CFG' },
  python: { bg: '#3776ab', fg: '#ffffff', label: 'PY' },
  powershell: { bg: '#4a90d9', fg: '#ffffff', label: 'PS' },
  pdf: { bg: '#e53935', fg: '#ffffff', label: 'PDF' },
  rust: { bg: '#dea584', fg: '#1e1e1e', label: 'RS' },
  go: { bg: '#00add8', fg: '#ffffff', label: 'GO' },
  java: { bg: '#e76f00', fg: '#ffffff', label: 'JV' },
  cpp: { bg: '#a8b9cc', fg: '#1e1e1e', label: 'C++' },
}

/** Badge label font size by label length, tuned once for the 16px grid. */
function badgeFontSize(label: string): number {
  if (label.length >= 3) return 6.2
  if (label.length === 2) return 8
  return 10.5
}

/**
 * Render the per-type file glyph for a file name.
 * @param props - the file name plus the shared icon sizing props.
 * @returns the glyph svg (aria-hidden; the row text carries the name).
 */
export function FileIcon({ name, size = 16, className }: FileIconProps) {
  const kind = fileIconKind(name)
  const badge = BADGES[kind]
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-kind={kind}
      aria-hidden="true"
    >
      {badge !== undefined
        ? <BadgeGlyph badge={badge} />
        : kind === 'shell'
          ? <PromptGlyph color="#89e051" />
          : kind === 'powershell'
            ? <PromptGlyph color="#4a90d9" />
            : kind === 'image'
              ? <ImageGlyph />
              : kind === 'archive'
                ? <ArchiveGlyph />
                : kind === 'text'
                  ? <TextFileGlyph />
                  : <GenericFileGlyph />}
    </svg>
  )
}

/** Rounded plate with the type label. */
function BadgeGlyph({ badge }: { badge: BadgeGlyphSpec }) {
  return (
    <>
      <rect x="1" y="2.5" width="14" height="11" rx="2.5" fill={badge.bg} />
      <text
        x="8"
        y="8.2"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={badgeFontSize(badge.label)}
        fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
        fill={badge.fg}
      >
        {badge.label}
      </text>
    </>
  )
}

/** Terminal prompt `>_` for shell dialects. */
function PromptGlyph({ color }: { color: string }) {
  return (
    <text
      x="8"
      y="8.2"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="10"
      fontWeight="700"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      fill={color}
    >
      {'>_'}
    </text>
  )
}

/** Framed picture: mountain and sun inside a rounded frame. */
function ImageGlyph() {
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.5 1.5h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm0 1v11h11v-11h-11Z"
        fill="#a074c4"
      />
      <circle cx="5.6" cy="5.8" r="1.2" fill="#a074c4" />
      <path d="M3.2 12 6.6 7.6l2.3 2.9 1.7-2 2.2 3.5H3.2Z" fill="#a074c4" />
    </>
  )
}

/** Archive box: base, lid seam, and zipper dashes. */
function ArchiveGlyph() {
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 2.5h12v3H2v-3Zm1 1v1h10v-1H3Z"
        fill="#a1887f"
      />
      <path d="M2 6.5h12v7H2v-7Zm1 1v5h10v-5H3Z" fill="#a1887f" />
      <rect x="7.4" y="7.5" width="1.2" height="1.4" fill="#a1887f" />
      <rect x="7.4" y="9.6" width="1.2" height="1.4" fill="#a1887f" />
      <rect x="7.4" y="11.7" width="1.2" height="1" fill="#a1887f" />
    </>
  )
}

/** Lined document: dog-eared page with three text lines. */
function TextFileGlyph() {
  return (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 1h6.6L13 4.4V15H3V1Zm1 1v12h8V4.8L9.2 2H4Z"
        fill="#8a929c"
      />
      <rect x="5" y="6" width="6" height="1" fill="#8a929c" />
      <rect x="5" y="8.5" width="6" height="1" fill="#8a929c" />
      <rect x="5" y="11" width="4" height="1" fill="#8a929c" />
    </>
  )
}

/** Untyped fallback: a plain dog-eared page in the surrounding text color. */
function GenericFileGlyph() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 1h6.6L13 4.4V15H3V1Zm1 1v12h8V4.8L9.2 2H4Z"
      fill="currentColor"
    />
  )
}
