/**
 * DeploySection — GSAP ScrollTrigger horizontal-scroll deployment pipeline.
 * Replaces DeployGrid.tsx. Vertical scroll maps to horizontal progress through
 * four stages: Write -> Verify -> Deploy -> Live.
 * Mobile: stages stack vertically with scroll-in reveals.
 * Design_References.md — GSAP ScrollTrigger, framer-motion micro-interactions
 */
import { useRef, useEffect, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from 'framer-motion'
import { VercelIcon, NetlifyIcon, AWSIcon } from '@/components/ui/icons'

gsap.registerPlugin(ScrollTrigger)

const DEPLOY_FEATURES = [
  { title: 'Real Databases', desc: 'PostgreSQL, Supabase, migrations, seed data.', color: '#c8ff64', stage: 0 },
  { title: 'Real APIs', desc: '178 integrations. OAuth, webhooks, all wired.', color: '#06b6d4', stage: 0 },
  { title: 'Continuous Verification', desc: '28 quality rules enforced in real-time.', color: '#f59e0b', stage: 1 },
  { title: 'Real Infrastructure', desc: 'Vercel, AWS, Netlify, Cloudflare.', color: '#c8ff64', stage: 2 },
  { title: 'Full Source Code', desc: 'Every line is yours. No lock-in.', color: '#06b6d4', stage: 3 },
  { title: 'Ship in Your Sleep', desc: 'Builds run autonomously for 24 hours.', color: '#f59e0b', stage: 3 },
]

const CODE_LINES = [
  { kw: 'import', rest: ' { createApp } from ', str: "'kriptik'", c: '#86efac' },
  { kw: 'const', rest: ' app = createApp({', str: '', c: '#86efac' },
  { kw: '  database:', rest: ' ', str: "'supabase'", c: '#c8ff64' },
  { kw: '  auth:', rest: ' ', str: "'better-auth'", c: '#c8ff64' },
  { kw: '  apis:', rest: ' [', str: "'stripe', 'resend'", c: '#06b6d4' },
  { kw: '  deploy:', rest: ' ', str: "'vercel'", c: '#06b6d4' },
  { kw: '})', rest: '', str: '', c: '#86efac' },
  { kw: 'app', rest: '.', str: 'build()', c: '#f59e0b' },
]

const BADGES = [
  { label: 'TypeScript', color: '#3b82f6' },
  { label: 'Security', color: '#22c55e' },
  { label: 'No Placeholders', color: '#f59e0b' },
  { label: 'Intent Satisfied', color: '#c8ff64' },
]

const springIn = { type: 'spring' as const, stiffness: 120, damping: 14 }
const badgeV = {
  hidden: { opacity: 0, scale: 0.7, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springIn },
}

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setM(mq.matches)
    const h = (e: MediaQueryListEvent) => setM(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return m
}

const CodeBlock = ({ refs, dim }: { refs?: React.MutableRefObject<(HTMLDivElement | null)[]>; dim?: boolean }) => (
  <>
    {CODE_LINES.map((l, i) => (
      <div key={i} ref={refs ? el => { refs.current[i] = el } : undefined}
        className={`py-0.5${refs ? ' opacity-0' : ''}`}>
        <span style={{ color: l.c }}>{l.kw}</span>
        <span className={dim ? 'text-zinc-500' : 'text-zinc-400'}>{l.rest}</span>
        {l.str && <span className={dim ? 'text-cyan-300/60' : 'text-cyan-300'}>{l.str}</span>}
      </div>
    ))}
  </>
)

const Dots = ({ px = 12 }: { px?: number }) => (
  <div className="flex items-center gap-1.5">
    {['bg-red-500/60', 'bg-yellow-500/60', 'bg-green-500/60'].map(bg => (
      <span key={bg} className={`rounded-full ${bg}`} style={{ width: px, height: px }} />
    ))}
  </div>
)

const PlatformLogos = ({ iconSize = 20, boxSize = 40 }: { iconSize?: number; boxSize?: number }) => (
  <div className="flex gap-4 items-center">
    {[
      { I: VercelIcon, c: 'text-white' },
      { I: AWSIcon, c: 'text-[#ff9900]' },
      { I: NetlifyIcon, c: 'text-[#00c7b7]' },
    ].map(({ I, c }) => (
      <div key={c} className="rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center"
        style={{ width: boxSize, height: boxSize }}>
        <I size={iconSize} className={c} />
      </div>
    ))}
  </div>
)

const FeatBadge = ({ f, cls }: { f: typeof DEPLOY_FEATURES[0]; cls?: string }) => (
  <div className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${cls || ''}`}
    style={{ color: f.color, borderColor: `${f.color}30`, background: `${f.color}08`, boxShadow: `0 0 16px ${f.color}15` }}>
    {f.title}
  </div>
)

/* ── Desktop horizontal pipeline ─────────────────────── */
function DesktopPipeline() {
  const wrapRef = useRef<HTMLDivElement>(null), trackRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null), dotRef = useRef<HTMLDivElement>(null)
  const scanRef = useRef<HTMLDivElement>(null), cubeRef = useRef<HTMLDivElement>(null)
  const browserRef = useRef<HTMLDivElement>(null), liveBadgeRef = useRef<HTMLDivElement>(null)
  const platformRef = useRef<HTMLDivElement>(null)
  const codeRefs = useRef<(HTMLDivElement | null)[]>([])
  const badgeRefs = useRef<(HTMLDivElement | null)[]>([])
  const featRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const wrap = wrapRef.current, track = trackRef.current
    if (!wrap || !track) return
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: wrap, start: 'top top', end: () => `+=${innerHeight * 3}`,
        pin: true, scrub: 1, invalidateOnRefresh: true,
      },
    })
    tl.to(track, { x: -(track.scrollWidth - innerWidth), ease: 'none', duration: 1 }, 0)
    tl.to(railRef.current, { scaleX: 1, ease: 'none', duration: 1 }, 0)
    tl.to(dotRef.current, { left: '100%', ease: 'none', duration: 1 }, 0)
    // Write: code lines
    codeRefs.current.forEach((el, i) => el && tl.fromTo(el, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.02 }, i * 0.02))
    // Verify: scan + badges
    tl.fromTo(scanRef.current, { top: '0%', opacity: 0 }, { top: '100%', opacity: 1, duration: 0.15 }, 0.22)
    badgeRefs.current.forEach((el, i) => el && tl.fromTo(el, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.04 }, 0.28 + i * 0.03))
    // Deploy: cube + platforms
    tl.to(cubeRef.current, { scale: 0.4, rotateY: 45, rotateX: 20, y: -60, x: 80, duration: 0.15 }, 0.5)
    tl.fromTo(platformRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.08 }, 0.62)
    // Live: browser + badge
    tl.fromTo(browserRef.current, { opacity: 0, scale: 0.85, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: 0.12 }, 0.7)
    tl.fromTo(liveBadgeRef.current, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.06, ease: 'back.out(2)' }, 0.82)
    // Feature badges
    featRefs.current.forEach((el, i) => el && tl.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.06 }, DEPLOY_FEATURES[i].stage * 0.25 + 0.1))
    return () => { ScrollTrigger.getAll().forEach(s => s.kill()) }
  }, [])

  const panel = 'rounded-xl border border-white/[0.08] p-6'
  const panelBg = { background: 'linear-gradient(135deg, #0a0a0a, #111)' }
  const panelShadow = '0 20px 60px rgba(0,0,0,0.5)'

  return (
    <div ref={wrapRef} className="relative overflow-hidden" style={{ willChange: 'transform' }}>
      {/* Progress rail */}
      <div className="absolute bottom-24 left-12 right-12 h-[2px] bg-white/[0.06] z-10 rounded-full">
        <div ref={railRef} className="absolute inset-0 rounded-full origin-left"
          style={{ background: 'linear-gradient(90deg, #c8ff64, #06b6d4, #f59e0b)', transform: 'scaleX(0)' }} />
        <div ref={dotRef} className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
          style={{ left: '0%', background: '#c8ff64', boxShadow: '0 0 16px #c8ff6480' }} />
      </div>
      {/* Horizontal track */}
      <div ref={trackRef} className="flex items-center" style={{ width: '400vw', height: '100vh' }}>
        {/* Write */}
        <div className="w-screen h-full flex items-center justify-center px-16">
          <div style={{ perspective: '1200px' }}>
            <div className={`${panel} font-mono text-sm`}
              style={{ ...panelBg, transform: 'rotateY(-8deg)', transformStyle: 'preserve-3d', width: 480, boxShadow: `${panelShadow}, inset 0 1px 0 rgba(255,255,255,0.04)` }}>
              <div className="flex items-center gap-1.5 mb-4">
                <Dots /><span className="ml-3 text-xs text-zinc-600">app.ts</span>
              </div>
              <CodeBlock refs={codeRefs} />
            </div>
            <p className="text-center mt-6 text-sm font-semibold tracking-widest text-zinc-500 uppercase">Write</p>
          </div>
        </div>
        {/* Verify */}
        <div className="w-screen h-full flex items-center justify-center px-16">
          <div className="flex flex-col items-center gap-6">
            <div className={`relative ${panel} overflow-hidden`} style={{ ...panelBg, width: 480, boxShadow: panelShadow }}>
              <div ref={scanRef} className="absolute left-0 right-0 h-[3px] opacity-0"
                style={{ top: '0%', background: 'linear-gradient(90deg, transparent, #22c55e, transparent)', boxShadow: '0 0 30px #22c55e60, 0 0 80px #22c55e30' }} />
              <div className="font-mono text-sm"><CodeBlock dim /></div>
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              {BADGES.map((b, i) => (
                <div key={b.label} ref={el => { badgeRefs.current[i] = el }}
                  className="px-4 py-2 rounded-full text-xs font-bold border opacity-0"
                  style={{ color: b.color, borderColor: `${b.color}40`, background: `${b.color}10`, boxShadow: `0 0 16px ${b.color}20` }}>
                  {b.label} &#10003;
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold tracking-widest text-zinc-500 uppercase">Verify</p>
          </div>
        </div>
        {/* Deploy */}
        <div className="w-screen h-full flex items-center justify-center px-16">
          <div className="flex flex-col items-center gap-8">
            <div style={{ perspective: 800 }}>
              <div ref={cubeRef} className={panel}
                style={{ ...panelBg, width: 200, height: 200, transformStyle: 'preserve-3d', boxShadow: `${panelShadow}, 0 0 40px rgba(200,255,100,0.05)` }}>
                <div className="w-full h-full flex items-center justify-center text-zinc-600 font-mono text-xs">package.tar</div>
              </div>
            </div>
            <div ref={platformRef} className="opacity-0"><PlatformLogos /></div>
            <p className="text-sm font-semibold tracking-widest text-zinc-500 uppercase">Deploy</p>
          </div>
        </div>
        {/* Live */}
        <div className="w-screen h-full flex items-center justify-center px-16">
          <div className="flex flex-col items-center gap-4">
            <div ref={browserRef} className="rounded-xl border border-white/[0.08] overflow-hidden opacity-0"
              style={{ width: 520, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(200,255,100,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/80 border-b border-white/[0.06]">
                <Dots px={10} />
                <div className="flex-1 mx-3 px-3 py-1 rounded-md bg-zinc-800/60 text-[11px] text-zinc-400 font-mono">yourapp.kriptik.app</div>
                <div ref={liveBadgeRef} className="px-2 py-0.5 rounded text-[10px] font-bold opacity-0"
                  style={{ color: '#22c55e', background: '#22c55e15', boxShadow: '0 0 12px #22c55e30', animation: 'pulse 2s ease-in-out infinite' }}>LIVE</div>
              </div>
              <div className="bg-[#0a0a0a] p-4" style={{ height: 280 }}>
                <div className="h-8 rounded-md bg-zinc-800/40 mb-3 flex items-center px-3 gap-2">
                  <div className="w-16 h-3 rounded bg-zinc-700/50" /><div className="flex-1" />
                  <div className="w-10 h-3 rounded bg-zinc-700/40" /><div className="w-10 h-3 rounded bg-zinc-700/40" />
                </div>
                <div className="flex gap-3 h-[calc(100%-2.75rem)]">
                  <div className="w-28 rounded-md bg-zinc-800/30 p-2 flex flex-col gap-1.5">
                    {[70, 50, 60, 40].map(w => <div key={w} className="h-3 rounded bg-zinc-700/40" style={{ width: `${w}%` }} />)}
                  </div>
                  <div className="flex-1 rounded-md bg-zinc-800/20 p-3 flex flex-col gap-2">
                    <div className="h-4 w-3/4 rounded bg-zinc-700/30" />
                    <div className="h-3 w-full rounded bg-zinc-700/20" />
                    <div className="h-3 w-5/6 rounded bg-zinc-700/20" />
                    <div className="flex-1 rounded-md bg-zinc-800/30 mt-2" />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm font-semibold tracking-widest text-zinc-500 uppercase">Live</p>
          </div>
        </div>
      </div>
      {/* Feature badges */}
      <div className="absolute bottom-32 left-0 right-0 flex justify-center gap-4 flex-wrap px-8 z-10">
        {DEPLOY_FEATURES.map((f, i) => (
          <div key={f.title} ref={el => { featRefs.current[i] = el }}
            className="px-4 py-2 rounded-full text-xs font-semibold border opacity-0 backdrop-blur-sm"
            style={{ color: f.color, borderColor: `${f.color}30`, background: `${f.color}08`, boxShadow: `0 0 20px ${f.color}15` }}>
            {f.title}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Mobile vertical pipeline ────────────────────────── */
function MobileStage({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <motion.div className="py-12 flex flex-col items-center gap-4"
      initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }} transition={{ type: 'spring' as const, stiffness: 80, damping: 18 }}>
      {children}
      <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">{label}</p>
    </motion.div>
  )
}

function MobilePipeline() {
  return (
    <div className="flex flex-col px-4">
      <MobileStage label="Write">
        <div className="rounded-xl border border-white/[0.08] p-4 font-mono text-xs w-full max-w-sm"
          style={{ background: 'linear-gradient(135deg, #0a0a0a, #111)' }}>
          <div className="mb-3"><Dots px={10} /></div>
          <CodeBlock />
        </div>
      </MobileStage>
      <MobileStage label="Verify">
        <div className="flex gap-2 flex-wrap justify-center">
          {BADGES.map((b, i) => (
            <motion.div key={b.label} variants={badgeV} initial="hidden" whileInView="visible"
              viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold border"
              style={{ color: b.color, borderColor: `${b.color}40`, background: `${b.color}10`, boxShadow: `0 0 12px ${b.color}20` }}>
              {b.label} &#10003;
            </motion.div>
          ))}
        </div>
      </MobileStage>
      <MobileStage label="Deploy"><PlatformLogos iconSize={16} boxSize={36} /></MobileStage>
      <MobileStage label="Live">
        <div className="rounded-xl border border-white/[0.08] overflow-hidden w-full max-w-sm"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900/80 border-b border-white/[0.06]">
            <Dots px={10} />
            <div className="flex-1 mx-2 px-2 py-0.5 rounded bg-zinc-800/60 text-[10px] text-zinc-400 font-mono">yourapp.kriptik.app</div>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: '#22c55e', background: '#22c55e15' }}>LIVE</span>
          </div>
          <div className="bg-[#0a0a0a] p-3 h-40">
            <div className="h-5 rounded bg-zinc-800/40 mb-2" />
            <div className="flex gap-2 h-[calc(100%-1.75rem)]">
              <div className="w-16 rounded bg-zinc-800/30" />
              <div className="flex-1 rounded bg-zinc-800/20" />
            </div>
          </div>
        </div>
      </MobileStage>
      <div className="flex flex-wrap justify-center gap-2 pt-4 pb-8">
        {DEPLOY_FEATURES.map((f, i) => (
          <motion.div key={f.title} variants={badgeV} initial="hidden" whileInView="visible"
            viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
            <FeatBadge f={f} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ── Main export ─────────────────────────────────────── */
export default function DeploySection() {
  const isMobile = useIsMobile()
  return (
    <section id="deploy" className="relative bg-black">
      <div className="text-center pt-24 pb-12 px-4">
        <h2 className="text-4xl md:text-5xl font-black text-white mb-4">From Prompt to Production</h2>
        <p className="text-zinc-500 text-lg max-w-xl mx-auto">Real infrastructure. Real verification. Real deployment.</p>
      </div>
      {isMobile ? <MobilePipeline /> : <DesktopPipeline />}
    </section>
  )
}
