/**
 * CapabilitiesSection -- immersive scroll-pinned capability showcase
 *
 * GSAP ScrollTrigger pinned section (~4vh scrub) showing three capabilities
 * one at a time: Fix My App, Komplete My App, Train & Fine-Tune.
 * Mobile: stacked vertically with simpler scroll-in animations.
 * Design_References.md -- GSAP ScrollTrigger, framer-motion springs, VFX shaders
 */

import { useRef, useEffect, useCallback, lazy, Suspense, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { VFXSpan } from 'react-vfx'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SHADER_GLITCH, SHADER_HOLOGRAM, SHADER_NEURAL } from './LandingComponents'

gsap.registerPlugin(ScrollTrigger)

const FluidCanvas = lazy(() => import('./FluidCanvas'))

/* ── code snippets ─────────────────────────────────────────────── */

const brokenCode = `function loadUser(id) {
  const data = fetch('/api/user')  // \u2190 wrong endpoint
  return data.name  // \u2190 no await
  // TODO: add error handling
}`

const fixedCode = `async function loadUser(id: string) {
  const res = await fetch(\`/api/users/\${id}\`)
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()).name
}`

/* ── constants ─────────────────────────────────────────────────── */

const AMBER = '#f59e0b'
const CYAN = '#06b6d4'
const LIME = '#c8ff64'

const springTransition = { type: 'spring' as const, stiffness: 60, damping: 20 }

/* ── utility: interpolate color ────────────────────────────────── */

function lerpColor(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)]
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `rgb(${r},${g},${bl})`
}

function ringColor(progress: number): string {
  if (progress < 0.5) return lerpColor('#ef4444', AMBER, progress * 2)
  return lerpColor(AMBER, LIME, (progress - 0.5) * 2)
}

/* ── Mobile capability card ────────────────────────────────────── */

function MobileCapCard({ children, color }: { children: React.ReactNode; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={springTransition}
      style={{ borderColor: color }}
      className="rounded-2xl border p-6 mb-12 bg-black/40 backdrop-blur-sm"
    >
      {children}
    </motion.div>
  )
}

/* ── Fix My App ────────────────────────────────────────────────── */

function FixMyApp({ progress }: { progress: number }) {
  const leftOpacity = 1 - progress * 1.5
  const rightOpacity = Math.min(1, progress * 2)
  const scanX = `${progress * 100}%`

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto px-4">
      <h3 className="text-3xl md:text-4xl font-bold mb-2">
        <VFXSpan shader={SHADER_GLITCH} style={{ color: AMBER }}>Fix My App</VFXSpan>
      </h3>
      <p className="text-neutral-400 text-center max-w-xl mb-8">
        Bring your broken project. We diagnose root causes, trace the architecture, and ship a real fix.
      </p>
      <div className="relative w-full grid grid-cols-2 gap-4">
        {/* scanning line */}
        <div
          className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
          style={{ left: scanX, background: `linear-gradient(to bottom, ${AMBER}, transparent)` }}
        />
        {/* broken panel */}
        <div
          className="rounded-xl border border-red-500/40 bg-black/60 p-4 font-mono text-sm transition-opacity"
          style={{ opacity: Math.max(0.15, leftOpacity) }}
        >
          <div className="text-red-400 text-xs mb-2 font-sans uppercase tracking-wider">Broken</div>
          <VFXSpan shader={SHADER_GLITCH}>
            <pre className="text-red-300 whitespace-pre-wrap">{brokenCode}</pre>
          </VFXSpan>
        </div>
        {/* fixed panel */}
        <div
          className="rounded-xl border border-emerald-500/40 bg-black/60 p-4 font-mono text-sm transition-opacity"
          style={{ opacity: Math.max(0.15, rightOpacity) }}
        >
          <div className="text-emerald-400 text-xs mb-2 font-sans uppercase tracking-wider">Fixed</div>
          <pre className="text-emerald-300 whitespace-pre-wrap">{fixedCode}</pre>
        </div>
      </div>
    </div>
  )
}

/* ── Komplete My App ───────────────────────────────────────────── */

