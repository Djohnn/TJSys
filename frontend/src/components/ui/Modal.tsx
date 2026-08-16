import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  actions?: ReactNode
  testId?: string
  closeLabel?: string
  closeDisabled?: boolean
  contentClassName?: string
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function Modal({
  open,
  title,
  children,
  onClose,
  actions,
  testId = 'modal',
  closeLabel = 'Fechar',
  closeDisabled = false,
  contentClassName = '',
}: ModalProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)

  useLayoutEffect(() => {
    onCloseRef.current = onClose
    closeDisabledRef.current = closeDisabled
  }, [closeDisabled, onClose])

  useLayoutEffect(() => {
    if (!open || !dialogRef.current) return
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = getFocusableElements(dialog)
    ;(focusable[0] ?? dialog).focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!closeDisabledRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const currentFocusable = getFocusableElements(dialog)
      if (currentFocusable.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
      const first = currentFocusable[0]
      const last = currentFocusable[currentFocusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null
  const titleId = `${testId}-title`

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget && !closeDisabledRef.current) onCloseRef.current()
      }}
    >
      <div
        ref={dialogRef}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] ${contentClassName}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-[var(--color-gray-900)]">{title}</h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => { if (!closeDisabledRef.current) onCloseRef.current() }}
            disabled={closeDisabled}
            className="min-h-11 min-w-11 rounded-[var(--radius-md)] text-xl leading-none text-[var(--color-gray-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div className="p-6">{children}</div>
        {actions && <div className="flex justify-end gap-3 border-t border-[var(--color-border)] bg-[var(--color-gray-100)] px-6 py-4">{actions}</div>}
      </div>
    </div>
  )
}

export default Modal
