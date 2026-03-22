/**
 * CodeRain — Canvas2D falling code tokens
 * Subtle background effect communicating "this generates code"
 * Uses JetBrains Mono, kriptik-lime at low opacity
 */

import React, { useRef, useEffect, useState } from 'react'

const TOKENS = [
  'const', 'function', 'return', 'async', 'await', 'import', 'export',
  'interface', 'type', 'class', 'let', 'for', 'map', 'filter',
  'useState', 'useEffect', 'render', 'fetch', 'Promise',
  'deploy', 'build', 'test', 'query', 'agent', 'brain',
  '<div>', '</>', '{...}', '()', '=>', '===', '??',
]

interface Drop {
  x: number; y: number; vy: number
  token: string; opacity: number; size: number
}

interface Props {
  className?: string
  opacity?: number
  density?: number
  speed?: number
}

function makeDrop(w: number, h: number, randomY: boolean): Drop {
  return {
    x: Math.random() * w,
    y: randomY ? Math.random() * h : -(20 + Math.random() * 60),
    vy: 0.3 + Math.random() * 0.8,
    token: TOKENS[Math.floor(Math.random() * TOKENS.length)],
    opacity: 0.15 + Math.random() * 0.45,
    size: 10 + Math.random() * 3,
  }
}

const CodeRain = React.memo(function CodeRain({
  className = '', opacity = 0.08, density = 30, speed = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  // Pause RAF when off-screen
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: '100px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let drops: Drop[] = []

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      drops = Array.from({ length: density }, () =>
        makeDrop(canvas.width, canvas.height, true)
      )
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const { width: w, height: h } = canvas
      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i]
        d.y += d.vy * speed

        const fadeIn = Math.min(1, d.y / 80)
        const fadeOut = Math.min(1, (h - d.y) / 150)
        const a = d.opacity * fadeIn * fadeOut

        if (a > 0.01) {
          ctx.font = `${d.size}px "JetBrains Mono", monospace`
          ctx.fillStyle = `rgba(200,255,100,${a})`
          ctx.fillText(d.token, d.x, d.y)
        }

        if (d.y > h + 30) drops[i] = makeDrop(w, h, false)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [density, speed, visible])

  return (
    <canvas ref={canvasRef} className={className}
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }} />
  )
})

export default CodeRain
