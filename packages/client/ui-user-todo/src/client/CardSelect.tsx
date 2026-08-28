/**
 * Drawer dropdown: a field-shaped trigger plus a fixed-position option menu
 * portaled to the document body. The native `<select>` popup is browser
 * chrome that CSS cannot theme, so the menu draws its own glass surface; the
 * portal escapes the drawer's `overflow` clipping and its backdrop-filter
 * containing block, and the wrapper re-declares the glass seam attributes so
 * the aqua theme styles it exactly like the drawer panel.
 * @module @deepseek-ai/dsh-client-ui-user-todo/client/CardSelect
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCheckOutline16, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './CardSelect.module.css'

/** One selectable entry of the dropdown. */
export interface CardSelectOption {
  /** Submitted value; the empty string is the conventional "no link". */
  readonly value: string
  /** Display text. */
  readonly label: string
}

/** Full props for one dropdown. */
export interface CardSelectProps {
  /** Accessible name of the field and its menu. */
  readonly ariaLabel: string
  /** Current value; rendered as the trigger label through `options`. */
  readonly value: string
  /** Every selectable entry, current value included. */
  readonly options: readonly CardSelectOption[]
  /** Commit the picked value. */
  readonly onSelect: (value: string) => void
  /** Open-state fan-out, letting the host suspend its own dismissal while the menu is up. */
  readonly onOpenChange?: (open: boolean) => void
}

/**
 * One themed dropdown field.
 * @param props - label, options, current value, and the pick callback.
 * @returns the trigger and, while open, the portaled option menu.
 */
export function CardSelect(props: CardSelectProps): ReactNode {
  const { ariaLabel, value, options, onSelect, onOpenChange } = props
  const [open, setOpenRaw] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const menuId = useId()
  const openRef = useRef(false)

  const setOpen = (next: boolean): void => {
    openRef.current = next
    setOpenRaw(next)
    onOpenChange?.(next)
  }

  // An unmount with the menu up (closing the drawer does it) must release
  // the host's dismissal suspension; React nulls the refs before this runs,
  // so the open state rides a plain ref.
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  useEffect(() => () => {
    if (openRef.current) onOpenChangeRef.current?.(false)
  }, [])

  // Viewport placement is measured once per open; any scroll or resize while
  // the menu is up dismisses it rather than showing a detached list.
  const openMenu = (): void => {
    const box = triggerRef.current?.getBoundingClientRect()
    if (box === undefined) return
    setRect({ left: box.left, top: box.bottom, bottom: box.top, width: box.width })
    setActive(Math.max(0, options.findIndex(option => option.value === value)))
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const dismiss = (): void => setOpen(false)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open])

  // Native-level interception: the menu lives outside the drawer's root, so
  // its pointerdown must not reach the document dismissal listeners.
  const guardPointerDown = (node: HTMLDivElement | null): void => {
    if (node === null) return
    node.addEventListener('pointerdown', (event) => { event.stopPropagation() })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive(current => (current + delta + options.length) % options.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const picked = options[active]
      if (picked !== undefined) {
        setOpen(false)
        onSelect(picked.value)
      }
    }
  }

  const current = options.find(option => option.value === value)
  const below = rect !== null && rect.top + 200 <= window.innerHeight

  return (
    <span className={css.root} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        className={css.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className={css.triggerValue}>{current?.label ?? ''}</span>
        <IconChevronDownOutline14 className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
      </button>
      {open && rect !== null && createPortal(
        <div ref={guardPointerDown} data-dsh-aqua="">
          <ul
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            className={css.menu}
            data-dsh-glass-panel=""
            style={{
              left: rect.left,
              width: rect.width,
              ...(below
                ? { top: rect.top + 4 }
                : { bottom: window.innerHeight - rect.bottom + 4 }),
            }}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={
                  index === active
                    ? `${css.option} ${css.optionActive}`
                    : css.option
                }
                onPointerMove={() => setActive(index)}
                onClick={() => {
                  setOpen(false)
                  onSelect(option.value)
                }}
              >
                <span className={css.optionLabel}>{option.label}</span>
                {option.value === value && <IconCheckOutline16 />}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </span>
  )
}
