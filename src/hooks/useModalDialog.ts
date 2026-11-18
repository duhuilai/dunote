import { useEffect, useRef, type RefObject } from 'react'

interface ModalDialogOptions {
  open: boolean
  onClose: () => void
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModalDialog({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
}: ModalDialogOptions) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusDialog = window.requestAnimationFrame(() => {
      const root = dialogRef.current
      const initial = initialFocusRef?.current
      if (initial) {
        initial.focus()
        return
      }
      const first = root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (first) {
        first.focus()
      } else {
        root?.focus()
      }
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0)

      if (focusable.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusDialog)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [dialogRef, initialFocusRef, open])
}
