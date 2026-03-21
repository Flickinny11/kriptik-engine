/**
 * BrainSection — Scroll-pinned interactive storytelling section for KripTik Brain.
 *
 * Three scroll phases over ~3vh of scroll distance:
 *   0-33%  Title + BrainOrbit3D zoom-in + stats counter
 *   33-66% Knowledge node cards fly out with Canvas2D edge lines
 *   66-100% Single node pulses, particle trail, closing statement
 *
 * Design_References.md: GSAP ScrollTrigger (pin/scrub), framer-motion springs,
 * react-vfx SHADER_NEURAL, Canvas2D overlay for edges, mouse parallax.
 */

import { useRef, useEffect, useState, Suspense, lazy, useCallback } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { VFXSpan } from 'react-vfx'
import { SHADER_NEURAL } from './LandingComponents'

const BrainOrbit3D = lazy(() => import('./BrainOrbit3D'))

gsap.registerPlugin(ScrollTrigger)

/* ─── Data ─── */

const STATS = [
  { val: '178', label: 'Integrations', countable: true },
  { val: '28', label: 'Quality Rules', countable: true },
  { val: '\u221E', label: 'Brain Capacity', countable: false },
]

const KNOWLEDGE_NODES = [
  { label: 'API Discovery', color: '#06b6d4', angle: 30 },
  { label: 'Design Patterns', color: '#c8ff64', angle: 90 },
  { label: 'Security Rules', color: '#f59e0b', angle: 150 },
  { label: 'Data Models', color: '#06b6d4', angle: 210 },
  { label: 'Rate Limits', color: '#f59e0b', angle: 270 },
  { label: 'Component Maps', color: '#c8ff64', angle: 330 },
]

/* ─── Helpers ─── */

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}

function nodePos(angle: number, radius: number, cx: number, cy: number) {
  const rad = (angle * Math.PI) / 180
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius }
}

/* ─── Component ─── */

