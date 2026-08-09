/**
 * A hidden or backgrounded tab never fires requestAnimationFrame. That is
 * normally a kindness, but React Three Fiber waits on a rAF-driven measurement
 * of its container before it mounts the scene at all — so a map opened in a
 * background tab is not merely paused, it is never built, and stays a blank
 * canvas even after the tab comes forward.
 *
 * This falls back to a timer while the page is hidden and hands rAF straight
 * back the moment it is visible again, so a visible tab pays nothing.
 */
export function keepFramesComing() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // A tab that is visible at load gets measured straight away and needs none
  // of this. A tab hidden later should genuinely stop drawing.
  if (document.visibilityState === 'visible') return

  const real = window.requestAnimationFrame.bind(window)
  const cancel = window.cancelAnimationFrame.bind(window)
  const timers = new Set<number>()

  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    if (document.visibilityState === 'visible') return real(callback)
    const id = window.setTimeout(() => {
      timers.delete(id)
      callback(performance.now())
    }, 16)
    timers.add(id)
    return id
  }

  window.cancelAnimationFrame = (id: number) => {
    if (timers.has(id)) {
      timers.delete(id)
      window.clearTimeout(id)
      return
    }
    cancel(id)
  }

  // ResizeObserver is just as quiet in a hidden tab, and that is the other half
  // of what the canvas is waiting for. Nudge until the canvas has been given a
  // real backing size, rather than at a few guessed delays — the app is code
  // split, so how long it takes to mount is not something to guess at. An
  // unmeasured canvas keeps its 300x150 default, which is what this watches for.
  let attempts = 0
  const measured = () => {
    const canvas = document.querySelector('canvas')
    // an unmeasured canvas keeps the 300x150 HTML default
    return !!canvas && canvas.width > 300
  }
  const nudge = window.setInterval(() => {
    if (measured() || attempts++ > 60) {
      window.clearInterval(nudge)
      return
    }
    window.dispatchEvent(new Event('resize'))
  }, 200)

  // The reliable moment is when the tab is finally looked at: ResizeObserver
  // and rAF both come back, so one nudge here settles anything the polling
  // above did not. Timer throttling in a background tab makes the polling
  // best-effort, but this path is not throttled.
  document.addEventListener('visibilitychange', function shown() {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', shown)
    window.clearInterval(nudge)
    window.dispatchEvent(new Event('resize'))
  })
}
