import { useCallback, useRef } from 'react'

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bb5', '#c084fc']

export function useConfetti() {
  const ref = useRef<HTMLDivElement>(null)

  const fire = useCallback(() => {
    const el = ref.current
    if (!el) return
    const pieces: HTMLDivElement[] = []
    for (let i = 0; i < 80; i++) {
      const piece = document.createElement('div')
      piece.style.cssText = `
        position: absolute;
        width: ${6 + Math.random() * 8}px;
        height: ${6 + Math.random() * 8}px;
        background: ${COLORS[Math.floor(Math.random() * COLORS.length)]};
        left: ${Math.random() * 100}%;
        top: -10px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation: confettiFall ${1.5 + Math.random() * 2}s linear forwards;
        animation-delay: ${Math.random() * 0.5}s;
        opacity: 0.9;
      `
      el.appendChild(piece)
      pieces.push(piece)
    }
    setTimeout(() => pieces.forEach(p => p.remove()), 4000)
  }, [])

  return { ref, fire }
}
