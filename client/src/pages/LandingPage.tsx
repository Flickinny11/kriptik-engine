/**
 * KripTik AI Landing Page — Immersive Scroll Experience
 *
 * No flat cards. No article layouts. Pure 3D experience.
 *
 * - Ray-marched SDF metaball hero (Hero3D)
 * - GSAP ScrollTrigger pinned scroll storytelling
 * - Lenis smooth scroll synced with ScrollTrigger
 * - react-vfx shader text effects
 * - mouse-follower custom cursor
 * - Real KriptikLogo (black sphere + orbital rings)
 * - Colored platform icons in 3D carousel
 * - Full-width immersive sections with parallax
 * - Per-character 3D text reveals
 * - Magnetic glow CTA buttons
 */

import React, { useRef, useEffect, Suspense, lazy, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { VFXProvider, VFXSpan } from 'react-vfx'
import { useUserStore } from '@/store/useUserStore'
import { KriptikLogo } from '@/components/ui/KriptikLogo'
import {
  VercelIcon, NetlifyIcon, AWSIcon, CloudflareIcon, SupabaseIcon,
  GitHubIcon, GoogleIcon, StripeIcon, SlackIcon, DiscordIcon,
  HuggingFaceIcon, OpenAIIcon, AnthropicIcon,
} from '@/components/ui/icons'
import LandingAuth from '@/components/landing/LandingAuth'

gsap.registerPlugin(ScrollTrigger)

const Hero3D = lazy(() => import('@/components/landing/Hero3D'))

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const BUILD_TYPES = ['Mobile Apps', 'iOS Apps', 'Software', 'Web Apps'] as const

const PLATFORMS = [
  { name: 'Vercel', Icon: VercelIcon, color: '#fff' },
  { name: 'Netlify', Icon: NetlifyIcon, color: '#00c7b7' },
  { name: 'AWS', Icon: AWSIcon, color: '#ff9900' },
  { name: 'Cloudflare', Icon: CloudflareIcon, color: '#f38020' },
  { name: 'Supabase', Icon: SupabaseIcon, color: '#3ecf8e' },
  { name: 'GitHub', Icon: GitHubIcon, color: '#fff' },
  { name: 'Stripe', Icon: StripeIcon, color: '#635bff' },
  { name: 'Slack', Icon: SlackIcon, color: '#e01e5a' },
  { name: 'Discord', Icon: DiscordIcon, color: '#5865f2' },
  { name: 'Google', Icon: GoogleIcon, color: '#4285f4' },
  { name: 'HuggingFace', Icon: HuggingFaceIcon, color: '#ffbd45' },
  { name: 'OpenAI', Icon: OpenAIIcon, color: '#fff' },
  { name: 'Anthropic', Icon: AnthropicIcon, color: '#d4a27f' },
]

/* ═══════════════════════════════════════════
   UTILITY: SPLIT CHARACTERS FOR GSAP
   ═══════════════════════════════════════════ */

function SplitWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(' ')
  return (
    <>
      {words.map((word, wi) => (
        <span key={wi} className="inline-block mr-[0.25em]">
          {word.split('').map((char, ci) => (
            <span
              key={ci}
              className={`hero-char inline-block ${className || ''}`}
            >
              {char}
            </span>
          ))}
        </span>
      ))}
    </>
  )
}

/* ═══════════════════════════════════════════
   ROTATING TEXT
   ═══════════════════════════════════════════ */

function RotatingText({ items }: { items: readonly string[] }) {
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const els = containerRef.current?.children
    if (!els || els.length === 0) return

    const tl = gsap.timeline({ repeat: -1 })

    Array.from(els).forEach((el, i) => {
      tl.fromTo(
        el,
        { y: '120%', opacity: 0, rotateX: -90, scale: 0.8 },
        { y: '0%', opacity: 1, rotateX: 0, scale: 1, duration: 0.7, ease: 'expo.out' },
        i * 2.5
      ).to(
        el,
        { y: '-120%', opacity: 0, rotateX: 90, scale: 0.8, duration: 0.5, ease: 'expo.in' },
        i * 2.5 + 2
      )
    })

    return () => { tl.kill() }
  }, [items])

  return (
    <span
      className="inline-block relative overflow-hidden align-bottom"
      style={{ height: '1.3em', minWidth: '260px' }}
    >
      <span ref={containerRef} style={{ perspective: '600px' }}>
        {items.map((item) => (
          <span
            key={item}
            className="absolute inset-0 flex items-center justify-center text-kriptik-lime"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {item}
          </span>
        ))}
      </span>
    </span>
  )
}

