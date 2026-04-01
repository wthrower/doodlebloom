import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface Transform { scale: number; tx: number; ty: number }

const MIN_SCALE = 0.5
const MAX_SCALE = 20

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function clampTransform(t: Transform): Transform {
  return { scale: clampScale(t.scale), tx: t.tx, ty: t.ty }
}

export interface UsePanZoomOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>
  wrapRef: RefObject<HTMLDivElement | null>
  canvasWidth: number
  canvasHeight: number
  /** Called on tap/click (no drag). Stored in a ref -- safe to pass an unstable function. */
  onTapRef: RefObject<(clientX: number, clientY: number) => void>
  /** Called on pointer move (for cursor updates etc). Stored in a ref. */
  onPointerMoveRef?: RefObject<((clientX: number, clientY: number) => void) | null>
  /** Called after every transform change (zoom, pan, resize). Stored in a ref. */
  onTransformChangeRef?: RefObject<(() => void) | null>
}

export function usePanZoom({
  canvasRef, wrapRef, canvasWidth, canvasHeight,
  onTapRef, onPointerMoveRef, onTransformChangeRef,
}: UsePanZoomOptions) {
  const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
  const displaySizeRef = useRef(0)
  const [, forceRender] = useState(0)

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return null
    const { tx, ty, scale } = transformRef.current
    const displayW = displaySizeRef.current || canvasWidth
    const wr = wrap.getBoundingClientRect()
    const lx = (clientX - wr.left - canvas.offsetLeft - tx) / scale
    const ly = (clientY - wr.top - canvas.offsetTop - ty) / scale
    const s = canvasWidth / displayW
    return { x: lx * s, y: ly * s }
  }, [canvasWidth, canvasHeight])

  const setTransform = useCallback((t: Transform) => {
    transformRef.current = t
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.transformOrigin = '0 0'
      canvas.style.transform = `translate(${t.tx}px,${t.ty}px) scale(${t.scale})`
    }
    onTransformChangeRef?.current?.()
    forceRender(n => n + 1)
  }, [])

  // --- ResizeObserver: fit canvas inside wrap, maintaining aspect ratio ---
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const aspect = canvasWidth / canvasHeight
      let w = width, h = width / aspect
      if (h > height) { h = height; w = height * aspect }
      displaySizeRef.current = w
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      onTransformChangeRef?.current?.()
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [canvasWidth, canvasHeight])

  // Initialize canvas context with willReadFrequently for faster getImageData
  useEffect(() => {
    canvasRef.current?.getContext('2d', { willReadFrequently: true })
  }, [])

  // --- Wheel + mouse + touch gesture listeners (non-passive) ---
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    // Mouse pan
    let mouseDown: { x: number; y: number; tx: number; ty: number; scale: number } | null = null
    let mouseDragged = false

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      mouseDown = { x: e.clientX, y: e.clientY, ...transformRef.current }
      mouseDragged = false
    }
    const onMouseMove = (e: MouseEvent) => {
      onPointerMoveRef?.current?.(e.clientX, e.clientY)
      if (!mouseDown) return
      const dx = e.clientX - mouseDown.x
      const dy = e.clientY - mouseDown.y
      if (!mouseDragged && Math.hypot(dx, dy) > 4) mouseDragged = true
      if (mouseDragged) {
        setTransform(clampTransform({ scale: mouseDown.scale, tx: mouseDown.tx + dx, ty: mouseDown.ty + dy }))
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (!mouseDown) return
      if (!mouseDragged) onTapRef.current(e.clientX, e.clientY)
      mouseDown = null
    }

    // Touch tracking
    const touches = new Map<number, { x: number; y: number }>()
    let pinchStart: { dist: number; midX: number; midY: number; scale: number; tx: number; ty: number } | null = null
    let panStart: { x: number; y: number; scale: number; tx: number; ty: number } | null = null
    let tapStart: { x: number; y: number; time: number } | null = null
    let twoFingerTapStart: number | null = null

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { tx, ty, scale } = transformRef.current
      if (e.ctrlKey) {
        const factor = Math.exp(-e.deltaY * 0.01)
        const newScale = clampScale(scale * factor)
        const r = wrap.getBoundingClientRect()
        const wx = e.clientX - r.left - canvas.offsetLeft
        const wy = e.clientY - r.top - canvas.offsetTop
        const lx = (wx - tx) / scale
        const ly = (wy - ty) / scale
        setTransform(clampTransform({ scale: newScale, tx: wx - lx * newScale, ty: wy - ly * newScale }))
      } else {
        setTransform(clampTransform({ scale, tx: tx - e.deltaX, ty: ty - e.deltaY }))
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) touches.set(t.identifier, { x: t.clientX, y: t.clientY })
      const all = [...touches.values()]
      if (all.length === 1) {
        const p = all[0]
        tapStart = { x: p.x, y: p.y, time: Date.now() }
        panStart = null
        pinchStart = null
      } else if (all.length >= 2) {
        tapStart = null
        panStart = null
        twoFingerTapStart = Date.now()
        const [a, b] = all
        pinchStart = {
          dist: Math.hypot(b.x - a.x, b.y - a.y),
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
          ...transformRef.current,
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) touches.set(t.identifier, { x: t.clientX, y: t.clientY })
      const all = [...touches.values()]

      if (all.length === 1) {
        const p = all[0]
        if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 8) {
          panStart = { x: p.x, y: p.y, ...transformRef.current }
          tapStart = null
        }
        if (panStart) {
          setTransform(clampTransform({ scale: panStart.scale, tx: panStart.tx + (p.x - panStart.x), ty: panStart.ty + (p.y - panStart.y) }))
        }
      } else if (all.length >= 2 && pinchStart) {
        const [a, b] = all
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const newScale = clampScale(pinchStart.scale * (dist / pinchStart.dist))
        const r = wrap.getBoundingClientRect()
        const ox = canvas.offsetLeft, oy = canvas.offsetTop
        const wStart = { x: pinchStart.midX - r.left - ox, y: pinchStart.midY - r.top - oy }
        const lx = (wStart.x - pinchStart.tx) / pinchStart.scale
        const ly = (wStart.y - pinchStart.ty) / pinchStart.scale
        const wNew = { x: midX - r.left - ox, y: midY - r.top - oy }
        setTransform(clampTransform({ scale: newScale, tx: wNew.x - lx * newScale, ty: wNew.y - ly * newScale }))
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
      const wasSingle = touches.size === 1
      for (const t of Array.from(e.changedTouches)) touches.delete(t.identifier)
      if (wasSingle && tapStart && Date.now() - tapStart.time < 300) {
        onTapRef.current(tapStart.x, tapStart.y)
      }
      if (touches.size === 0 && twoFingerTapStart && Date.now() - twoFingerTapStart < 400) {
        if (pinchStart) {
          const { scale, tx, ty } = transformRef.current
          const scaleChange = Math.abs(scale - pinchStart.scale)
          const panDist = Math.hypot(tx - pinchStart.tx, ty - pinchStart.ty)
          if (scaleChange < 0.15 && panDist < 15) setTransform({ scale: 1, tx: 0, ty: 0 })
        }
      }
      if (touches.size === 0) { pinchStart = null; panStart = null; tapStart = null; twoFingerTapStart = null }
    }

    const onTouchCancel = () => {
      touches.clear()
      pinchStart = null; panStart = null; tapStart = null; twoFingerTapStart = null
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setTransform({ scale: 1, tx: 0, ty: 0 })
    }

    wrap.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('touchstart', onTouchStart, { passive: false })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd, { passive: false })
    wrap.addEventListener('touchcancel', onTouchCancel)
    wrap.addEventListener('contextmenu', onContextMenu)
    return () => {
      wrap.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchCancel)
      wrap.removeEventListener('contextmenu', onContextMenu)
    }
  }, [canvasWidth, setTransform])

  const isZoomed = Math.abs(transformRef.current.scale - 1) > 0.05

  return { transformRef, displaySizeRef, setTransform, screenToCanvas, isZoomed }
}
