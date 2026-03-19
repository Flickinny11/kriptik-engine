/**
 * KripTik AI Landing Page
 *
 * Immersive experience using:
 * - React Three Fiber + postprocessing (Hero 3D scene)
 * - GSAP ScrollTrigger (scroll storytelling, 3D side-entry animations)
 * - Lenis (smooth scrolling)
 * - react-vfx (shader text effects)
 * - mouse-follower (custom cursor)
 * - simplex-noise (procedural animation)
 * - Brand icons (real platform logos)
 * - Custom 3D SVG icons
 */

import React, { useRef, useEffect, useState, Suspense, lazy, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { VFXProvider, VFXSpan } from 'react-vfx'
import { useUserStore } from '@/store/useUserStore'
import {
  VercelIcon, NetlifyIcon, AWSIcon, CloudflareIcon, SupabaseIcon,
  GitHubIcon, GoogleIcon, StripeIcon, SlackIcon, DiscordIcon,
  HuggingFaceIcon, OpenAIIcon, AnthropicIcon,
} from '@/components/ui/icons'
import {
  KriptikLogo, PhoneIcon3D, AppStoreIcon3D, CodeBracketIcon3D, BrowserIcon3D,
  WrenchIcon3D, PuzzleIcon3D, NeuralIcon3D, RocketIcon3D, CloudDeployIcon3D,
  SleepIcon3D, NotifIcon3D,
} from '@/components/landing/LandingIcons'
import LandingAuth from '@/components/landing/LandingAuth'

gsap.registerPlugin(ScrollTrigger)

const Hero3D = lazy(() => import('@/components/landing/Hero3D'))

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const BUILD_TYPES = ['Mobile Apps', 'iOS Apps', 'Software', 'Web Apps'] as const

const PLATFORMS = [
  { name: 'Vercel', Icon: VercelIcon },
  { name: 'Netlify', Icon: NetlifyIcon },
  { name: 'AWS', Icon: AWSIcon },
  { name: 'Cloudflare', Icon: CloudflareIcon },
  { name: 'Supabase', Icon: SupabaseIcon },
  { name: 'GitHub', Icon: GitHubIcon },
  { name: 'Stripe', Icon: StripeIcon },
  { name: 'Slack', Icon: SlackIcon },
  { name: 'Discord', Icon: DiscordIcon },
  { name: 'Google', Icon: GoogleIcon },
  { name: 'HuggingFace', Icon: HuggingFaceIcon },
  { name: 'OpenAI', Icon: OpenAIIcon },
  { name: 'Anthropic', Icon: AnthropicIcon },
]

const BUILDS = [
  { title: 'Mobile App', desc: 'Full-stack mobile applications with native performance and beautiful UI.', Icon: PhoneIcon3D, dir: 'left' as const },
  { title: 'iOS', desc: 'Native iOS applications with Swift, SwiftUI, and polished App Store-ready design.', Icon: AppStoreIcon3D, dir: 'right' as const },
  { title: 'Software', desc: 'Desktop and server-side applications with enterprise-grade architecture.', Icon: CodeBracketIcon3D, dir: 'left' as const },
  { title: 'Webapp', desc: 'Modern, responsive web applications with cutting-edge frameworks.', Icon: BrowserIcon3D, dir: 'right' as const },
]

const CAPABILITIES = [
  { title: 'Fix My App', desc: 'Bring your broken project. We diagnose issues and ship the fix.', Icon: WrenchIcon3D },
  { title: 'Komplete My App', desc: 'Got a half-finished app? We will ship the rest — fast.', Icon: PuzzleIcon3D },
  { title: 'Train & Fine-Tune', desc: 'Custom AI models tuned to your specific use case and data.', Icon: NeuralIcon3D },
]

/* ═══════════════════════════════════════════
   UTILITY COMPONENTS
   ═══════════════════════════════════════════ */

function SplitChars({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className={`hero-char inline-block ${className || ''}`}
          style={char === ' ' ? { width: '0.3em' } : undefined}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </>
  )
}

function RotatingText({ items }: { items: readonly string[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const els = containerRef.current?.children
    if (!els || els.length === 0) return

    const tl = gsap.timeline({ repeat: -1 })

    Array.from(els).forEach((el, i) => {
      tl.fromTo(
        el,
        { y: '110%', opacity: 0, rotateX: -60 },
        { y: '0%', opacity: 1, rotateX: 0, duration: 0.6, ease: 'expo.out' },
        i * 2.5
      ).to(
        el,
        { y: '-110%', opacity: 0, rotateX: 60, duration: 0.5, ease: 'expo.in' },
        i * 2.5 + 2
      )
    })

    return () => { tl.kill() }
  }, [items])

  return (
    <span className="inline-block relative overflow-hidden align-bottom" style={{ height: '1.2em', width: '280px' }}>
      <span ref={containerRef as any}>
        {items.map((item) => (
          <span key={item} className="absolute inset-0 flex items-center justify-start" style={{ perspective: '600px' }}>
            {item}
          </span>
        ))}
      </span>
    </span>
  )
}

/* ═══════════════════════════════════════════
   PLATFORM 3D CAROUSEL
   ═══════════════════════════════════════════ */

function PlatformCarousel() {
  const ringRef = useRef<HTMLDivElement>(null)
  const count = PLATFORMS.length
  const angleStep = 360 / count
  const radius = 320

  useEffect(() => {
    if (!ringRef.current) return
    const anim = gsap.to(ringRef.current, {
      rotateY: 360,
      duration: 35,
      repeat: -1,
      ease: 'none',
    })
    return () => { anim.kill() }
  }, [])

  return (
    <div className="relative mx-auto" style={{ perspective: '1200px', height: '260px', width: '200px' }}>
      <div
        ref={ringRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {PLATFORMS.map((p, i) => (
          <div
            key={p.name}
            className="absolute flex flex-col items-center gap-2"
            style={{
              transform: `rotateY(${angleStep * i}deg) translateZ(${radius}px)`,
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="w-14 h-14 bg-white/[0.06] backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/[0.08] shadow-lg">
              <div className="brightness-0 invert opacity-70">
                <p.Icon size={28} />
              </div>
            </div>
            <span className="text-[11px] text-zinc-500 font-medium whitespace-nowrap">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   GLASS CARD
   ═══════════════════════════════════════════ */

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-3xl shadow-glass ${className}`}>
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════ */

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useUserStore()

  // Redirect authenticated users
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

    return () => {
      gsap.ticker.remove(tickerCb)
      lenis.destroy()
    }
  }, [])

  /* ─── mouse-follower Cursor ─── */
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return

    let cursor: any = null
    const initCursor = async () => {
      try {
        const MF = (await import('mouse-follower')).default
        MF.registerGSAP(gsap)
        cursor = new MF({
          speed: 0.55,
          ease: 'expo.out',
          skewing: 3,
          skewingText: 2,
          skewingIcon: 2,
        })
      } catch (e) {
        // mouse-follower optional — page works without it
      }
    }
    initCursor()

    return () => { cursor?.destroy() }
  }, [])

  /* ─── GSAP ScrollTrigger Animations ─── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero character reveal
      gsap.from('.hero-char', {
        y: 100,
        rotateX: -80,
        opacity: 0,
        stagger: 0.035,
        duration: 1.4,
        ease: 'expo.out',
        delay: 0.3,
      })

      gsap.from('.hero-sub', {
        y: 40,
        opacity: 0,
        duration: 1,
        ease: 'expo.out',
        delay: 0.8,
      })

      gsap.from('.hero-cta', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: 'expo.out',
        delay: 1.2,
      })

      // Builds section — cards from alternating sides with 3D perspective
      const buildCards = gsap.utils.toArray<HTMLElement>('.build-card')
      buildCards.forEach((card, i) => {
        const fromLeft = i % 2 === 0
        gsap.from(card, {
          scrollTrigger: {
            trigger: card,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
          x: fromLeft ? -280 : 280,
          rotateY: fromLeft ? -30 : 30,
          opacity: 0,
          duration: 1.2,
          ease: 'expo.out',
          delay: i * 0.08,
        })
      })

      // Capabilities — scale up
      gsap.from('.cap-card', {
        scrollTrigger: {
          trigger: '.capabilities-section',
          start: 'top 75%',
        },
        scale: 0.8,
        y: 60,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: 'expo.out',
      })

      // Quality section
      gsap.from('.quality-content', {
        scrollTrigger: {
          trigger: '.quality-section',
          start: 'top 70%',
        },
        scale: 0.85,
        opacity: 0,
        duration: 1.2,
        ease: 'expo.out',
      })

      // Freedom section — staggered blocks
      gsap.from('.freedom-block', {
        scrollTrigger: {
          trigger: '.freedom-section',
          start: 'top 75%',
        },
        x: -200,
        rotateY: -20,
        opacity: 0,
        duration: 1,
        stagger: 0.2,
        ease: 'expo.out',
      })

      // Ship section
      gsap.from('.ship-content', {
        scrollTrigger: {
          trigger: '.ship-section',
          start: 'top 70%',
        },
        y: 80,
        opacity: 0,
        duration: 1,
        ease: 'expo.out',
      })

      // Auth section
      gsap.from('.auth-card', {
        scrollTrigger: {
          trigger: '.auth-section',
          start: 'top 75%',
        },
        y: 60,
        scale: 0.95,
        opacity: 0,
        duration: 1,
        ease: 'expo.out',
      })

      // Footer
      gsap.from('.footer-item', {
        scrollTrigger: {
          trigger: '.landing-footer',
          start: 'top 90%',
        },
        y: -40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.06,
        ease: 'elastic.out(1, 0.6)',
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

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
    <div ref={containerRef} className="bg-kriptik-black text-kriptik-white overflow-x-hidden">

      {/* ═══ NAVIGATION ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-kriptik-black/70 border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3" data-cursor="-pointer">
            <KriptikLogo />
            <span className="font-display font-bold text-lg tracking-tight">KripTik</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-500">
            <button onClick={() => scrollTo('builds')} className="hover:text-white transition-colors" data-cursor-text="View">Features</button>
            <button onClick={() => scrollTo('capabilities')} className="hover:text-white transition-colors" data-cursor-text="View">Capabilities</button>
            <button onClick={() => scrollTo('ship')} className="hover:text-white transition-colors" data-cursor-text="View">Deploy</button>
          </div>
          <button
            onClick={() => scrollTo('auth')}
            className="bg-kriptik-lime text-kriptik-black px-5 py-2.5 rounded-xl text-sm font-bold hover:brightness-110 transition-all duration-200"
            data-cursor="-pointer"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ═══ HERO SECTION ═══ */}
      <section className="hero-section relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <Suspense fallback={null}>
          <Hero3D />
        </Suspense>

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-kriptik-black/40 via-transparent to-kriptik-black/80 z-[1]" />

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <h1
            className="font-creative font-extrabold tracking-tighter leading-[0.85]"
            style={{
              fontSize: 'clamp(3rem, 10vw, 8rem)',
              textShadow: '0 0 80px rgba(200,255,100,0.25), 0 0 40px rgba(200,255,100,0.1)',
              perspective: '800px',
            }}
          >
            <SplitChars text="One Prompt = Done" />
          </h1>

          <div className="hero-sub mt-8">
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              The AI engine that turns your idea into a production-ready application.
            </p>
            <p className="mt-5 text-xl md:text-2xl font-display font-bold text-kriptik-lime">
              KripTik builds{' '}
              <RotatingText items={BUILD_TYPES} />
            </p>
          </div>

          <div className="hero-cta mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => scrollTo('auth')}
              className="px-8 py-4 bg-kriptik-lime text-kriptik-black rounded-2xl font-bold text-lg hover:brightness-110 hover:scale-[1.02] transition-all duration-300 shadow-glow-lime"
              data-cursor="-pointer"
            >
              Start Building
            </button>
            <button
              onClick={() => scrollTo('builds')}
              className="px-8 py-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] text-white rounded-2xl font-semibold text-lg hover:bg-white/[0.1] transition-all duration-300"
              data-cursor="-pointer"
            >
              See What We Build
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div className="w-6 h-10 border-2 border-white/20 rounded-full flex items-start justify-center p-1.5">
            <div className="w-1.5 h-2.5 bg-kriptik-lime/60 rounded-full animate-bounce-subtle" />
          </div>
        </div>
      </section>

      {/* ═══ WHAT WE BUILD ═══ */}
      <section id="builds" className="builds-section relative py-32 px-6" style={{ perspective: '1200px' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-display-sm md:text-display-md font-bold text-center mb-6 tracking-tight">
            Build Anything
          </h2>
          <p className="text-zinc-500 text-center mb-16 max-w-xl mx-auto text-lg">
            From mobile to web, from MVP to enterprise — one prompt is all it takes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {BUILDS.map((b, i) => (
              <div
                key={b.title}
                className="build-card"
                data-direction={b.dir}
                style={{
                  transformOrigin: b.dir === 'left' ? 'right center' : 'left center',
                  willChange: 'transform, opacity',
                }}
              >
                <GlassCard className="p-8 h-full hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-500 group">
                  <div className="mb-5 transform group-hover:scale-110 transition-transform duration-500">
                    <b.Icon size={56} />
                  </div>
                  <h3 className="font-display text-2xl font-bold mb-2 text-kriptik-lime">{b.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{b.desc}</p>
                </GlassCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CAPABILITIES ═══ */}
      <section id="capabilities" className="capabilities-section relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-display-sm md:text-display-md font-bold text-center mb-6 tracking-tight">
            More Than Building
          </h2>
          <p className="text-zinc-500 text-center mb-16 max-w-xl mx-auto text-lg">
            Fix, complete, or enhance — KripTik handles the full lifecycle.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="cap-card" style={{ willChange: 'transform, opacity' }}>
                <GlassCard className="p-8 text-center h-full hover:bg-white/[0.05] hover:border-kriptik-lime/20 transition-all duration-500 group">
                  <div className="flex justify-center mb-5 transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                    <c.Icon size={64} />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-3">{c.title}</h3>
                  <p className="text-zinc-400 leading-relaxed text-sm">{c.desc}</p>
                </GlassCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ NOT AI SLOP ═══ */}
      <section className="quality-section relative py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-kriptik-lime/[0.02] to-transparent" />
        <div className="quality-content max-w-4xl mx-auto text-center relative z-10">
          <VFXProvider>
            <h2 className="font-creative font-extrabold tracking-tight mb-8 text-kriptik-lime" style={{ fontSize: 'clamp(2rem, 6vw, 5rem)', lineHeight: 1 }}>
              <VFXSpan shader="rgbShift">Design That Sets You Apart</VFXSpan>
            </h2>
          </VFXProvider>
          <p className="text-xl md:text-2xl text-zinc-300 leading-relaxed max-w-3xl mx-auto mb-6">
            Our proprietary tech creates UI designs that are{' '}
            <span className="text-kriptik-lime font-bold">significantly better than any app builder on the planet</span>.
          </p>
          <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Custom. Intentional. Production-grade. Not template-driven. Not cookie-cutter.{' '}
            <span className="font-bold text-white">Not AI slop.</span>
          </p>
        </div>
      </section>

      {/* ═══ PRODUCTION READY + DEPLOY FREEDOM ═══ */}
      <section className="freedom-section relative py-32 px-6" style={{ perspective: '1000px' }}>
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="freedom-block" style={{ willChange: 'transform, opacity', transformOrigin: 'right center' }}>
            <GlassCard className="p-10 md:p-14 flex flex-col md:flex-row items-start gap-8">
              <div className="shrink-0">
                <RocketIcon3D size={72} />
              </div>
              <div>
                <h3 className="font-display text-3xl md:text-4xl font-bold mb-4 tracking-tight">
                  One Prompt.{' '}
                  <span className="text-kriptik-lime">Production Ready.</span>
                </h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Not a demo. Not a prototype. A fully deployed, production-ready application
                  from a single prompt. Real databases, real APIs, real deployment.
                </p>
              </div>
            </GlassCard>
          </div>

          <div className="freedom-block" style={{ willChange: 'transform, opacity', transformOrigin: 'right center' }}>
            <GlassCard className="p-10 md:p-14 flex flex-col md:flex-row items-start gap-8">
              <div className="shrink-0">
                <CloudDeployIcon3D size={72} />
              </div>
              <div>
                <h3 className="font-display text-3xl md:text-4xl font-bold mb-4 tracking-tight">
                  Your Code.{' '}
                  <span className="text-kriptik-lime">Your Platforms.</span>
                </h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Our deployment pipeline does not keep you on KripTik. We deploy your frontend
                  and backend to any external platform you choose. When you are done building,
                  your app is truly yours — no lock-in, no strings attached.
                </p>
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ═══ SHIP IN YOUR SLEEP ═══ */}
      <section id="ship" className="ship-section relative py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-kriptik-lime/[0.015] to-transparent" />
        <div className="ship-content max-w-5xl mx-auto text-center relative z-10">
          <div className="flex justify-center mb-6">
            <SleepIcon3D size={80} />
          </div>
          <h2
            className="font-creative font-extrabold tracking-tight mb-6"
            style={{
              fontSize: 'clamp(2rem, 6vw, 4.5rem)',
              lineHeight: 1,
              textShadow: '0 0 60px rgba(200,255,100,0.2)',
            }}
          >
            Ship Software In Your Sleep
          </h2>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-6 leading-relaxed">
            KripTik works while you rest. Get notified via{' '}
            <span className="text-kriptik-lime font-semibold">email</span>,{' '}
            <span className="text-kriptik-lime font-semibold">SMS</span>, and{' '}
            <span className="text-kriptik-lime font-semibold">Slack</span>{' '}
            when anything needs your attention.
          </p>
          <div className="flex justify-center gap-4 mb-16">
            <NotifIcon3D size={40} />
            <NotifIcon3D size={40} />
            <NotifIcon3D size={40} />
          </div>

          <p className="text-sm text-zinc-600 uppercase tracking-widest mb-8 font-medium">
            Integrates with the platforms you love
          </p>

          <PlatformCarousel />
        </div>
      </section>

      {/* ═══ AUTH SECTION ═══ */}
      <LandingAuth />

      {/* ═══ FOOTER ═══ */}
      <footer className="landing-footer relative border-t border-white/[0.04] py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="footer-item col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <KriptikLogo size={28} />
                <span className="font-display font-bold text-lg">KripTik AI</span>
              </div>
              <p className="text-zinc-500 text-sm leading-relaxed">
                The AI engine that builds production-ready software from a single prompt.
              </p>
            </div>
            <div className="footer-item">
              <h4 className="font-display font-semibold text-sm mb-4 text-zinc-300">Product</h4>
              <ul className="space-y-2.5 text-sm text-zinc-500">
                <li><button onClick={() => scrollTo('builds')} className="hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => scrollTo('capabilities')} className="hover:text-white transition-colors">Capabilities</button></li>
                <li><button onClick={() => scrollTo('ship')} className="hover:text-white transition-colors">Integrations</button></li>
                <li><Link to="/login" className="hover:text-white transition-colors">Sign In</Link></li>
              </ul>
            </div>
            <div className="footer-item">
              <h4 className="font-display font-semibold text-sm mb-4 text-zinc-300">Company</h4>
              <ul className="space-y-2.5 text-sm text-zinc-500">
                <li><span className="hover:text-white transition-colors cursor-pointer">About</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">Blog</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">Careers</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">Contact</span></li>
              </ul>
            </div>
            <div className="footer-item">
              <h4 className="font-display font-semibold text-sm mb-4 text-zinc-300">Legal</h4>
              <ul className="space-y-2.5 text-sm text-zinc-500">
                <li><span className="hover:text-white transition-colors cursor-pointer">Terms of Service</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">Privacy Policy</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">Security</span></li>
              </ul>
            </div>
          </div>

          <div className="footer-item flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/[0.04]">
            <p className="text-zinc-600 text-sm">&copy; {new Date().getFullYear()} KripTik AI. All rights reserved.</p>
            <div className="flex items-center gap-5 mt-4 md:mt-0">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-white transition-colors">
                <div className="brightness-0 invert opacity-40 hover:opacity-100 transition-opacity">
                  <GitHubIcon size={20} />
                </div>
              </a>
              <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-white transition-colors">
                <div className="brightness-0 invert opacity-40 hover:opacity-100 transition-opacity">
                  <DiscordIcon size={20} />
                </div>
              </a>
              <a href="https://slack.com" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-white transition-colors">
                <div className="brightness-0 invert opacity-40 hover:opacity-100 transition-opacity">
                  <SlackIcon size={20} />
                </div>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
