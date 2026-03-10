import { useEffect, useState, type RefObject } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  scrollRef: RefObject<HTMLElement | null>
}

export function ScrollChevrons({ scrollRef }: Props) {
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      setCanLeft(el.scrollLeft > 1)
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [scrollRef])

  const scroll = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.25, behavior: 'smooth' })
  }

  return (
    <>
      <button
        className={`scroll-chevron scroll-chevron-left${canLeft ? ' visible' : ''}`}
        onClick={() => scroll(-1)}
        aria-label="Scroll left"
      >
        <ChevronLeft size={16} strokeWidth={3} />
      </button>
      <button
        className={`scroll-chevron scroll-chevron-right${canRight ? ' visible' : ''}`}
        onClick={() => scroll(1)}
        aria-label="Scroll right"
      >
        <ChevronRight size={16} strokeWidth={3} />
      </button>
    </>
  )
}
