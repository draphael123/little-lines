/**
 * One honest capability check. The result decides whether the canvas is
 * mounted at all — the fallback never covers a working canvas, and a working
 * canvas is never replaced by the fallback.
 */
let cached: boolean | null = null

export function detectWebGL(): boolean {
  if (cached !== null) return cached
  if (typeof document === 'undefined') {
    cached = false
    return cached
  }
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    cached = !!gl
    const lose = (gl as WebGLRenderingContext | null)?.getExtension?.('WEBGL_lose_context')
    lose?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

/** Test hook. */
export function resetWebGLDetection(value: boolean | null = null) {
  cached = value
}
