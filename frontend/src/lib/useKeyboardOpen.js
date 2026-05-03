import { useEffect, useState } from 'react'

/**
 * Detects whether the on-screen keyboard is currently open on a mobile device.
 *
 * Strategy: when the keyboard opens, the visualViewport (the visible portion
 * of the page) shrinks vertically while the layout viewport stays the same.
 * If `visualViewport.height` is meaningfully smaller than `window.innerHeight`,
 * the keyboard is up.
 *
 * Threshold: 150px difference catches most virtual keyboards (typically
 * 280–340px on phones) without false-positive on browser chrome appearing.
 *
 * Falls back to focusin/focusout heuristics on browsers without visualViewport
 * (very rare in 2025+ — Safari 13+, Chrome 61+ have it).
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.visualViewport) {
      const vv = window.visualViewport
      let lastReportedOpen = false

      const check = () => {
        const heightDelta = window.innerHeight - vv.height
        const isOpen = heightDelta > 150
        if (isOpen !== lastReportedOpen) {
          lastReportedOpen = isOpen
          setOpen(isOpen)
        }
      }

      vv.addEventListener('resize', check)
      vv.addEventListener('scroll', check)
      check()

      return () => {
        vv.removeEventListener('resize', check)
        vv.removeEventListener('scroll', check)
      }
    }

    // Fallback: focusin / focusout on text-entry inputs
    const isTypingInput = (el) => {
      if (!el) return false
      const tag = el.tagName
      if (tag === 'TEXTAREA') return true
      if (tag === 'INPUT') {
        const type = (el.type || 'text').toLowerCase()
        // Treat selects, dates, checkboxes etc. as not opening a keyboard
        return ['text', 'email', 'tel', 'password', 'search', 'url', 'number'].includes(type)
      }
      // Contenteditable
      if (el.isContentEditable) return true
      return false
    }

    const onFocusIn = (e) => { if (isTypingInput(e.target)) setOpen(true) }
    const onFocusOut = () => setOpen(false)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return open
}
