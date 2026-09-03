/**
 * The component library card in the Plugins settings section's configurable
 * tab: the learned-component count, a search box over the loaded records, and
 * the review controls that keep hallucinated model records out of the
 * durable set.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: loads the `settings.componentLibrary` LocaleNamespaceMap merge the locale seat resolves against.
import type {} from './locales.ts'
// Type-only: pulls the `settings.plugin.item` SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { ComponentLibraryState } from './controller.ts'
import { filterRecords } from './controller.ts'
import css from './ComponentLibraryCard.module.css'

/** The registration-side face the component library card's slot entry injects. */
export interface ComponentLibraryCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as useComponentLibrary. */
    componentLibrary: SnapshotStore<ComponentLibraryState>
  }
  /** First-render read entry. */
  ensure: () => void
  /** Publish the search box text. */
  setQuery: (query: string) => void
  /** Apply one review decision to a model-contributed record. */
  review: (id: string, decision: 'approve' | 'discard') => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type ComponentLibraryCardComponentProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.componentLibrary'> & InjectFace<ComponentLibraryCardFace>

/**
 * Render the component library card.
 * @param props - runtime slot currency, namespace copy, injected face.
 * @returns the card element.
 */
export function ComponentLibraryCard(props: ComponentLibraryCardComponentProps): ReactNode {
  const state = props.useComponentLibrary(selector => selector)
  const { t } = props
  // First render only: the controller converges on pushed changes afterwards.
  // The injected `ensure` closure is stable for the registration's lifetime.
  const { ensure } = props
  useEffect(() => {
    ensure()
  }, [ensure])

  const items = filterRecords(state.items, state.query)
  const pending = state.items.filter(item => item.origin === 'model' && !item.reviewed).length

  return (
    <li className={css.card}>
      <div className={css.header}>
        <div>
          <h3 className={css.title}>{t('card.title')}</h3>
          <p className={css.description}>{t('card.description')}</p>
        </div>
        <span className={css.count}>
          {state.items.length}
          {' '}
          {t('card.entries')}
          {pending > 0 && (
            <span className={css.pendingBadge}>
              {pending}
              {' '}
              {t('card.pendingReview')}
            </span>
          )}
        </span>
      </div>
      <input
        className={css.search}
        type="search"
        placeholder={t('card.searchPlaceholder')}
        value={state.query}
        onChange={(event) => {
          props.setQuery(event.target.value)
        }}
      />
      {state.status === 'error' && <p className={css.error}>{state.error ?? t('card.unavailable')}</p>}
      {state.status === 'ready' && items.length === 0 && <p className={css.empty}>{t('card.empty')}</p>}
      <ul className={css.rows}>
        {items.map(item => (
          <li key={item.id} className={css.row}>
            <div className={css.rowMain}>
              <span className={css.rowName}>{item.name}</span>
              <span className={css.rowPkg}>{item.pkg}</span>
              {item.jsdoc !== '' && <span className={css.rowJsdoc}>{item.jsdoc}</span>}
            </div>
            <div className={css.rowSide}>
              <span className={item.origin === 'model' ? css.badgeModel : css.badgeScanned}>
                {item.origin === 'model' ? t('card.originModel') : t('card.originScanned')}
              </span>
              {item.origin === 'model' && !item.reviewed && (
                <>
                  <button
                    type="button"
                    className={css.action}
                    onClick={() => {
                      props.review(item.id, 'approve')
                    }}
                  >
                    {t('card.approve')}
                  </button>
                  <button
                    type="button"
                    className={css.actionDanger}
                    onClick={() => {
                      props.review(item.id, 'discard')
                    }}
                  >
                    {t('card.discard')}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </li>
  )
}