const completionSnippets = [
  'AuthProvider',
  'useDatabase()',
  'ApiRoutes',
  'ErrorBoundary',
  'PaymentFlow',
  'DeployConfig',
]

function KompleteMyApp({ progress }: { progress: number }) {
  const pct = Math.round(40 + progress * 60)
  const ringFrac = 0.4 + progress * 0.6
  const r = 90
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - ringFrac)
  const visibleSnippets = Math.ceil(progress * completionSnippets.length)

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4">
      <h3 className="text-3xl md:text-4xl font-bold mb-2">
        <VFXSpan shader={SHADER_HOLOGRAM} style={{ color: CYAN }}>Komplete My App</VFXSpan>
      </h3>
      <p className="text-neutral-400 text-center max-w-xl mb-8">
        Half-finished app collecting dust? Hand it over. We build the rest — fast, correct, production-grade.
      </p>
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
        <svg width={240} height={240} viewBox="0 0 240 240" className="absolute inset-0">
          <circle cx={120} cy={120} r={r} fill="none" stroke="#1a1a2e" strokeWidth={12} />
          <circle
            cx={120} cy={120} r={r}
            fill="none"
            stroke={ringColor(progress)}
            strokeWidth={12}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 120 120)"
            style={{ transition: 'stroke 0.15s' }}
          />
        </svg>
        <span className="text-4xl font-bold tabular-nums" style={{ color: ringColor(progress) }}>
          {pct}%
        </span>
      </div>
      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
        {completionSnippets.slice(0, visibleSnippets).map((s, i) => (
          <motion.span
            key={s}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springTransition, delay: i * 0.06 }}
            className="px-3 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 text-cyan-300 text-xs font-mono"
          >
            {s}
          </motion.span>
        ))}
      </div>
    </div>
  )
}

/* ── Train & Fine-Tune ─────────────────────────────────────────── */

function TrainFineTune({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const accuracy = (60 + progress * 39.2).toFixed(1)

  // draw loss curve
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    const w = cvs.width
    const h = cvs.height
    ctx.clearRect(0, 0, w, h)

    // axes
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(40, 10)
    ctx.lineTo(40, h - 20)
    ctx.lineTo(w - 10, h - 20)
    ctx.stroke()

    // loss curve
    const points = Math.max(2, Math.floor(progress * 120))
    ctx.beginPath()
    ctx.strokeStyle = LIME
    ctx.lineWidth = 2.5
    ctx.shadowColor = LIME
    ctx.shadowBlur = 6
    for (let i = 0; i <= points; i++) {
      const t = i / 120
      const x = 40 + t * (w - 50)
      const loss = Math.exp(-4 * t) * 0.85 + 0.05
      const y = 10 + loss * (h - 30)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // labels
    ctx.fillStyle = '#666'
    ctx.font = '10px monospace'
    ctx.fillText('Loss', 4, 16)
    ctx.fillText('Epoch', w - 40, h - 4)
  }, [progress])

  // data-flow dots
  const dotCount = 5
  const dotSpeed = 0.3 + progress * 1.7

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4">
      <h3 className="text-3xl md:text-4xl font-bold mb-2">
        <VFXSpan shader={SHADER_NEURAL} style={{ color: LIME }}>Train & Fine-Tune</VFXSpan>
      </h3>
      <p className="text-neutral-400 text-center max-w-xl mb-8">
        Custom AI models tuned to your data, your domain, your use case. From fine-tuning to deployment.
      </p>
      <canvas
        ref={canvasRef}
        width={480}
        height={200}
        className="w-full max-w-lg rounded-xl border border-lime-500/20 bg-black/40 mb-4"
      />
      {/* data-flow lines */}
      <div className="relative w-full max-w-lg h-12 overflow-hidden">
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="absolute w-full" style={{ top: row * 16, height: 2, background: '#1a1a2e' }}>
            {Array.from({ length: dotCount }).map((_, di) => (
              <div
                key={di}
                className="absolute w-2 h-2 rounded-full -top-[3px]"
                style={{
                  background: LIME,
                  boxShadow: `0 0 6px ${LIME}`,
                  animation: `capDataDot ${(2 - dotSpeed + 0.3).toFixed(2)}s linear infinite`,
                  animationDelay: `${(di * (2 / dotCount)).toFixed(2)}s`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums" style={{ color: LIME }}>
        {accuracy}% accuracy
      </div>
    </div>
  )
}

/* ── Desktop pinned section ────────────────────────────────────── */

function DesktopCapabilities() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: '+=300%',
      pin: true,
      scrub: 0.8,
      onUpdate: (self) => setProgress(self.progress),
    })

    return () => { trigger.kill() }
  }, [])

  const segment = progress < 0.333 ? 0 : progress < 0.666 ? 1 : 2
  const segProgress = progress < 0.333
    ? progress / 0.333
    : progress < 0.666
      ? (progress - 0.333) / 0.333
      : (progress - 0.666) / 0.334

  return (
    <div ref={containerRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <Suspense fallback={null}>
        <FluidCanvas />
      </Suspense>

      {/* capability panels */}
      <div className="relative z-10 w-full">
        <motion.div
          animate={{ opacity: segment === 0 ? 1 : 0, y: segment === 0 ? 0 : 40 }}
          transition={springTransition}
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: segment === 0 ? 'auto' : 'none' }}
        >
          <FixMyApp progress={segProgress} />
        </motion.div>

        <motion.div
          animate={{ opacity: segment === 1 ? 1 : 0, y: segment === 1 ? 0 : 40 }}
          transition={springTransition}
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: segment === 1 ? 'auto' : 'none' }}
        >
          <KompleteMyApp progress={segProgress} />
        </motion.div>

        <motion.div
          animate={{ opacity: segment === 2 ? 1 : 0, y: segment === 2 ? 0 : 40 }}
          transition={springTransition}
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: segment === 2 ? 'auto' : 'none' }}
        >
          <TrainFineTune progress={segProgress} />
        </motion.div>
      </div>
    </div>
  )
}

