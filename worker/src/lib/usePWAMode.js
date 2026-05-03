import { useEffect, useState } from 'react'

/**
 * Detects whether the app is running as an installed PWA (standalone display mode).
 *
 * - Modern browsers (Chrome, Safari, Edge, FF): use the `display-mode: standalone` media query
 * - iOS Safari (legacy): falls back to `window.navigator.standalone`
 *
 * Side effect: when in PWA mode, adds `pwa-mode` class to <html> so global CSS can
 * apply body padding for the bottom nav. Removes the class on unmount / when leaving
 * standalone (which doesn't really happen mid-session, but be safe).
 */
export function usePWAMode() {
  const [isPWA, setIsPWA] = useState(() => detectPWA())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mq = window.matchMedia('(display-mode: standalone)')
    const handler = () => setIsPWA(detectPWA())
    // Some browsers fire change when display mode changes (e.g. after install).
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else if (mq.addListener) mq.addListener(handler)

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else if (mq.removeListener) mq.removeListener(handler)
    }
  }, [])

  // Sync `pwa-mode` class on <html> for global CSS hooks (body padding).
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (isPWA) document.documentElement.classList.add('pwa-mode')
    else document.documentElement.classList.remove('pwa-mode')
  }, [isPWA])

  return isPWA
}

function detectPWA() {
  if (typeof window === 'undefined') return false
  // Standard
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari
  if (window.navigator && window.navigator.standalone === true) return true
  return false
}
