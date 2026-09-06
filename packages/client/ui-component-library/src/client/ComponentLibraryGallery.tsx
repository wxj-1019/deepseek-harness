/**
 * The component library gallery: a react-bits-style browsing view of every
 * learned component — searchable list on the left, the selected component's
 * contract (props table, design tokens, usage example) on the right. Data
 * rides the same controller as the settings card; the view is read-only.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: loads the `settings.componentLibrary` LocaleNamespaceMap merge the locale seat resolves against.
import type {} from './locales.ts'
import type { ComponentLibraryState } from './controller.ts'
import { filterRecords } from './controller.ts'
import css from './ComponentLibraryGallery.module.css'

/** The registration-side face the gallery's slot entry injects. */
export interface ComponentLibraryGalleryFace {
  hooks: {
    /** Gallery snapshot bound by the renderer as useComponentLibrary. */
    componentLibrary: SnapshotStore<ComponentLibraryState>
  }
  /** First-render read entry. */
  ensure: () => void
  /** Publish the search box text. */
  setQuery: (query: string) => void
}

/** Full props for the gallery body: the conversation-view runtime share + locale seat + injected face. */
export type ComponentLibraryGalleryProps = ConvViewProps
  & PropsLocale<'settings.componentLibrary'> & InjectFace<ComponentLibraryGalleryFace>

/**
 * Render the component library gallery.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the gallery element.
 */
export function ComponentLibraryGallery(props: ComponentLibraryGalleryProps): ReactNode {
  const state = props.useComponentLibrary(selector => selector)
  const { t } = props
  const { ensure } = props
  useEffect(() => {
    ensure()
  }, [ensure])

  const packages = useMemoPkgs(state.items)
  const visible = filterRecords(state.items, state.query)
  const [picked, pick] = useState<string | undefined>(undefined)
  const selected = visible.find(item => item.id === picked) ?? visible.at(0)
  const pkgFilter = packages.length > 1
    ? (
      <select
        className={css.pkgFilter}
        aria-label={t('gallery.allPackages')}
        value=""
        onChange={(event) => {
          const needle = event.target.value === '' ? state.query : event.target.value
          props.setQuery(needle)
        }}
      >
        <option value="">{t('gallery.allPackages')}</option>
        {packages.map(pkg => (
          <option key={pkg} value={pkg}>{pkg}</option>
        ))}
      </select>
    )
    : null

  return (
    <div className={css.gallery}>
      <div className={css.toolbar}>
        <input
          className={css.search}
          type="search"
          placeholder={t('gallery.searchPlaceholder')}
          value={state.query}
          onChange={(event) => {
            props.setQuery(event.target.value)
          }}
        />
        {pkgFilter}
        <span className={css.count}>
          {visible.length}
          {' '}
          {t('gallery.count')}
        </span>
      </div>
      {state.status === 'error' && <p className={css.error}>{state.error ?? t('card.unavailable')}</p>}
      {state.status === 'ready' && visible.length === 0 && <p className={css.empty}>{t('gallery.empty')}</p>}
      <div className={css.body}>
        <ul className={css.list}>
          {visible.map(item => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === selected?.id ? css.listItemActive : css.listItem}
                onClick={() => {
                  pick(item.id)
                }}
              >
                <span className={css.itemName}>{item.name}</span>
                <span className={css.itemPkg}>{item.pkg}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className={css.detail}>
          {selected === undefined
            ? <p className={css.empty}>{visible.length === 0 ? t('gallery.empty') : t('gallery.pickOne')}</p>
            : (
              <>
                <div className={css.detailHead}>
                  <h3 className={css.detailName}>{selected.name}</h3>
                  <span className={selected.origin === 'model' ? css.badgeModel : css.badgeScanned}>
                    {selected.origin === 'model' ? t('card.originModel') : t('card.originScanned')}
                  </span>
                </div>
                <p className={css.detailPkg}>{selected.pkg}</p>
                {selected.jsdoc !== '' && <p className={css.detailJsdoc}>{selected.jsdoc}</p>}
                <p className={css.detailPath}>
                  {t('gallery.path')}
                  {': '}
                  <code>{selected.path}</code>
                </p>

                <h4 className={css.sectionTitle}>{t('gallery.props')}</h4>
                {selected.propsInferred
                  ? (
                    selected.props.length === 0
                      ? <p className={css.dim}>{t('gallery.propsNone')}</p>
                      : (
                        <table className={css.propsTable}>
                          <thead>
                            <tr>
                              <th>name</th>
                              <th>type</th>
                              <th> </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.props.map(prop => (
                              <tr key={prop.name}>
                                <td className={css.propName}>{prop.name}</td>
                                <td>
                                  <code className={css.propType}>{prop.type}</code>
                                </td>
                                <td className={css.propRequired}>{prop.required ? t('gallery.required') : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                  )
                  : (
                    <>
                      <p className={css.dim}>{t('gallery.propsRaw')}</p>
                      <CodeBlock code={selected.rawProps} lang="ts" className={css.code} copyLabel={t('gallery.copy')} copiedLabel={t('gallery.copied')} />
                    </>
                  )}

                <h4 className={css.sectionTitle}>{t('gallery.tokens')}</h4>
                {selected.tokens.length === 0
                  ? <p className={css.dim}>{t('gallery.tokensNone')}</p>
                  : (
                    <div className={css.tokens}>
                      {selected.tokens.map(token => (
                        <code key={token} className={css.token}>{token}</code>
                      ))}
                    </div>
                  )}

                <h4 className={css.sectionTitle}>{t('gallery.example')}</h4>
                {selected.example === ''
                  ? <p className={css.dim}>{t('gallery.exampleMissing')}</p>
                  : <CodeBlock code={selected.example} lang="tsx" className={css.code} copyLabel={t('gallery.copy')} copiedLabel={t('gallery.copied')} />}
              </>
            )}
        </div>
      </div>
    </div>
  )
}

/** Sorted unique package names of the loaded records. */
function useMemoPkgs(items: ComponentLibraryState['items']): string[] {
  const joined = items.map(item => item.pkg).join('\n')
  return useMemo(() => [...new Set(joined.split('\n'))].sort((left, right) => left.localeCompare(right)), [joined])
}
