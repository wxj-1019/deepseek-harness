/**
 * Spot geometry + overlay maintenance, shared by the spotlight/tilt
 * controller (spotlight.ts).
 *
 * A "spot" is a floating-glass pane stamped with `data-dsh-aqua-spot` by the
 * seam-stamper. One injected overlay lives inside a spot:
 * `data-dsh-aqua-glow` — the cursor glow surface (geometry set by the hover
 * controller; the radial fill lives in the stylesheet). It is re-attached
 * after React re-renders wipe it (one shared MutationObserver).
 */

/** Seam attribute marking a floating-glass pane as a spotlight target. */
export const SPOT_ATTR = 'data-dsh-aqua-spot'

/** Attribute on the injected glow overlay div. */
export const GLOW_ATTR = 'data-dsh-aqua-glow'

/** Marker set on a pane while the pointer is inside it. */
export const ON_ATTR = 'data-spot-on'

/** Selector matching every stamped pane. */
export const SPOT_SELECTOR = `[${SPOT_ATTR}]`

/** Nearest stamped pane from an event target (null when outside all panes).
 * @param target - event target to anchor the search from.
 * @returns the closest stamped pane, or null outside every pane. */
export function closestSpot(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(SPOT_SELECTOR) : null
}

/** Every stamped pane in document order.
 * @returns the pane elements in document order. */
export function spotElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SPOT_SELECTOR))
}

/**
 * The visible glass region of a pane (viewport rect). The fused
 * composer+stats spot is the wider invisible inputbar wrapper — its glass is
 * the union of the composer card and the docked stats band, so the wrapper's
 * side gutters stay outside every effect.

 * @param spot - the stamped pane to measure.
 * @returns the pane's visible glass region in viewport coordinates. */
export function visualRect(spot: HTMLElement): DOMRect {
  const card = spot.querySelector<HTMLElement>('[data-composer-card]')
  if (card !== null) {
    const r0 = card.getBoundingClientRect()
    const stats = spot.querySelector<HTMLElement>('[data-dsh-stats]')
    if (stats === null) return r0
    const r1 = stats.getBoundingClientRect()
    const left = Math.min(r0.left, r1.left)
    const top = Math.min(r0.top, r1.top)
    return new DOMRect(left, top, Math.max(r0.right, r1.right) - left, Math.max(r0.bottom, r1.bottom) - top)
  }
  return spot.getBoundingClientRect()
}

/** Is the pointer over the visible glass of the pane?
 * @param visual - the pane's visible glass region.
 * @param clientX - pointer viewport x.
 * @param clientY - pointer viewport y.
 * @returns whether the pointer is inside the region. */
export function inside(visual: DOMRect, clientX: number, clientY: number): boolean {
  return clientX >= visual.left && clientX <= visual.right
    && clientY >= visual.top && clientY <= visual.bottom
}

/** Offset-chain position of `el` within `ancestor` (both boxes), in the
 *  UNTRANSFORMED layout space — offsetLeft/offsetTop ignore transforms, so
 *  this stays exact while the pane is tilted. */
function localTopLeft(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node !== null && node !== ancestor) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y }
}

/**
 * The visible glass region of a pane in the pane's own local space
 * (untransformed — safe to measure while tilted). For the fused
 * composer+stats spot this is the union of the composer card and the docked
 * stats band; for the other panes it is the pane's own box.

 * @param spot - the stamped pane to measure.
 * @returns the pane's glass region in its own untransformed local space. */
export function glassLocalRect(spot: HTMLElement): { left: number; top: number; width: number; height: number } {
  const card = spot.querySelector<HTMLElement>('[data-composer-card]')
  if (card === null) {
    return { left: 0, top: 0, width: spot.offsetWidth, height: spot.offsetHeight }
  }
  const cardPos = localTopLeft(card, spot)
  let left = cardPos.x
  let top = cardPos.y
  let right = left + card.offsetWidth
  let bottom = top + card.offsetHeight
  const stats = spot.querySelector<HTMLElement>('[data-dsh-stats]')
  if (stats !== null) {
    const statsPos = localTopLeft(stats, spot)
    left = Math.min(left, statsPos.x)
    top = Math.min(top, statsPos.y)
    right = Math.max(right, statsPos.x + stats.offsetWidth)
    bottom = Math.max(bottom, statsPos.y + stats.offsetHeight)
  }
  return { left, top, width: right - left, height: bottom - top }
}

/** Ensure the pane carries exactly one glow overlay div.
 * @param spot - the stamped pane owning the glow.
 * @returns the pane's single glow overlay element. */
export function ensureGlow(spot: HTMLElement): HTMLElement {
  let glow = spot.querySelector<HTMLElement>(`:scope > [${GLOW_ATTR}]`)
  if (glow === null) {
    glow = document.createElement('div')
    glow.setAttribute(GLOW_ATTR, '')
    glow.setAttribute('aria-hidden', 'true')
    spot.appendChild(glow)
  }
  return glow
}

/**
 * One shared observer + resize feed: keeps the glow divs glued to the panes
 * through React re-renders and notifies the caller of DOM/layout changes
 * (the caller coalesces the callbacks).
 * @returns a disposer that removes every injected glow div.

 * @param onChange - callback fired on any DOM or layout change. */
export function startOverlayKeeper(onChange: () => void): () => void {
  const tick = (): void => {
    for (const spot of spotElements()) ensureGlow(spot)
    onChange()
  }
  tick()
  const observer = new MutationObserver(tick)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('resize', tick, { passive: true })
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', tick)
    for (const glow of document.querySelectorAll(`[${GLOW_ATTR}]`)) glow.remove()
  }
}