export default function BrainSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef(0)
  const mouseRef = useRef({ x: 0, y: 0 })
  const isMobile = useIsMobile()

  const [phase, setPhase] = useState(0) // 0 = entering, 1 = nodes, 2 = pulse
  const [brainScale, setBrainScale] = useState(0.3)
  const [statsVisible, setStatsVisible] = useState(false)
  const [nodesVisible, setNodesVisible] = useState(false)
  const [activeNode, setActiveNode] = useState(-1)
  const [closingText, setClosingText] = useState(false)
  const [counters, setCounters] = useState<number[]>([0, 0, 0])

  /* Mouse parallax tracking */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      }
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  /* Counter animation */
  useEffect(() => {
    if (!statsVisible) return
    const targets = [178, 28, 0]
    const duration = 1200
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setCounters(targets.map((v) => Math.round(v * ease)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [statsVisible])

  /* GSAP ScrollTrigger */
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: '+=300%',
      pin: true,
      scrub: 0.8,
      onUpdate: (self) => {
        const p = self.progress
        progressRef.current = p

        if (p < 0.33) {
          setPhase(0)
          setBrainScale(0.3 + p * 2.1) // 0.3 -> 1.0
          setStatsVisible(p > 0.15)
          setNodesVisible(false)
          setActiveNode(-1)
          setClosingText(false)
        } else if (p < 0.66) {
          setPhase(1)
          setBrainScale(1.0)
          setStatsVisible(true)
          setNodesVisible(true)
          setActiveNode(-1)
          setClosingText(false)
        } else {
          setPhase(2)
          setBrainScale(1.0)
          setStatsVisible(true)
          setNodesVisible(true)
          setActiveNode(0)
          setClosingText(p > 0.78)
        }
      },
    })

    return () => st.kill()
  }, [])

  /* Canvas2D edge lines */
  const drawEdges = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || isMobile || !nodesVisible) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width = w * window.devicePixelRatio
    canvas.height = h * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    const cx = w / 2
    const cy = h / 2
    const radius = Math.min(w, h) * 0.32

    ctx.clearRect(0, 0, w, h)

    const time = performance.now() * 0.001

    KNOWLEDGE_NODES.forEach((node, i) => {
      const pos = nodePos(node.angle, radius, cx, cy)
      const isActive = activeNode === i

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = isActive ? node.color : `${node.color}44`
      ctx.lineWidth = isActive ? 2.5 : 1
      ctx.stroke()

      /* Animated dash for active node (particle trail feel) */
      if (isActive) {
        ctx.save()
        ctx.setLineDash([6, 12])
        ctx.lineDashOffset = -time * 60
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = node.color
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()

        /* Center pulse */
        const pulseR = 8 + Math.sin(time * 4) * 4
        ctx.beginPath()
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2)
        ctx.fillStyle = `${node.color}66`
        ctx.fill()
      }
    })
  }, [nodesVisible, activeNode, isMobile])

  useEffect(() => {
    let raf: number
    const loop = () => {
      drawEdges()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [drawEdges])

  /* Node positions with parallax */
  const getNodeStyle = (angle: number, depth: number) => {
    const section = sectionRef.current
    if (!section) return {}
    const w = section.offsetWidth
    const h = section.offsetHeight
    const radius = Math.min(w, h) * (isMobile ? 0.28 : 0.32)
    const pos = nodePos(angle, radius, w / 2, h / 2)
    const px = mouseRef.current.x * depth * 12
    const py = mouseRef.current.y * depth * 12
    return {
      left: pos.x + px,
      top: pos.y + py,
      transform: 'translate(-50%, -50%)',
    }
  }

  const titleOpacity = phase === 0 ? Math.min(progressRef.current * 6, 1) : 1
  const titleScale = phase === 0 ? 0.85 + progressRef.current * 0.45 : 1

  return (
    <section
      ref={sectionRef}
      className="brain-section relative w-full overflow-hidden"
      style={{ minHeight: '100vh' }}
    >
      {/* 3D Brain background */}
      <div
        className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `scale(${brainScale})`,
          opacity: 0.3 + brainScale * 0.5,
          transition: 'transform 0.1s linear, opacity 0.1s linear',
        }}
      >
        <Suspense fallback={null}>
          <BrainOrbit3D />
        </Suspense>
      </div>

      {/* Canvas2D overlay for edge lines */}
      {!isMobile && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        />
      )}

      {/* Title */}
      <div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none"
        style={{
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
          transition: 'opacity 0.15s, transform 0.15s',
        }}
      >
        <h2 className="text-5xl md:text-7xl font-bold text-white text-center mb-6 pointer-events-auto">
          <VFXSpan shader={SHADER_NEURAL}>A Brain, Not a Pipeline</VFXSpan>
        </h2>

        {/* Stats */}
        <div
          className="flex gap-8 md:gap-16 mt-4"
          style={{
            opacity: statsVisible ? 1 : 0,
            transform: statsVisible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          {STATS.map((s, i) => (
            <div key={s.label} className="text-center">
              <div
                className="text-3xl md:text-5xl font-black"
                style={{ color: i === 0 ? '#c8ff64' : i === 1 ? '#06b6d4' : '#f59e0b' }}
              >
                {s.countable ? counters[i] : s.val}
              </div>
              <div className="text-sm md:text-base text-white/60 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Knowledge node cards */}
      {nodesVisible &&
        KNOWLEDGE_NODES.map((node, i) => {
          const depth = 0.5 + (i % 3) * 0.3
          const isActive = activeNode === i
          const dimmed = activeNode >= 0 && !isActive

          return (
            <motion.div
              key={node.label}
              className="absolute z-30 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap select-none"
              style={{
                ...getNodeStyle(node.angle, depth),
                background: 'rgba(10, 10, 20, 0.85)',
                border: `1.5px solid ${isActive ? node.color : `${node.color}66`}`,
                boxShadow: isActive
                  ? `0 0 20px ${node.color}44, 0 0 40px ${node.color}22`
                  : `0 0 8px ${node.color}22`,
                color: node.color,
                opacity: dimmed ? 0.4 : 1,
                transition: 'opacity 0.4s, box-shadow 0.4s, border-color 0.4s',
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: dimmed ? 0.4 : 1 }}
              transition={{ type: 'spring' as const, stiffness: 260, damping: 20, delay: i * 0.08 }}
            >
              {node.label}
            </motion.div>
          )
        })}

      {/* Closing text (Phase 3) */}
      <div
        className="absolute bottom-[15%] left-0 right-0 z-30 text-center pointer-events-none"
        style={{
          opacity: closingText ? 1 : 0,
          transform: closingText ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
        }}
      >
        <p className="text-xl md:text-2xl text-white/90 font-medium max-w-xl mx-auto px-4">
          Every discovery becomes intelligence for all.
        </p>
      </div>
    </section>
  )
}