/* ── Mobile stacked section ────────────────────────────────────── */

function MobileCapabilities() {
  const [fixProg, setFixProg] = useState(0)
  const [kompProg, setKompProg] = useState(0)
  const [trainProg, setTrainProg] = useState(0)
  const fixRef = useRef<HTMLDivElement>(null)
  const kompRef = useRef<HTMLDivElement>(null)
  const trainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observers: IntersectionObserver[] = []

    const makeObs = (
      ref: React.RefObject<HTMLDivElement | null>,
      setter: (v: number) => void,
    ) => {
      if (!ref.current) return
      const obs = new IntersectionObserver(
        ([entry]) => { setter(entry.isIntersecting ? 1 : 0) },
        { threshold: 0.5 },
      )
      obs.observe(ref.current)
      observers.push(obs)
    }

    makeObs(fixRef, setFixProg)
    makeObs(kompRef, setKompProg)
    makeObs(trainRef, setTrainProg)

    return () => { observers.forEach((o) => o.disconnect()) }
  }, [])

  return (
    <div className="px-4 py-16">
      <div ref={fixRef}>
        <MobileCapCard color={AMBER}>
          <FixMyApp progress={fixProg} />
        </MobileCapCard>
      </div>
      <div ref={kompRef}>
        <MobileCapCard color={CYAN}>
          <KompleteMyApp progress={kompProg} />
        </MobileCapCard>
      </div>
      <div ref={trainRef}>
        <MobileCapCard color={LIME}>
          <TrainFineTune progress={trainProg} />
        </MobileCapCard>
      </div>
    </div>
  )
}

/* ── Exported section ──────────────────────────────────────────── */

export default function CapabilitiesSection() {
  const [isMobile, setIsMobile] = useState(false)

  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  useEffect(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [checkMobile])

  return (
    <section id="capabilities" className="relative">
      <style>{`
        @keyframes capDataDot {
          0% { left: -4px; }
          100% { left: 100%; }
        }
      `}</style>
      {isMobile ? <MobileCapabilities /> : <DesktopCapabilities />}
    </section>
  )
}