/* ═══════════════════════════════════════════
   3D PLATFORM CAROUSEL — COLORED ICONS + GLOW
   ═══════════════════════════════════════════ */

function PlatformCarousel() {
  const ringRef = useRef<HTMLDivElement>(null)
  const count = PLATFORMS.length
  const angleStep = 360 / count
  const radius = 340

  useEffect(() => {
    if (!ringRef.current) return
    const anim = gsap.to(ringRef.current, {
      rotateY: 360,
      duration: 30,
      repeat: -1,
      ease: 'none',
    })
    return () => { anim.kill() }
  }, [])

  return (
    <div className="relative mx-auto" style={{ perspective: '1400px', height: '300px', width: '240px' }}>
      <div
        ref={ringRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {PLATFORMS.map((p, i) => (
          <div
            key={p.name}
            className="absolute flex flex-col items-center gap-3"
            style={{
              transform: `rotateY(${angleStep * i}deg) translateZ(${radius}px)`,
              backfaceVisibility: 'hidden',
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-500"
              style={{
                background: `${p.color}10`,
                borderColor: `${p.color}30`,
                boxShadow: `0 0 20px ${p.color}15, inset 0 0 10px ${p.color}08`,
              }}
            >
              <div style={{ filter: `drop-shadow(0 0 6px ${p.color}40)` }}>
                <p.Icon size={30} />
              </div>
            </div>
            <span
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: p.color, opacity: 0.8 }}
            >
              {p.name}
            </span>
          </div>
        ))}
      </div>
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

  /* ─── mouse-follower ─── */
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return
    let cursor: any = null
    const init = async () => {
      try {
        const MF = (await import('mouse-follower')).default
        MF.registerGSAP(gsap)
        cursor = new MF({ speed: 0.55, ease: 'expo.out', skewing: 3, skewingText: 2 })
      } catch {}
    }
    init()
    return () => { cursor?.destroy() }
  }, [])

  /* ─── GSAP ScrollTrigger — Immersive Animations ─── */
  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── Hero entrance ──
      gsap.from('.hero-char', {
        y: 80,
        rotateX: -90,
        opacity: 0,
        stagger: 0.03,
        duration: 1.6,
        ease: 'expo.out',
        delay: 0.4,
      })

      gsap.from('.hero-sub', {
        y: 50,
        opacity: 0,
        duration: 1.2,
        ease: 'expo.out',
        delay: 1.0,
      })

      gsap.from('.hero-cta-btn', {
        y: 40,
        opacity: 0,
        scale: 0.9,
        stagger: 0.15,
        duration: 1,
        ease: 'expo.out',
        delay: 1.4,
      })

      // ── Pinned Builds Section — full-screen scroll-through ──
      const buildItems = gsap.utils.toArray<HTMLElement>('.build-item')
      if (buildItems.length > 0) {
        const buildTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.builds-pinned',
            pin: true,
            scrub: 1,
            end: () => `+=${window.innerHeight * buildItems.length}`,
          },
        })

        buildItems.forEach((item, i) => {
          // Each build type zooms in from behind with 3D perspective
          buildTl.fromTo(
            item,
            {
              scale: 0.3,
              z: -800,
              opacity: 0,
              rotateY: i % 2 === 0 ? -25 : 25,
            },
            {
              scale: 1,
              z: 0,
              opacity: 1,
              rotateY: 0,
              duration: 1,
              ease: 'power3.out',
            },
            i * 1.8
          )

          // Hold then zoom past the camera
          if (i < buildItems.length - 1) {
            buildTl.to(
              item,
              {
                scale: 2.5,
                z: 600,
                opacity: 0,
                duration: 0.8,
                ease: 'power3.in',
              },
              i * 1.8 + 1.3
            )
          }
        })
      }

      // ── Capabilities — staggered text reveal with parallax ──
      const capItems = gsap.utils.toArray<HTMLElement>('.cap-item')
      capItems.forEach((item, i) => {
        gsap.from(item, {
          scrollTrigger: {
            trigger: item,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
          x: i % 2 === 0 ? -300 : 300,
          rotateY: i % 2 === 0 ? -15 : 15,
          opacity: 0,
          duration: 1.4,
          ease: 'expo.out',
        })
      })

      // ── Quality section — scale up from deep ──
      gsap.from('.quality-text', {
        scrollTrigger: {
          trigger: '.quality-section',
          start: 'top 65%',
        },
        scale: 0.4,
        opacity: 0,
        y: 100,
        duration: 1.5,
        ease: 'expo.out',
      })

      gsap.from('.quality-sub', {
        scrollTrigger: {
          trigger: '.quality-section',
          start: 'top 55%',
        },
        y: 60,
        opacity: 0,
        duration: 1.2,
        ease: 'expo.out',
        delay: 0.3,
      })

      // ── Freedom — parallax text blocks ──
      gsap.utils.toArray<HTMLElement>('.freedom-text').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            scrub: 1,
          },
          y: 120 + i * 40,
          opacity: 0,
        })
      })

      // ── Ship section — zoom from infinity ──
      gsap.from('.ship-title', {
        scrollTrigger: {
          trigger: '.ship-section',
          start: 'top 70%',
        },
        scale: 0.2,
        opacity: 0,
        duration: 1.8,
        ease: 'expo.out',
      })

      gsap.from('.ship-carousel', {
        scrollTrigger: {
          trigger: '.ship-section',
          start: 'top 50%',
        },
        rotateX: 45,
        y: 200,
        opacity: 0,
        duration: 1.5,
        ease: 'expo.out',
      })

      // ── Auth ──
      gsap.from('.auth-card', {
        scrollTrigger: {
          trigger: '.auth-section',
          start: 'top 70%',
        },
        y: 80,
        scale: 0.9,
        rotateX: -10,
        opacity: 0,
        duration: 1.2,
        ease: 'expo.out',
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

      {/* ═══════════════════════════════════════
          NAVIGATION — Real KriptikLogo + Glow CTA
          ═══════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div
          className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between"
          style={{
            background: 'linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.7) 70%, transparent 100%)',
          }}
        >
          <div className="flex items-center gap-3" data-cursor="-pointer" data-cursor-stick>
            <KriptikLogo size="sm" animated={false} />
            <span className="font-display font-bold text-lg tracking-tight text-white">
              KripTik<span className="text-zinc-500">AI</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-10 text-sm font-medium">
            {['Features', 'Capabilities', 'Deploy'].map((label) => (
              <button
                key={label}
                onClick={() => scrollTo(label.toLowerCase())}
                className="text-zinc-400 hover:text-white transition-colors duration-300 relative group"
                data-cursor-text="View"
              >
                {label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-kriptik-lime group-hover:w-full transition-all duration-300" />
              </button>
            ))}
          </div>

          <button
            onClick={() => scrollTo('auth')}
            className="relative px-6 py-2.5 rounded-xl font-bold text-sm text-kriptik-black overflow-hidden group"
            data-cursor="-pointer"
            data-cursor-stick
            style={{
              background: 'linear-gradient(135deg, #c8ff64, #a0e050)',
              boxShadow: '0 0 30px rgba(200,255,100,0.3), 0 0 60px rgba(200,255,100,0.1)',
            }}
          >
            <span className="relative z-10">Get Started</span>
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'linear-gradient(135deg, #a0e050, #06b6d4)' }}
            />
          </button>
        </div>
      </nav>

      {/* ═══════════════════════════════════════
          HERO — SDF Metaballs + 3D Text Reveal
          ═══════════════════════════════════════ */}
      <section className="hero-section relative h-screen flex items-center justify-center overflow-hidden">
        <Suspense fallback={null}>
          <Hero3D />
        </Suspense>

        {/* Text overlay — properly sized, full width */}
        <div
          className="relative z-10 w-full px-6 text-center"
          style={{ perspective: '1000px' }}
        >
          <h1
            className="font-creative font-black tracking-tighter leading-none"
            style={{
              fontSize: 'clamp(2.8rem, 7vw, 6.5rem)',
              textShadow: '0 0 120px rgba(200,255,100,0.35), 0 4px 20px rgba(0,0,0,0.8)',
              transformStyle: 'preserve-3d',
            }}
          >
            <VFXProvider>
              <VFXSpan shader="rgbShift">
                One Prompt = Done
              </VFXSpan>
            </VFXProvider>
          </h1>

          <div className="hero-sub mt-8 max-w-3xl mx-auto">
            <p className="text-lg md:text-2xl text-zinc-300 leading-relaxed font-light">
              The AI engine that turns your idea into
              <br className="hidden sm:block" />
              a <span className="font-bold text-white">production-ready application</span>.
            </p>
            <p className="mt-6 text-xl md:text-3xl font-display font-bold">
              KripTik builds{' '}
              <RotatingText items={BUILD_TYPES} />
            </p>
          </div>

          <div className="hero-cta mt-12 flex flex-col sm:flex-row gap-5 justify-center items-center">
            <button
              onClick={() => scrollTo('auth')}
              className="hero-cta-btn relative px-10 py-5 rounded-2xl font-bold text-lg text-kriptik-black overflow-hidden group"
              data-cursor="-pointer"
              data-cursor-stick
              style={{
                background: 'linear-gradient(135deg, #c8ff64, #b0f040)',
                boxShadow: '0 0 50px rgba(200,255,100,0.4), 0 0 100px rgba(200,255,100,0.15), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              <span className="relative z-10">Start Building</span>
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-700"
                style={{ background: 'linear-gradient(135deg, #b0f040, #06b6d4)' }}
              />
            </button>
            <button
              onClick={() => scrollTo('features')}
              className="hero-cta-btn px-10 py-5 rounded-2xl font-semibold text-lg text-white border border-white/10 hover:border-white/30 transition-all duration-500 group"
              data-cursor="-pointer"
              style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 0 30px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <span className="group-hover:text-kriptik-lime transition-colors duration-500">
                Explore
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          BUILDS — Pinned Scroll-Through Experience
          Each build type zooms through the camera
          ═══════════════════════════════════════ */}
      <section
        id="features"
        className="builds-pinned relative h-screen overflow-hidden"
        style={{ perspective: '1200px' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {[
            { title: 'Mobile Apps', sub: 'Native performance. Beautiful UI. Full-stack.', color: '#c8ff64' },
            { title: 'iOS Apps', sub: 'Swift, SwiftUI. App Store-ready from day one.', color: '#06b6d4' },
            { title: 'Software', sub: 'Desktop and server-side. Enterprise architecture.', color: '#f59e0b' },
            { title: 'Web Apps', sub: 'Modern frameworks. Responsive. Production-grade.', color: '#c8ff64' },
          ].map((b) => (
            <div
              key={b.title}
              className="build-item absolute inset-0 flex flex-col items-center justify-center px-8"
              style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
            >
              <h2
                className="font-creative font-black tracking-tighter text-center"
                style={{
                  fontSize: 'clamp(3rem, 10vw, 9rem)',
                  color: b.color,
                  textShadow: `0 0 80px ${b.color}40, 0 0 160px ${b.color}15`,
                  lineHeight: 0.9,
                }}
              >
                {b.title}
              </h2>
              <p className="mt-6 text-xl md:text-2xl text-zinc-400 font-light text-center max-w-xl">
                {b.sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════
          CAPABILITIES — Asymmetric Parallax Reveals
          ═══════════════════════════════════════ */}
      <section id="capabilities" className="relative py-40 px-6" style={{ perspective: '1000px' }}>
        <div className="max-w-6xl mx-auto space-y-40">
          {[
            {
              title: 'Fix My App',
              desc: 'Bring your broken project. We diagnose the issues, find the root causes, and ship the fix. Not a patch — a real solution.',
              align: 'left' as const,
              color: '#f59e0b',
            },
            {
              title: 'Komplete My App',
              desc: 'Got a half-finished app sitting in a repo? Hand it over. We analyze the architecture and ship the rest — fast.',
              align: 'right' as const,
              color: '#06b6d4',
            },
            {
              title: 'Train & Fine-Tune',
              desc: 'Custom AI models tuned to your specific use case and data. From fine-tuning to deployment.',
              align: 'left' as const,
              color: '#c8ff64',
            },
          ].map((cap) => (
            <div
              key={cap.title}
              className={`cap-item ${cap.align === 'right' ? 'ml-auto text-right' : 'mr-auto text-left'}`}
              style={{
                maxWidth: '700px',
                willChange: 'transform, opacity',
                transformOrigin: cap.align === 'left' ? 'right center' : 'left center',
              }}
            >
              <h3
                className="font-creative font-black tracking-tight"
                style={{
                  fontSize: 'clamp(2.5rem, 6vw, 5rem)',
                  color: cap.color,
                  textShadow: `0 0 60px ${cap.color}30`,
                  lineHeight: 1,
                }}
              >
                {cap.title}
              </h3>
              <p className="mt-6 text-lg md:text-xl text-zinc-400 leading-relaxed font-light">
                {cap.desc}
              </p>
              <div
                className="mt-8 h-px w-24"
                style={{
                  background: `linear-gradient(90deg, ${cap.color}, transparent)`,
                  marginLeft: cap.align === 'right' ? 'auto' : undefined,
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════
          QUALITY — "Not AI Slop" with VFX Shader
          ═══════════════════════════════════════ */}
      <section className="quality-section relative py-48 px-6 overflow-hidden">
        {/* Radial glow background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(200,255,100,0.04) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="quality-text" style={{ willChange: 'transform, opacity' }}>
            <VFXProvider>
              <h2
                className="font-creative font-black text-kriptik-lime tracking-tight"
                style={{
                  fontSize: 'clamp(2.5rem, 8vw, 7rem)',
                  lineHeight: 0.95,
                  textShadow: '0 0 100px rgba(200,255,100,0.3), 0 0 200px rgba(200,255,100,0.1)',
                }}
              >
                <VFXSpan shader="rgbShift">Not AI Slop.</VFXSpan>
              </h2>
            </VFXProvider>
          </div>

          <div className="quality-sub mt-10 space-y-6">
            <p className="text-2xl md:text-3xl text-zinc-200 leading-relaxed font-light max-w-3xl mx-auto">
              Our proprietary tech creates designs that are{' '}
              <span className="font-bold text-white">significantly better</span>{' '}
              than any app builder on the planet.
            </p>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto">
              Custom. Intentional. Production-grade.
              Not template-driven. Not cookie-cutter.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          FREEDOM — Production Ready + Your Platforms
          Full-width text with parallax scroll
          ═══════════════════════════════════════ */}
      <section id="deploy" className="relative py-48 px-6">
        <div className="max-w-5xl mx-auto space-y-32">
          <div className="freedom-text" style={{ willChange: 'transform, opacity' }}>
            <h3
              className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2rem, 6vw, 5rem)',
                lineHeight: 1,
                background: 'linear-gradient(135deg, #c8ff64 0%, #06b6d4 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              One Prompt.
              <br />
              Production Ready.
            </h3>
            <p className="mt-8 text-xl text-zinc-400 leading-relaxed max-w-2xl font-light">
              Not a demo. Not a prototype. A fully deployed, production-ready
              application from a single prompt. Real databases, real APIs,
              real infrastructure.
            </p>
          </div>

          <div className="freedom-text" style={{ willChange: 'transform, opacity' }}>
            <h3
              className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2rem, 6vw, 5rem)',
                lineHeight: 1,
                background: 'linear-gradient(135deg, #f59e0b 0%, #c8ff64 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Your Code.
              <br />
              Your Platforms.
            </h3>
            <p className="mt-8 text-xl text-zinc-400 leading-relaxed max-w-2xl font-light">
              We deploy to any platform you choose. When you are done building,
              your app is truly yours — no lock-in, no strings attached.
              Complete source code ownership.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SHIP IN YOUR SLEEP + PLATFORM CAROUSEL
          ═══════════════════════════════════════ */}
      <section className="ship-section relative py-48 px-6 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(6,182,212,0.04) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 text-center max-w-5xl mx-auto">
          <div className="ship-title" style={{ willChange: 'transform, opacity' }}>
            <h2
              className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 6rem)',
                lineHeight: 0.95,
                background: 'linear-gradient(135deg, #f59e0b, #c8ff64, #06b6d4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: 'none',
              }}
            >
              Ship Software
              <br />
              In Your Sleep
            </h2>
            <p className="mt-8 text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
              KripTik works while you rest. Get notified via{' '}
              <span className="text-kriptik-lime font-semibold">email</span>,{' '}
              <span className="text-cyan-400 font-semibold">SMS</span>, and{' '}
              <span className="text-amber-400 font-semibold">Slack</span>{' '}
              when anything needs your attention.
            </p>
          </div>

          <div className="ship-carousel mt-20" style={{ willChange: 'transform, opacity' }}>
            <p className="text-xs text-zinc-600 uppercase tracking-[0.25em] mb-10 font-medium">
              Integrates with the platforms you love
            </p>
            <PlatformCarousel />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          AUTH
          ═══════════════════════════════════════ */}
      <LandingAuth />

      {/* ═══════════════════════════════════════
          FOOTER — Minimal
          ═══════════════════════════════════════ */}
      <footer className="relative border-t border-white/[0.04] py-16 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <KriptikLogo size="sm" animated={false} />
            <span className="font-display font-bold text-sm text-zinc-400">
              KripTik AI &copy; {new Date().getFullYear()}
            </span>
          </div>

          <div className="flex items-center gap-8 text-sm text-zinc-600">
            <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            <span className="cursor-pointer hover:text-white transition-colors">Terms</span>
            <span className="cursor-pointer hover:text-white transition-colors">Privacy</span>
          </div>

          <div className="flex items-center gap-5">
            {[
              { Icon: GitHubIcon, href: 'https://github.com' },
              { Icon: DiscordIcon, href: 'https://discord.com' },
            ].map(({ Icon, href }, i) => (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-30 hover:opacity-100 transition-opacity"
              >
                <div className="brightness-0 invert">
                  <Icon size={18} />
                </div>
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
