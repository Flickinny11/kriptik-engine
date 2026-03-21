/**
 * CapabilitiesSection -- immersive scroll-pinned capability showcase
 *
 * GSAP ScrollTrigger pinned section (~4vh scrub) showing three capabilities
 * one at a time: Fix My App, Komplete My App, Train & Fine-Tune.
 * Mobile: stacked vertically with rich visuals, progress bars, and entrance animations.
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

const AMBER = '#f59e0b'
const CYAN = '#06b6d4'
const LIME = '#c8ff64'
const springTransition = { type: 'spring' as const, stiffness: 60, damping: 20 }
const completionSnippets = ['AuthProvider', 'useDatabase()', 'ApiRoutes', 'ErrorBoundary', 'PaymentFlow', 'DeployConfig']

function lerpColor(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)]
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`
}
function ringColor(p: number): string {
  return p < 0.5 ? lerpColor('#ef4444', AMBER, p * 2) : lerpColor(AMBER, LIME, (p - 0.5) * 2)
}

/* ── SVG icon glyphs for mobile cards ─────────────────────────── */
function CapIcon({ type, color }: { type: 'fix' | 'komplete' | 'train'; color: string }) {
  if (type === 'fix') return (
    <svg width={32} height={32} viewBox="0 0 36 36" fill="none">
      <path d="M8 28L28 8" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M22 4l6 2-4 4 4 4-2 6-6-2 4-4-4-4 2-6z" fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.5} />
      <circle cx={10} cy={26} r={4} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
    </svg>
  )
  if (type === 'komplete') return (
    <svg width={32} height={32} viewBox="0 0 36 36" fill="none">
      <circle cx={18} cy={18} r={14} stroke={color} strokeWidth={2} strokeDasharray="6 3" />
      <path d="M12 18l4 4 8-8" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  return (
    <svg width={32} height={32} viewBox="0 0 36 36" fill="none">
      <path d="M4 30 Q12 6 18 16 Q24 26 32 6" stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <circle cx={18} cy={16} r={3} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

/* ── Mobile-specific visualizations ───────────────────────────── */
function MobileLossCurve({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    const w = cvs.width, h = cvs.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(28, 6); ctx.lineTo(28, h - 14); ctx.lineTo(w - 6, h - 14); ctx.stroke()
    const pts = Math.max(2, Math.floor(progress * 80))
    ctx.beginPath(); ctx.strokeStyle = LIME; ctx.lineWidth = 2; ctx.shadowColor = LIME; ctx.shadowBlur = 4
    for (let i = 0; i <= pts; i++) {
      const t = i / 80, x = 28 + t * (w - 34), y = 6 + (Math.exp(-4 * t) * 0.85 + 0.05) * (h - 20)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke(); ctx.shadowBlur = 0
  }, [progress])
  return <canvas ref={canvasRef} width={280} height={120} className="w-full max-w-[280px] rounded-lg border border-lime-500/20 bg-black/40 mx-auto" />
}

function MobileProgressRing({ progress }: { progress: number }) {
  const pct = Math.round(40 + progress * 60), r = 60, circ = 2 * Math.PI * r
  const offset = circ * (1 - (0.4 + progress * 0.6))
  return (
    <div className="relative flex items-center justify-center mx-auto" style={{ width: 150, height: 150 }}>
      <svg width={150} height={150} viewBox="0 0 150 150">
        <circle cx={75} cy={75} r={r} fill="none" stroke="#1a1a2e" strokeWidth={8} />
        <circle cx={75} cy={75} r={r} fill="none" stroke={ringColor(progress)} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 75 75)" style={{ transition: 'stroke 0.15s' }} />
      </svg>
      <span className="absolute text-2xl font-bold tabular-nums" style={{ color: ringColor(progress) }}>{pct}%</span>
    </div>
  )
}

function MobileCodeComparison({ progress }: { progress: number }) {
  return (
    <div className="space-y-3 w-full">
      <div className="rounded-lg border border-red-500/40 bg-black/60 p-3 font-mono text-xs transition-opacity"
        style={{ opacity: Math.max(0.3, 1 - progress * 1.5) }}>
        <div className="text-red-400 text-[10px] mb-1 font-sans uppercase tracking-wider">Before</div>
        <pre className="text-red-300 whitespace-pre-wrap">{brokenCode}</pre>
      </div>
      <div className="rounded-lg border border-emerald-500/40 bg-black/60 p-3 font-mono text-xs transition-opacity"
        style={{ opacity: Math.max(0.15, Math.min(1, progress * 2)) }}>
        <div className="text-emerald-400 text-[10px] mb-1 font-sans uppercase tracking-wider">After</div>
        <pre className="text-emerald-300 whitespace-pre-wrap">{fixedCode}</pre>
      </div>
    </div>
  )
}

/* ── Mobile capability card ────────────────────────────────────── */
function MobileCapCard({ children, color, icon, }: { children: React.ReactNode; color: string; icon: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: false, margin: '-40px' })
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 60, scale: 0.9, rotateX: 8 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1, rotateX: 0 } : {}}
      transition={{ ...springTransition, stiffness: 50 }}
      className="rounded-2xl border p-6 mb-12 relative overflow-hidden"
      style={{
        borderColor: color,
        background: `radial-gradient(ellipse at 50% 0%, ${color}10 0%, transparent 60%), rgba(0,0,0,0.5)`,
        boxShadow: inView ? `0 0 40px ${color}15, 0 4px 24px rgba(0,0,0,0.4)` : `0 4px 24px rgba(0,0,0,0.4)`,
        backdropFilter: 'blur(8px)',
      }}>
      <motion.div className="absolute top-0 left-0 h-[3px]"
        initial={{ width: '0%' }} animate={inView ? { width: '100%' } : { width: '0%' }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          {icon}
        </div>
      </div>
      {children}
    </motion.div>
  )
}

