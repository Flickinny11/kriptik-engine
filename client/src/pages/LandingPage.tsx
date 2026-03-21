/**
 * KripTik AI Landing Page — Immersive Scroll Storytelling Experience
 *
 * Thin shell that orchestrates section components. Each section handles
 * its own 3D scenes, scroll animations, and interactive elements.
 *
 * Dependencies: R3F, OGL, GSAP+ScrollTrigger, Lenis, react-vfx,
 * mouse-follower, curtains.js, rapier2d, gl-noise, framer-motion
 */

import { useRef, useEffect, Suspense, lazy, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { VFXProvider, VFXSpan } from 'react-vfx'
import { useUserStore } from '@/store/useUserStore'
import { KriptikLogo } from '@/components/ui/KriptikLogo'
import { GitHubIcon, DiscordIcon } from '@/components/ui/icons'
import LandingAuth from '@/components/landing/LandingAuth'
import {
  SHADER_LIQUID_WARP, BUILD_TYPES, RotatingBuildType,
} from '@/components/landing/LandingComponents'
import SectionConnector from '@/components/landing/SectionConnector'
import { useLandingAnimations } from '@/components/landing/useLandingAnimations'

gsap.registerPlugin(ScrollTrigger)

/* Lazy-loaded section components */
const Hero3D = lazy(() => import('@/components/landing/Hero3D'))
const CodeRain = lazy(() => import('@/components/landing/CodeRain'))
const BrainSection = lazy(() => import('@/components/landing/BrainSection'))
const BuildTypesSection = lazy(() => import('@/components/landing/BuildTypesSection'))
const CapabilitiesSection = lazy(() => import('@/components/landing/CapabilitiesSection'))
const QualitySection = lazy(() => import('@/components/landing/QualitySection'))
const DeploySection = lazy(() => import('@/components/landing/DeploySection'))
const ShipSection = lazy(() => import('@/components/landing/ShipSection'))

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useUserStore()

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, isLoading, navigate])

  /* ─── Lenis Smooth Scroll ─── */
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

  /* ─── mouse-follower — desktop only ─── */
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

  /* ─── GSAP ScrollTrigger — hero + auth/footer ─── */
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
          <motion.button onClick={() => scrollTo('auth')}
            className="relative px-7 py-2.5 rounded-xl font-bold text-sm text-kriptik-black overflow-hidden group"
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
            data-cursor="-pointer" data-cursor-stick
            style={{
              background: 'linear-gradient(135deg, #c8ff64, #a8e848)',
              boxShadow: '0 0 40px rgba(200,255,100,0.35), 0 0 80px rgba(200,255,100,0.12)',
            }}>
            <span className="relative z-10">Get Started</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'linear-gradient(135deg, #a8e848, #06b6d4)' }} />
          </motion.button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
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
            <motion.button onClick={() => scrollTo('auth')}
              className="relative px-12 py-5 rounded-2xl font-bold text-lg text-kriptik-black overflow-hidden group"
              whileHover={{ scale: 1.06, y: -3 }} whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
              data-cursor="-pointer" data-cursor-stick
              style={{
                background: 'linear-gradient(135deg, #c8ff64, #b0f040)',
                boxShadow: '0 0 60px rgba(200,255,100,0.4), 0 0 120px rgba(200,255,100,0.12), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}>
              <span className="relative z-10 tracking-wide">Start Building</span>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-700"
                style={{ background: 'linear-gradient(135deg, #b0f040, #06b6d4)' }} />
            </motion.button>
            <motion.button onClick={() => scrollTo('intelligence')}
              className="px-12 py-5 rounded-2xl font-semibold text-lg text-white border border-white/10 hover:border-white/25 transition-all duration-500 group"
              whileHover={{ scale: 1.06, y: -3 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}
              data-cursor="-pointer"
              style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' }}>
              <span className="group-hover:text-kriptik-lime transition-colors duration-500">Explore</span>
            </motion.button>
          </div>
        </div>
        <div className="scroll-indicator absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3">
          <span className="text-xs text-zinc-600 uppercase tracking-[0.3em] font-medium">Scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-zinc-600 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ═══ CONNECTOR: Hero → Brain ═══ */}
      <SectionConnector fromColor="#c8ff64" toColor="#06b6d4" height={100} />

      {/* ═══ BRAIN — Interactive Scroll Experience ═══ */}
      <Suspense fallback={null}><BrainSection /></Suspense>

      {/* ═══ CONNECTOR: Brain → Build Types ═══ */}
      <SectionConnector fromColor="#06b6d4" toColor="#c8ff64" height={80} />

      {/* ═══ BUILD TYPES — Pinned with 3D Device Mockups ═══ */}
      <Suspense fallback={null}><BuildTypesSection /></Suspense>

      {/* ═══ CONNECTOR: Build Types → Capabilities ═══ */}
      <SectionConnector fromColor="#c8ff64" toColor="#f59e0b" height={80} />

      {/* ═══ CAPABILITIES — Fix / Komplete / Train ═══ */}
      <Suspense fallback={null}><CapabilitiesSection /></Suspense>

      {/* ═══ CONNECTOR: Capabilities → Quality ═══ */}
      <SectionConnector fromColor="#06b6d4" toColor="#c8ff64" height={80} />

      {/* ═══ QUALITY — Side-by-Side Comparison ═══ */}
      <Suspense fallback={null}><QualitySection /></Suspense>

      {/* ═══ CONNECTOR: Quality → Deploy ═══ */}
      <SectionConnector fromColor="#c8ff64" toColor="#06b6d4" height={80} />

      {/* ═══ DEPLOY — Pipeline Visualization ═══ */}
      <Suspense fallback={null}><DeploySection /></Suspense>

      {/* ═══ CONNECTOR: Deploy → Ship ═══ */}
      <SectionConnector fromColor="#06b6d4" toColor="#f59e0b" height={80} />

      {/* ═══ SHIP — Timeline + Physics Logos ═══ */}
      <Suspense fallback={null}><ShipSection /></Suspense>

      {/* ═══ CONNECTOR: Ship → Auth ═══ */}
      <SectionConnector fromColor="#f59e0b" toColor="#c8ff64" height={60} />

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
