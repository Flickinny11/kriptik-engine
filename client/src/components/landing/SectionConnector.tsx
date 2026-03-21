/**
 * SectionConnector — Animated flowing connector between landing page sections
 * Replaces static gradient lines with a living particle flow.
 * Design_References.md §6 — scroll-driven animation
 */

import { useRef, useEffect } from 'react'

interface Props {
  fromColor?: string
  toColor?: string
  height?: number
}

export default function SectionConnector({
  fromColor = '#c8ff64',
  toColor = '#06b6d4',
  height = 120,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let destroyed = false
    const dpr = Math.min(window.devicePixelRatio, 2)

    function resize() {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }
    resize()

    // Particles flowing downward along center line
    const particles: { y: number; speed: number; size: number; alpha: number }[] = []
    for (let i = 0; i < 8; i++) {
      particles.push({
        y: Math.random(),
        speed: 0.003 + Math.random() * 0.004,
        size: 1.5 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.5,
      })
    }

    function draw() {
      if (destroyed || !ctx || !canvas) return
      const w = canvas.width
      const h = canvas.height

      ctx.clearRect(0, 0, w, h)

      // Central gradient line
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, fromColor + '30')
      grad.addColorStop(0.5, fromColor + '18')
      grad.addColorStop(1, toColor + '30')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(w / 2, 0)
      ctx.lineTo(w / 2, h)
      ctx.stroke()

      // Flowing particles
      particles.forEach((p) => {
        p.y += p.speed
        if (p.y > 1.1) p.y = -0.1

        const py = p.y * h
        const t = p.y // 0 to 1
        const r1 = parseInt(fromColor.slice(1, 3), 16)
        const g1 = parseInt(fromColor.slice(3, 5), 16)
        const b1 = parseInt(fromColor.slice(5, 7), 16)
        const r2 = parseInt(toColor.slice(1, 3), 16)
        const g2 = parseInt(toColor.slice(3, 5), 16)
        const b2 = parseInt(toColor.slice(5, 7), 16)
        const r = Math.round(r1 + (r2 - r1) * t)
        const g = Math.round(g1 + (g2 - g1) * t)
        const b = Math.round(b1 + (b2 - b1) * t)

        ctx.beginPath()
        ctx.arc(w / 2, py, p.size * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`
        ctx.fill()

        // Glow
        ctx.beginPath()
        ctx.arc(w / 2, py, p.size * 3 * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha * 0.15})`
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    window.addEventListener('resize', resize)
    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [fromColor, toColor])

  return (
    <div className="relative" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  )
}
