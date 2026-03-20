/**
 * KripTik AI Landing Page — 10/10 Immersive Experience
 *
 * Design_References.md usage (10 techniques):
 * - R3F + custom GLSL (Hero3D ray-marched SDF metaballs) + @react-three/postprocessing (Bloom)
 * - GSAP + ScrollTrigger (pinned scroll storytelling, 3D parallax, counter animations)
 * - Lenis (butter-smooth scroll synced with ScrollTrigger)
 * - react-vfx (5 custom GLSL shaders: liquid warp, electric, hologram, glitch, neural)
 * - mouse-follower (Cuberto cursor with skew + magnetic snap)
 * - simplex-noise (NoiseField procedural canvas backgrounds)
 * - Canvas2D (CodeRain falling tokens, BrainGraph knowledge graph)
 * - SDF ray marching, FBM, domain warping, chromatic aberration (Hero shader)
 */

import { useRef, useEffect, Suspense, lazy, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { VFXProvider, VFXSpan } from 'react-vfx'
import { useUserStore } from '@/store/useUserStore'
import { KriptikLogo } from '@/components/ui/KriptikLogo'
import { GitHubIcon, DiscordIcon } from '@/components/ui/icons'
import LandingAuth from '@/components/landing/LandingAuth'
import {
  SHADER_LIQUID_WARP, SHADER_ELECTRIC, SHADER_HOLOGRAM, SHADER_NEURAL,
  BUILD_TYPES, BUILD_DATA, CAPABILITIES,
  RotatingBuildType, PlatformCarousel,
} from '@/components/landing/LandingComponents'
import { useLandingAnimations } from '@/components/landing/useLandingAnimations'

gsap.registerPlugin(ScrollTrigger)

const Hero3D = lazy(() => import('@/components/landing/Hero3D'))
const NoiseField = lazy(() => import('@/components/landing/NoiseField'))
const CodeRain = lazy(() => import('@/components/landing/CodeRain'))
const BrainGraph = lazy(() => import('@/components/landing/BrainGraph'))

/* ═══════════════════════════════════════════
   BRAIN STATS — real numbers from the engine
   ═══════════════════════════════════════════ */
const STATS = [
  { val: '178', label: 'Integrations', countable: true },
  { val: '28', label: 'Quality Rules', countable: true },
  { val: '\u221E', label: 'Brain Capacity', countable: false },
]

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useUserStore()

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, isLoading, navigate])

  /* ─── Lenis Smooth Scroll (Design_References.md §6) ─── */
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })
    lenis.on('scroll', ScrollTrigger.update)
    const tickerCb = (time: number) => { lenis.raf(time * 1000) }
    gsap.ticker.add(tickerCb)
    gsap.ticker.lagSmoothing(0)
    return () => { gsap.ticker.remove(tickerCb); lenis.destroy() }
  }, [])

  /* ─── mouse-follower (Design_References.md §7) — desktop only ─── */
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return
    let cursor: any = null
    ;(async () => {
      try {
        const MF = (await import('mouse-follower')).default
        MF.registerGSAP(gsap)
        cursor = new MF({ speed: 0.55, ease: 'expo.out', skewing: 3, skewingText: 2 })
      } catch { /* noop */ }
    })()
    return () => { cursor?.destroy() }
  }, [])

  /* ─── Scroll Progress Bar ─── */
  useEffect(() => {
    const onScroll = () => {
      if (!progressRef.current) return
      const p = Math.min(window.scrollY / (document.documentElement.scrollHeight - window.innerHeight), 1)
      progressRef.current.style.transform = `scaleX(${p})`
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ─── GSAP ScrollTrigger — Immersive Scroll Storytelling ─── */
  useLandingAnimations(containerRef)

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-kriptik-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <VFXProvider>
    <div ref={containerRef} className="bg-kriptik-black text-kriptik-white overflow-x-hidden">

      {/* ═══ SCROLL PROGRESS BAR ═══ */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-[2px]">
        <div ref={progressRef} className="h-full origin-left"
          style={{ transform: 'scaleX(0)', background: 'linear-gradient(90deg, #c8ff64, #06b6d4)' }} />
      </div>

      {/* ═══ NAVIGATION ═══ */}
      <nav className="fixed top-[2px] left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between"
          style={{ background: 'linear-gradient(180deg, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.85) 60%, transparent 100%)' }}>
          <div className="flex items-center gap-3" data-cursor="-pointer" data-cursor-stick>
            <KriptikLogo size="sm" animated={false} />
            <span className="font-display font-bold text-lg tracking-tight">
              KripTik<span className="text-zinc-500">AI</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-medium">
            {[
              { label: 'Intelligence', id: 'intelligence' },
              { label: 'Capabilities', id: 'capabilities' },
              { label: 'Deploy', id: 'deploy' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-zinc-400 hover:text-white transition-colors duration-300 relative group"
                data-cursor-text="View">
                {label}
                <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-kriptik-lime group-hover:w-full transition-all duration-300" />
              </button>
            ))}
          </div>
          <button onClick={() => scrollTo('auth')}
            className="relative px-7 py-2.5 rounded-xl font-bold text-sm text-kriptik-black overflow-hidden group"
            data-cursor="-pointer" data-cursor-stick
            style={{
              background: 'linear-gradient(135deg, #c8ff64, #a8e848)',
              boxShadow: '0 0 40px rgba(200,255,100,0.35), 0 0 80px rgba(200,255,100,0.12)',
            }}>
            <span className="relative z-10">Get Started</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'linear-gradient(135deg, #a8e848, #06b6d4)' }} />
          </button>
        </div>
      </nav>

      {/* ═══ HERO — SDF Metaballs + Bloom + CodeRain + Liquid Warp Text ═══ */}
      <section className="hero-section relative h-screen flex items-center justify-center overflow-hidden">
        <Suspense fallback={null}><Hero3D /></Suspense>
        <Suspense fallback={null}><CodeRain opacity={0.06} density={35} speed={0.8} /></Suspense>
        <div className="absolute bottom-0 left-0 right-0 h-48 z-[5]"
          style={{ background: 'linear-gradient(transparent, #0a0a0a)' }} />
        <div className="relative z-10 w-full px-6 text-center" style={{ perspective: '1200px' }}>
          <h1 className="hero-title font-creative font-black tracking-tighter leading-[0.9]"
            style={{
              fontSize: 'clamp(2.5rem, 8vw, 7rem)',
              textShadow: '0 0 80px rgba(200,255,100,0.25), 0 4px 30px rgba(0,0,0,0.8)',
              transformStyle: 'preserve-3d',
            }}>
            <VFXSpan shader={SHADER_LIQUID_WARP}>One Prompt = Done</VFXSpan>
          </h1>
          <div className="hero-sub mt-8 max-w-3xl mx-auto">
            <p className="text-lg md:text-2xl text-zinc-300 leading-relaxed font-light">
              The AI engine that turns a single idea into a
              <br className="hidden sm:block" />
              <span className="font-semibold text-white">production-ready application</span>.
            </p>
            <p className="mt-6 text-xl md:text-3xl font-display font-bold">
              KripTik builds{' '}<RotatingBuildType items={BUILD_TYPES} />
            </p>
          </div>
          <div className="hero-cta-group mt-14 flex flex-col sm:flex-row gap-5 justify-center items-center">
            <button onClick={() => scrollTo('auth')}
              className="relative px-12 py-5 rounded-2xl font-bold text-lg text-kriptik-black overflow-hidden group"
              data-cursor="-pointer" data-cursor-stick
              style={{
                background: 'linear-gradient(135deg, #c8ff64, #b0f040)',
                boxShadow: '0 0 60px rgba(200,255,100,0.4), 0 0 120px rgba(200,255,100,0.12), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}>
              <span className="relative z-10 tracking-wide">Start Building</span>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-700"
                style={{ background: 'linear-gradient(135deg, #b0f040, #06b6d4)' }} />
            </button>
            <button onClick={() => scrollTo('intelligence')}
              className="px-12 py-5 rounded-2xl font-semibold text-lg text-white border border-white/10 hover:border-white/25 transition-all duration-500 group"
              data-cursor="-pointer"
              style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' }}>
              <span className="group-hover:text-kriptik-lime transition-colors duration-500">Explore</span>
            </button>
          </div>
        </div>
        <div className="scroll-indicator absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3">
          <span className="text-xs text-zinc-600 uppercase tracking-[0.3em] font-medium">Scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-zinc-600 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ═══ SECTION CONNECTOR ═══ */}
      <div className="relative h-32">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(200,255,100,0.03) 0%, transparent 70%)' }} />
      </div>

      {/* ═══ THE BRAIN — Intelligence (BrainGraph + Neural Shader) ═══ */}
      <section id="intelligence" className="brain-section relative py-48 px-6 overflow-hidden min-h-[80vh]">
        <Suspense fallback={null}><BrainGraph opacity={0.5} /></Suspense>
        <Suspense fallback={null}>
          <NoiseField opacity={0.03} speed={0.00015} scale={0.008} color={[6, 182, 212]} />
        </Suspense>
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="brain-title" style={{ willChange: 'transform, opacity' }}>
            <h2 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(3rem, 9vw, 7rem)', lineHeight: 0.9,
                background: 'linear-gradient(135deg, #06b6d4, #c8ff64)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              <VFXSpan shader={SHADER_NEURAL}>A Brain, Not a Pipeline</VFXSpan>
            </h2>
          </div>
          <div className="brain-desc mt-12 space-y-6">
            <p className="text-xl md:text-2xl text-zinc-300 leading-relaxed font-light max-w-2xl mx-auto">
              Other builders follow templates.{' '}
              <span className="font-semibold text-white">KripTik thinks.</span>
            </p>
            <p className="text-base md:text-lg text-zinc-500 leading-relaxed max-w-xl mx-auto">
              A living knowledge graph where every discovery by one agent becomes intelligence for all.
              API rate limits. Design patterns. Data model decisions.
              Everything learned is everything known.
            </p>
            <div className="flex justify-center gap-12 mt-10 text-center">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className={`text-3xl md:text-4xl font-creative font-black ${s.countable ? 'stat-number' : ''}`}
                    data-target={s.countable ? s.val : undefined}
                    style={{ color: '#c8ff64' }}>
                    {s.countable ? '0' : s.val}
                  </div>
                  <div className="text-xs text-zinc-600 uppercase tracking-widest mt-2">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION CONNECTOR ═══ */}
      <div className="relative h-24 flex items-center justify-center">
        <div className="h-px w-48" style={{ background: 'linear-gradient(90deg, transparent, rgba(200,255,100,0.15), transparent)' }} />
      </div>

      {/* ═══ BUILD TYPES — Pinned Scroll-Through (Design_References.md §6) ═══ */}
      <section id="features" className="builds-pinned relative h-screen overflow-hidden"
        style={{ perspective: '1400px' }}>
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(200,255,100,0.02) 0%, transparent 60%)' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          {BUILD_DATA.map((b) => (
            <div key={b.title}
              className="build-item absolute inset-0 flex flex-col items-center justify-center px-8"
              style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}>
              <h2 className="font-creative font-black tracking-tighter text-center"
                style={{
                  fontSize: 'clamp(3.5rem, 12vw, 10rem)',
                  color: b.color,
                  textShadow: `0 0 100px ${b.color}35, 0 0 200px ${b.color}12`,
                  lineHeight: 0.85,
                }}>
                <VFXSpan shader={SHADER_HOLOGRAM}>{b.title}</VFXSpan>
              </h2>
              <p className="mt-8 text-xl md:text-2xl text-zinc-400 font-light text-center max-w-xl leading-relaxed">
                {b.sub}
              </p>
              <div className="mt-8 h-[2px] w-20 mx-auto rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${b.color}, transparent)` }} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ CAPABILITIES — Fix / Komplete / Train (unique shader per item) ═══ */}
      <section id="capabilities" className="relative py-48 px-6 overflow-hidden"
        style={{ perspective: '1200px' }}>
        <Suspense fallback={null}>
          <NoiseField opacity={0.04} speed={0.0002} scale={0.006} color={[6, 182, 212]} />
        </Suspense>
        <div className="relative z-10 max-w-6xl mx-auto space-y-48">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title}
              className={`cap-item ${cap.align === 'right' ? 'ml-auto text-right' : 'mr-auto text-left'}`}
              style={{
                maxWidth: '750px', willChange: 'transform, opacity',
                transformOrigin: cap.align === 'left' ? 'right center' : 'left center',
              }}>
              <h3 className="font-creative font-black tracking-tight"
                style={{
                  fontSize: 'clamp(3rem, 7vw, 5.5rem)',
                  color: cap.color,
                  textShadow: `0 0 80px ${cap.color}25, 0 0 160px ${cap.color}08`,
                  lineHeight: 0.95,
                }}>
                <VFXSpan shader={cap.shader}>{cap.title}</VFXSpan>
              </h3>
              <p className="mt-8 text-lg md:text-xl text-zinc-400 leading-relaxed font-light max-w-lg"
                style={{ marginLeft: cap.align === 'right' ? 'auto' : undefined }}>
                {cap.desc}
              </p>
              <div className="mt-10 h-[2px] w-32 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${cap.color}, transparent)`,
                  marginLeft: cap.align === 'right' ? 'auto' : undefined,
                }} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ QUALITY — "Not AI Slop." (Design_References.md §1 — electric VFX) ═══ */}
      <section className="quality-section relative py-56 px-6 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(200,255,100,0.04) 0%, transparent 65%)' }} />
        <Suspense fallback={null}>
          <NoiseField opacity={0.03} speed={0.00015} scale={0.01} color={[200, 255, 100]} />
        </Suspense>
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="quality-text" style={{ willChange: 'transform, opacity' }}>
            <h2 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(3rem, 10vw, 8rem)', lineHeight: 0.9, color: '#c8ff64',
                textShadow: '0 0 120px rgba(200,255,100,0.3), 0 0 240px rgba(200,255,100,0.08)',
              }}>
              <VFXSpan shader={SHADER_ELECTRIC}>Not AI Slop.</VFXSpan>
            </h2>
          </div>
          <div className="quality-sub mt-14 space-y-8">
            <p className="text-2xl md:text-4xl text-zinc-200 leading-snug font-light max-w-3xl mx-auto">
              Our proprietary tech creates designs that are{' '}
              <span className="font-bold text-white">significantly better</span>{' '}
              than any app builder on the planet.
            </p>
            <p className="text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto leading-relaxed">
              Custom. Intentional. Production-grade.
              <br />Not template-driven. Not cookie-cutter. Not generic.
            </p>
            <div className="mx-auto mt-6 h-px w-48"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(200,255,100,0.3), transparent)' }} />
          </div>
        </div>
      </section>

      {/* ═══ DEPLOY — Your Code, Your Platforms ═══ */}
      <section id="deploy" className="relative py-56 px-6" style={{ perspective: '1000px' }}>
        <div className="max-w-5xl mx-auto space-y-40">
          <div className="freedom-block" style={{ willChange: 'transform, opacity', transformStyle: 'preserve-3d' }}>
            <h3 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 5.5rem)', lineHeight: 0.95,
                background: 'linear-gradient(135deg, #c8ff64 0%, #06b6d4 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              One Prompt.<br />Production Ready.
            </h3>
            <p className="mt-10 text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-2xl font-light">
              Not a demo. Not a prototype. A fully deployed, production-ready
              application from a single prompt. Real databases, real APIs,
              real infrastructure — ready for real users.
            </p>
            <div className="mt-8 h-[2px] w-24 rounded-full"
              style={{ background: 'linear-gradient(90deg, #c8ff64, #06b6d4)' }} />
          </div>
          <div className="freedom-block" style={{ willChange: 'transform, opacity', transformStyle: 'preserve-3d' }}>
            <h3 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 5.5rem)', lineHeight: 0.95,
                background: 'linear-gradient(135deg, #f59e0b 0%, #c8ff64 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              Your Code.<br />Your Platforms.
            </h3>
            <p className="mt-10 text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-2xl font-light">
              We deploy to any platform you choose — Vercel, AWS, Netlify, Cloudflare.
              When your app is built, it is truly yours. Complete source code ownership.
              No lock-in. No strings.
            </p>
            <div className="mt-8 h-[2px] w-24 rounded-full"
              style={{ background: 'linear-gradient(90deg, #f59e0b, #c8ff64)' }} />
          </div>
        </div>
      </section>

      {/* ═══ SHIP IN YOUR SLEEP + PLATFORM CAROUSEL ═══ */}
      <section className="ship-section relative py-56 px-6 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 35%, rgba(6,182,212,0.035) 0%, transparent 65%)' }} />
        <div className="relative z-10 text-center max-w-5xl mx-auto">
          <div className="ship-title" style={{ willChange: 'transform, opacity' }}>
            <h2 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 8vw, 6.5rem)', lineHeight: 0.9,
                background: 'linear-gradient(135deg, #f59e0b, #c8ff64, #06b6d4)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              Ship Software<br />In Your Sleep
            </h2>
            <p className="mt-10 text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
              KripTik works while you rest. Get notified via{' '}
              <span className="font-semibold" style={{ color: '#c8ff64' }}>email</span>,{' '}
              <span className="font-semibold" style={{ color: '#06b6d4' }}>SMS</span>, and{' '}
              <span className="font-semibold" style={{ color: '#f59e0b' }}>Slack</span>{' '}
              when anything needs your attention — or when your app is ready.
            </p>
          </div>
          <div className="ship-carousel mt-24" style={{ willChange: 'transform, opacity' }}>
            <p className="text-xs text-zinc-600 uppercase tracking-[0.3em] mb-12 font-semibold">
              Integrates with the platforms you love
            </p>
            <PlatformCarousel />
          </div>
        </div>
      </section>

      {/* ═══ AUTH ═══ */}
      <LandingAuth />

      {/* ═══ FOOTER ═══ */}
      <footer className="landing-footer relative py-16 px-6">
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(200,255,100,0.15), rgba(6,182,212,0.15), transparent)' }} />
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <KriptikLogo size="sm" animated={false} />
            <span className="font-display font-bold text-sm text-zinc-500">
              KripTik AI &copy; {new Date().getFullYear()}
            </span>
          </div>
          <div className="flex items-center gap-8 text-sm text-zinc-600">
            <Link to="/login" className="hover:text-white transition-colors duration-300">Sign In</Link>
            <span className="cursor-pointer hover:text-white transition-colors duration-300">Terms</span>
            <span className="cursor-pointer hover:text-white transition-colors duration-300">Privacy</span>
            <span className="cursor-pointer hover:text-white transition-colors duration-300">Docs</span>
          </div>
          <div className="flex items-center gap-5">
            {[
              { Icon: GitHubIcon, href: 'https://github.com', label: 'GitHub' },
              { Icon: DiscordIcon, href: 'https://discord.com', label: 'Discord' },
            ].map(({ Icon, href, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="opacity-30 hover:opacity-100 transition-opacity duration-300"
                data-cursor-text={label}>
                <div style={{ filter: 'brightness(0) invert(1)' }}>
                  <Icon size={18} />
                </div>
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
    </VFXProvider>
  )
}
