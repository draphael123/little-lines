import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Set false for flows the player must finish, such as the first-run tour. */
  dismissible?: boolean
  labelSuffix?: string
}

/** A modal with a real focus trap, Escape handling and restored focus. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  labelSuffix,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const titleId = useId()

  const focusables = useCallback(
    () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    [],
  )

  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement as HTMLElement | null
    const first = focusables()[0] ?? panel.current
    first?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      returnTo.current?.focus?.()
    }
  }, [open, focusables])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose, dismissible, focusables])

  if (!open) return null

  return (
    <div
      className="scrim"
      onPointerDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        tabIndex={-1}
      >
        <div className="dialog__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {labelSuffix && <p className="card__sub" style={{ marginTop: 6 }}>{labelSuffix}</p>}
          </div>
          {dismissible && (
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        {children}
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  )
}
