/**
 * BrainGraph — Canvas2D animated knowledge graph visualization
 * Represents KripTik's Brain: nodes connected by edges with data flow particles.
 * Nodes drift organically, repel from mouse, pulse with activity.
 * Labels: real KripTik concepts (Intent, Discovery, Architecture, etc.)
 */

import React, { useRef, useEffect } from 'react'

const LABELS = [
  'Intent', 'Discovery', 'Architecture', 'API', 'Design',
  'Code', 'Verify', 'Deploy', 'Constraint', 'Pattern',
  'Auth', 'Database', 'Route', 'Component', 'Style',
  'Test', 'Security', 'Schema', 'Agent', 'Brain',
]

const PAL: [number, number, number][] = [
  [200, 255, 100], [200, 255, 100], [6, 182, 212],
  [6, 182, 212], [245, 158, 11],
]

interface N { x: number; y: number; vx: number; vy: number; r: number; label: string; ci: number; ph: number; ps: number }
interface E { a: number; b: number; pp: number; ps: number }

const BrainGraph = React.memo(function BrainGraph({
  className = '', opacity = 0.55,
}: { className?: string; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0, nodes: N[] = [], edges: E[] = [], dpr = 1

    function init() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas!.offsetWidth, h = canvas!.offsetHeight
      canvas!.width = w * dpr; canvas!.height = h * dpr
      const cx = w / 2, cy = h / 2

      nodes = LABELS.map((label, i) => {
        const a = (i / LABELS.length) * Math.PI * 2 + Math.random() * 0.4
        const d = 60 + Math.random() * Math.min(w, h) * 0.3
        return {
          x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d,
          vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
          r: 2.5 + Math.random() * 3, label, ci: i % PAL.length,
          ph: Math.random() * Math.PI * 2, ps: 0.4 + Math.random() * 1.2,
        }
      })

      edges = []
      for (let i = 0; i < nodes.length; i++) {
        const sorted = nodes.map((n, j) => ({
          j, d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y),
        })).filter(d => d.j !== i).sort((a, b) => a.d - b.d)
        const c = 2 + Math.floor(Math.random() * 2)
        for (let k = 0; k < Math.min(c, sorted.length); k++) {
          const j = sorted[k].j
          if (!edges.some(e => (e.a === i && e.b === j) || (e.a === j && e.b === i))) {
            edges.push({ a: i, b: j, pp: Math.random(), ps: 0.001 + Math.random() * 0.004 })
          }
        }
      }
    }

    init()
    window.addEventListener('resize', init)
    const onMouse = (e: MouseEvent) => {
      const r = canvas!.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    window.addEventListener('mousemove', onMouse)

    let t = 0
    function draw() {
      t += 0.016
      const w = canvas!.offsetWidth, h = canvas!.offsetHeight
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, w, h)
      const m = mouseRef.current

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 30 || n.x > w - 30) n.vx *= -1
        if (n.y < 30 || n.y > h - 30) n.vy *= -1
        n.vx += (w / 2 - n.x) * 0.00002
        n.vy += (h / 2 - n.y) * 0.00002
        const dx = n.x - m.x, dy = n.y - m.y, dist = Math.hypot(dx, dy)
        if (dist < 120 && dist > 0) {
          const f = (120 - dist) / 120 * 0.25
          n.vx += (dx / dist) * f; n.vy += (dy / dist) * f
        }
        n.vx *= 0.994; n.vy *= 0.994
      }

      for (const e of edges) {
        const a = nodes[e.a], b = nodes[e.b]
        ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y)
        ctx!.strokeStyle = 'rgba(255,255,255,0.05)'; ctx!.lineWidth = 0.5; ctx!.stroke()
        e.pp = (e.pp + e.ps) % 1
        const px = a.x + (b.x - a.x) * e.pp, py = a.y + (b.y - a.y) * e.pp
        const [cr, cg, cb] = PAL[nodes[e.a].ci]
        ctx!.beginPath(); ctx!.arc(px, py, 1.2, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${cr},${cg},${cb},0.35)`; ctx!.fill()
      }

      for (const n of nodes) {
        const pulse = 0.5 + 0.5 * Math.sin(t * n.ps + n.ph)
        const [cr, cg, cb] = PAL[n.ci]
        const mDist = Math.hypot(n.x - m.x, n.y - m.y)
        const mGlow = Math.max(0, 1 - mDist / 180)

        const gr = n.r * (2.5 + mGlow * 3)
        const grad = ctx!.createRadialGradient(n.x, n.y, n.r * 0.3, n.x, n.y, gr)
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.12 + mGlow * 0.25).toFixed(2)})`)
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        ctx!.beginPath(); ctx!.arc(n.x, n.y, gr, 0, Math.PI * 2)
        ctx!.fillStyle = grad; ctx!.fill()

        ctx!.beginPath(); ctx!.arc(n.x, n.y, n.r * (0.9 + pulse * 0.2), 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${cr},${cg},${cb},${(0.5 + pulse * 0.4).toFixed(2)})`; ctx!.fill()

        if (n.r > 4 || mGlow > 0.25) {
          ctx!.fillStyle = `rgba(255,255,255,${(0.25 + mGlow * 0.45).toFixed(2)})`
          ctx!.font = '9px "Inter", sans-serif'
          ctx!.textAlign = 'center'
          ctx!.fillText(n.label, n.x, n.y + n.r + 13)
        }
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', init)
      window.removeEventListener('mousemove', onMouse)
    }
  }, [])

  return (
    <canvas ref={canvasRef} className={className}
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }} />
  )
})

export default BrainGraph