/* ── Fix My App ────────────────────────────────────────────────── */
function FixMyApp({ progress, mobile }: { progress: number; mobile?: boolean }) {
  const scanX = `${progress * 100}%`
  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto px-4">
      <h3 className="text-3xl md:text-4xl font-bold mb-2">
        <VFXSpan shader={SHADER_GLITCH} style={{ color: AMBER }}>Fix My App</VFXSpan>
      </h3>
      <p className="text-neutral-400 text-center max-w-xl mb-8 text-sm md:text-base">
        Bring your broken project. We diagnose root causes, trace the architecture, and ship a real fix.
      </p>
      {mobile ? <MobileCodeComparison progress={progress} /> : (
        <div className="relative w-full grid grid-cols-2 gap-4">
          <div className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
            style={{ left: scanX, background: `linear-gradient(to bottom, ${AMBER}, transparent)` }} />
          <div className="rounded-xl border border-red-500/40 bg-black/60 p-4 font-mono text-sm transition-opacity"
            style={{ opacity: Math.max(0.15, 1 - progress * 1.5) }}>
            <div className="text-red-400 text-xs mb-2 font-sans uppercase tracking-wider">Broken</div>
            <VFXSpan shader={SHADER_GLITCH}><pre className="text-red-300 whitespace-pre-wrap">{brokenCode}</pre></VFXSpan>
          </div>
          <div className="rounded-xl border border-emerald-500/40 bg-black/60 p-4 font-mono text-sm transition-opacity"
            style={{ opacity: Math.max(0.15, Math.min(1, progress * 2)) }}>
            <div className="text-emerald-400 text-xs mb-2 font-sans uppercase tracking-wider">Fixed</div>
            <pre className="text-emerald-300 whitespace-pre-wrap">{fixedCode}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Komplete My App ───────────────────────────────────────────── */
function KompleteMyApp({ progress, mobile }: { progress: number; mobile?: boolean }) {
  const pct = Math.round(40 + progress * 60)
  const visibleSnippets = Math.ceil(progress * completionSnippets.length)
  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4">
      <h3 className="text-3xl md:text-4xl font-bold mb-2">
        <VFXSpan shader={SHADER_HOLOGRAM} style={{ color: CYAN }}>Komplete My App</VFXSpan>
      </h3>
      <p className="text-neutral-400 text-center max-w-xl mb-8 text-sm md:text-base">
        Half-finished app collecting dust? Hand it over. We build the rest — fast, correct, production-grade.
      </p>
      {mobile ? <MobileProgressRing progress={progress} /> : (
        <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
          <svg width={240} height={240} viewBox="0 0 240 240" className="absolute inset-0">
            <circle cx={120} cy={120} r={90} fill="none" stroke="#1a1a2e" strokeWidth={12} />
            <circle cx={120} cy={120} r={90} fill="none" stroke={ringColor(progress)} strokeWidth={12}
              strokeDasharray={2 * Math.PI * 90} strokeDashoffset={2 * Math.PI * 90 * (1 - (0.4 + progress * 0.6))}
              strokeLinecap="round" transform="rotate(-90 120 120)" style={{ transition: 'stroke 0.15s' }} />
          </svg>
          <span className="text-4xl font-bold tabular-nums" style={{ color: ringColor(progress) }}>{pct}%</span>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
        {completionSnippets.slice(0, visibleSnippets).map((s, i) => (
          <motion.span key={s} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springTransition, delay: i * 0.06 }}
            className="px-3 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 text-cyan-300 text-xs font-mono">
            {s}
          </motion.span>
        ))}
      </div>
    </div>
  )
}

/* ── Train & Fine-Tune ─────────────────────────────────────────── */
function TrainFineTune({ progress, mobile }: { progress: number; mobile?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const accuracy = (60 + progress * 39.2).toFixed(1)

  useEffect(() => {
    if (mobile) return
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    const w = cvs.width, h = cvs.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(40, h - 20); ctx.lineTo(w - 10, h - 20); ctx.stroke()
    const pts = Math.max(2, Math.floor(progress * 120))
    ctx.beginPath(); ctx.strokeStyle = LIME; ctx.lineWidth = 2.5; ctx.shadowColor = LIME; ctx.shadowBlur = 6
    for (let i = 0; i <= pts; i++) {
      const t = i / 120, x = 40 + t * (w - 50), y = 10 + (Math.exp(-4 * t) * 0.85 + 0.05) * (h - 30)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke(); ctx.shadowBlur = 0
    ctx.fillStyle = '#666'; ctx.font = '10px monospace'
    ctx.fillText('Loss', 4, 16); ctx.fillText('Epoch', w - 40, h - 4)
  }, [progress, mobile])

  const dotCount = 5, dotSpeed = 0.3 + progress * 1.7
  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4">
      <h3 className="text-3xl md:text-4xl font-bold mb-2">
        <VFXSpan shader={SHADER_NEURAL} style={{ color: LIME }}>Train & Fine-Tune</VFXSpan>
      </h3>
      <p className="text-neutral-400 text-center max-w-xl mb-8 text-sm md:text-base">
        Custom AI models tuned to your data, your domain, your use case. From fine-tuning to deployment.
      </p>
      {mobile ? <MobileLossCurve progress={progress} /> : (
        <canvas ref={canvasRef} width={480} height={200}
          className="w-full max-w-lg rounded-xl border border-lime-500/20 bg-black/40 mb-4" />
      )}
      <div className="relative w-full max-w-lg h-12 overflow-hidden mt-4">
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="absolute w-full" style={{ top: row * 16, height: 2, background: '#1a1a2e' }}>
            {Array.from({ length: dotCount }).map((_, di) => (
              <div key={di} className="absolute w-2 h-2 rounded-full -top-[3px]"
                style={{ background: LIME, boxShadow: `0 0 6px ${LIME}`,
                  animation: `capDataDot ${(2 - dotSpeed + 0.3).toFixed(2)}s linear infinite`,
                  animationDelay: `${(di * (2 / dotCount)).toFixed(2)}s` }} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums" style={{ color: LIME }}>{accuracy}% accuracy</div>
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
      trigger: el, start: 'top top', end: '+=300%', pin: true, scrub: 0.8,
      onUpdate: (self) => setProgress(self.progress),
    })
    return () => { trigger.kill() }
  }, [])

  const segment = progress < 0.333 ? 0 : progress < 0.666 ? 1 : 2
  const segProgress = progress < 0.333 ? progress / 0.333
    : progress < 0.666 ? (progress - 0.333) / 0.333 : (progress - 0.666) / 0.334

  return (
    <div ref={containerRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <Suspense fallback={null}><FluidCanvas /></Suspense>
      <div className="relative z-10 w-full">
        {([0, 1, 2] as const).map((idx) => (
          <motion.div key={idx}
            animate={{ opacity: segment === idx ? 1 : 0, y: segment === idx ? 0 : 40 }}
            transition={springTransition}
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: segment === idx ? 'auto' : 'none' }}>
            {idx === 0 && <FixMyApp progress={segProgress} />}
            {idx === 1 && <KompleteMyApp progress={segProgress} />}
            {idx === 2 && <TrainFineTune progress={segProgress} />}
          </motion.div>
        ))}
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
    const makeObs = (ref: React.RefObject<HTMLDivElement | null>, setter: (v: number) => void) => {
      if (!ref.current) return
      const obs = new IntersectionObserver(([e]) => { setter(e.isIntersecting ? 1 : 0) }, { threshold: 0.5 })
      obs.observe(ref.current)
      observers.push(obs)
    }
    makeObs(fixRef, setFixProg)
    makeObs(kompRef, setKompProg)
    makeObs(trainRef, setTrainProg)
    return () => { observers.forEach((o) => o.disconnect()) }
  }, [])

  return (
    <div className="px-4 py-16 relative"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(100,100,140,0.08) 0%, transparent 70%)' }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px' }} />
      <div ref={fixRef}>
        <MobileCapCard color={AMBER} icon={<CapIcon type="fix" color={AMBER} />}>
          <FixMyApp progress={fixProg} mobile />
        </MobileCapCard>
      </div>
      <div ref={kompRef}>
        <MobileCapCard color={CYAN} icon={<CapIcon type="komplete" color={CYAN} />}>
          <KompleteMyApp progress={kompProg} mobile />
        </MobileCapCard>
      </div>
      <div ref={trainRef}>
        <MobileCapCard color={LIME} icon={<CapIcon type="train" color={LIME} />}>
          <TrainFineTune progress={trainProg} mobile />
        </MobileCapCard>
      </div>
    </div>
  )
}

/* ── Exported section ──────────────────────────────────────────── */
export default function CapabilitiesSection() {
  const [isMobile, setIsMobile] = useState(false)
  const checkMobile = useCallback(() => { setIsMobile(window.innerWidth < 768) }, [])
  useEffect(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [checkMobile])

  return (
    <section id="capabilities" className="relative">
      <style>{`@keyframes capDataDot { 0% { left: -4px; } 100% { left: 100%; } }`}</style>
      {isMobile ? <MobileCapabilities /> : <DesktopCapabilities />}
    </section>
  )
}
