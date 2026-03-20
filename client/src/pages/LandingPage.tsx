/**
 * KripTik AI Landing Page — Immersive Scroll Experience
 *
 * Dependencies from Design_References.md:
 * - React Three Fiber + custom GLSL (Hero3D ray-marched SDF metaballs)
 * - GSAP + ScrollTrigger (pinned scroll storytelling, 3D parallax reveals)
 * - Lenis (butter-smooth scroll engine synced with ScrollTrigger)
 * - react-vfx (custom GLSL displacement + chromatic aberration on text)
 * - mouse-follower (Cuberto-style cursor with skew + magnetic snap)
 * - simplex-noise (procedural NoiseField canvas backgrounds)
 * - Custom SDF icons (no lucide, no emojis)
 *
 * Zero flat cards. Zero article layouts. All immersive full-width sections
 * with 3D scroll-driven animations, VFX shader text, and parallax depth.
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
  HuggingFaceIcon, OpenAIIcon, AnthropicIcon, ReplicateIcon, ModalIcon,
} from '@/components/ui/icons'
import LandingAuth from '@/components/landing/LandingAuth'

gsap.registerPlugin(ScrollTrigger)

const Hero3D = lazy(() => import('@/components/landing/Hero3D'))
const NoiseField = lazy(() => import('@/components/landing/NoiseField'))

/* ═══════════════════════════════════════════
   CUSTOM VFX SHADERS (Design_References.md §1, §11)
   ═══════════════════════════════════════════ */

/** Liquid displacement + chromatic split — organic text distortion */
const SHADER_LIQUID_WARP = `
precision mediump float;
uniform vec2 resolution;
uniform vec2 offset;
uniform float time;
uniform sampler2D src;

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  uv.y = 1.0 - uv.y;

  float wave1 = sin(uv.x * 10.0 + time * 1.8) * cos(uv.y * 7.0 + time * 1.2) * 0.006;
  float wave2 = cos(uv.x * 5.0 - time * 2.5) * sin(uv.y * 9.0 + time * 0.8) * 0.004;
  float wave3 = sin((uv.x + uv.y) * 8.0 + time * 3.0) * 0.002;

  vec2 d = uv + vec2(wave1 + wave3, wave2 + wave3 * 0.7);

  float r = texture2D(src, d + vec2(0.003, 0.001)).r;
  float g = texture2D(src, d).g;
  float b = texture2D(src, d - vec2(0.003, 0.001)).b;
  float a = texture2D(src, d).a;

  gl_FragColor = vec4(r, g, b, a);
}
`

/** Electric pulse with scanline — cybernetic text effect */
const SHADER_ELECTRIC = `
precision mediump float;
uniform vec2 resolution;
uniform vec2 offset;
uniform float time;
uniform sampler2D src;

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  uv.y = 1.0 - uv.y;

  float distort = sin(uv.y * 40.0 + time * 6.0) * 0.002;
  vec4 col = texture2D(src, uv + vec2(distort, 0.0));

  float scanline = sin(uv.y * resolution.y * 0.5 + time * 8.0) * 0.06;
  float pulse = pow(sin(time * 3.0) * 0.5 + 0.5, 3.0);

  col.rgb += scanline * pulse;
  col.r += distort * 15.0 * pulse;

  gl_FragColor = col;
}
`

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const BUILD_TYPES = ['Mobile Apps', 'iOS Apps', 'Software', 'Web Apps'] as const

const BUILD_DATA = [
  { title: 'Mobile Apps', sub: 'Native performance. Beautiful UI. Full-stack mobile from a single prompt.', color: '#c8ff64' },
  { title: 'iOS Apps', sub: 'Swift & SwiftUI. App Store-ready architecture from day one.', color: '#06b6d4' },
  { title: 'Software', sub: 'Desktop, CLI, server-side. Enterprise-grade architecture.', color: '#f59e0b' },
  { title: 'Web Apps', sub: 'Modern frameworks. Responsive. Production-grade. Deployed.', color: '#c8ff64' },
]

const CAPABILITIES = [
  {
    title: 'Fix My App',
    desc: 'Bring your broken project. We diagnose root causes, trace the architecture, and ship a real fix — not a band-aid.',
    align: 'left' as const,
    color: '#f59e0b',
  },
  {
    title: 'Komplete My App',
    desc: 'Half-finished app collecting dust? Hand it over. We analyze what exists and build the rest — fast, correct, production-grade.',
    align: 'right' as const,
    color: '#06b6d4',
  },
  {
    title: 'Train & Fine-Tune',
    desc: 'Custom AI models tuned to your data, your domain, your use case. From fine-tuning to deployment — end to end.',
    align: 'left' as const,
    color: '#c8ff64',
  },
]

const PLATFORMS = [
  { name: 'Vercel', Icon: VercelIcon, color: '#fff' },
  { name: 'AWS', Icon: AWSIcon, color: '#ff9900' },
  { name: 'Netlify', Icon: NetlifyIcon, color: '#00c7b7' },
  { name: 'Supabase', Icon: SupabaseIcon, color: '#3ecf8e' },
  { name: 'GitHub', Icon: GitHubIcon, color: '#fff' },
  { name: 'Cloudflare', Icon: CloudflareIcon, color: '#f38020' },
  { name: 'Stripe', Icon: StripeIcon, color: '#635bff' },
  { name: 'Slack', Icon: SlackIcon, color: '#e01e5a' },
  { name: 'Discord', Icon: DiscordIcon, color: '#5865f2' },
  { name: 'Google', Icon: GoogleIcon, color: '#4285f4' },
  { name: 'HuggingFace', Icon: HuggingFaceIcon, color: '#ffbd45' },
  { name: 'OpenAI', Icon: OpenAIIcon, color: '#10a37f' },
  { name: 'Anthropic', Icon: AnthropicIcon, color: '#d4a27f' },
  { name: 'Replicate', Icon: ReplicateIcon, color: '#fff' },
  { name: 'Modal', Icon: ModalIcon, color: '#6ee7b7' },
]

/* ═══════════════════════════════════════════
   UTILITY: SPLIT TEXT FOR PER-CHAR ANIMATION
   ═══════════════════════════════════════════ */

function SplitChars({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(' ').map((word, wi) => (
        <span key={wi} className="inline-block" style={{ marginRight: '0.25em' }}>
          {word.split('').map((char, ci) => (
            <span key={ci} className={`hero-char inline-block ${className || ''}`}>
              {char}
            </span>
          ))}
        </span>
      ))}
    </>
  )
}

/* ═══════════════════════════════════════════
   ROTATING 3D TEXT
   ═══════════════════════════════════════════ */

function RotatingBuildType({ items }: { items: readonly string[] }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const els = ref.current?.children
    if (!els?.length) return

    const tl = gsap.timeline({ repeat: -1 })
    Array.from(els).forEach((el, i) => {
      tl.fromTo(el,
        { y: '120%', opacity: 0, rotateX: -90, scale: 0.8 },
        { y: '0%', opacity: 1, rotateX: 0, scale: 1, duration: 0.7, ease: 'expo.out' },
        i * 2.5
      ).to(el,
        { y: '-120%', opacity: 0, rotateX: 90, scale: 0.8, duration: 0.5, ease: 'expo.in' },
        i * 2.5 + 2
      )
    })
    return () => { tl.kill() }
  }, [items])

  return (
    <span className="inline-block relative overflow-hidden align-bottom"
      style={{ height: '1.4em', minWidth: '240px' }}>
      <span ref={ref} style={{ perspective: '800px' }}>
        {items.map((item) => (
          <span key={item}
            className="absolute inset-0 flex items-center justify-center font-bold"
            style={{ color: '#c8ff64', transformStyle: 'preserve-3d' }}>
            {item}
          </span>
        ))}
      </span>
    </span>
  )
}

/* ═══════════════════════════════════════════
   3D PLATFORM CAROUSEL — COLORED BRAND ICONS
   ═══════════════════════════════════════════ */

function PlatformCarousel() {
  const ringRef = useRef<HTMLDivElement>(null)
  const count = PLATFORMS.length
  const angleStep = 360 / count
  const radius = 320

  useEffect(() => {
    if (!ringRef.current) return
    const anim = gsap.to(ringRef.current, {
      rotateY: 360, duration: 35, repeat: -1, ease: 'none',
    })
    return () => { anim.kill() }
  }, [])

  return (
    <div className="relative mx-auto" style={{ perspective: '1600px', height: '340px', width: '300px' }}>
      <div ref={ringRef} className="absolute inset-0 flex items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}>
        {PLATFORMS.map((p, i) => (
          <div key={p.name} className="absolute flex flex-col items-center gap-3"
            style={{
              transform: `rotateY(${angleStep * i}deg) translateZ(${radius}px)`,
              backfaceVisibility: 'hidden',
            }}>
            <div className="w-[4.5rem] h-[4.5rem] rounded-2xl flex items-center justify-center border"
              style={{
                background: `${p.color}12`,
                borderColor: `${p.color}25`,
                boxShadow: `0 0 25px ${p.color}20, 0 0 50px ${p.color}08`,
              }}>
              {/* Make dark SVGs visible on dark bg via brightness invert, add brand glow */}
              <div style={{ filter: `brightness(0) invert(1) drop-shadow(0 0 8px ${p.color})` }}>
                <p.Icon size={34} />
              </div>
            </div>
            <span className="text-xs font-bold tracking-wide whitespace-nowrap"
              style={{ color: p.color, textShadow: `0 0 12px ${p.color}40` }}>
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
      } catch {}
    })()
    return () => { cursor?.destroy() }
  }, [])

  /* ─── GSAP ScrollTrigger — Immersive Scroll Storytelling ─── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      // ── Hero entrance — per-character 3D stagger ──
      gsap.from('.hero-char', {
        y: 100, rotateX: -90, opacity: 0,
        stagger: 0.025, duration: 1.8, ease: 'expo.out', delay: 0.3,
      })
      gsap.from('.hero-sub', {
        y: 60, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.9,
      })
      gsap.from('.hero-cta-group', {
        y: 50, opacity: 0, scale: 0.9, duration: 1.2, ease: 'expo.out', delay: 1.3,
      })
      gsap.from('.scroll-indicator', {
        opacity: 0, y: -20, duration: 1, ease: 'power2.out', delay: 2,
      })

      // ── Build Types — pinned scroll-through, each zooms from behind ──
      const buildItems = gsap.utils.toArray<HTMLElement>('.build-item')
      if (buildItems.length > 0) {
        const buildTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.builds-pinned',
            pin: true,
            scrub: 1,
            end: () => `+=${window.innerHeight * buildItems.length * 1.2}`,
          },
        })
        buildItems.forEach((item, i) => {
          buildTl.fromTo(item,
            { scale: 0.25, z: -1000, opacity: 0, rotateY: i % 2 === 0 ? -30 : 30 },
            { scale: 1, z: 0, opacity: 1, rotateY: 0, duration: 1, ease: 'power3.out' },
            i * 2
          )
          if (i < buildItems.length - 1) {
            buildTl.to(item,
              { scale: 3, z: 800, opacity: 0, duration: 0.9, ease: 'power3.in' },
              i * 2 + 1.4
            )
          }
        })
      }

      // ── Capabilities — slide from alternating sides with 3D perspective ──
      gsap.utils.toArray<HTMLElement>('.cap-item').forEach((item, i) => {
        gsap.from(item, {
          scrollTrigger: { trigger: item, start: 'top 82%', toggleActions: 'play none none reverse' },
          x: i % 2 === 0 ? -400 : 400,
          rotateY: i % 2 === 0 ? -20 : 20,
          opacity: 0,
          duration: 1.6,
          ease: 'expo.out',
        })
      })

      // ── Quality — scale from deep infinity ──
      gsap.from('.quality-text', {
        scrollTrigger: { trigger: '.quality-section', start: 'top 65%' },
        scale: 0.3, opacity: 0, y: 120, duration: 1.8, ease: 'expo.out',
      })
      gsap.from('.quality-sub', {
        scrollTrigger: { trigger: '.quality-section', start: 'top 55%' },
        y: 80, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.3,
      })

      // ── Freedom — parallax text with staggered depth ──
      gsap.utils.toArray<HTMLElement>('.freedom-block').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%', scrub: 1 },
          y: 150 + i * 50, opacity: 0, rotateX: -8,
        })
      })

      // ── Ship — zoom from infinity ──
      gsap.from('.ship-title', {
        scrollTrigger: { trigger: '.ship-section', start: 'top 70%' },
        scale: 0.15, opacity: 0, duration: 2, ease: 'expo.out',
      })
      gsap.from('.ship-carousel', {
        scrollTrigger: { trigger: '.ship-section', start: 'top 50%' },
        rotateX: 50, y: 250, opacity: 0, duration: 1.8, ease: 'expo.out',
      })

      // ── Auth card entrance ──
      gsap.from('.auth-section', {
        scrollTrigger: { trigger: '.auth-section', start: 'top 75%' },
        y: 100, scale: 0.92, rotateX: -12, opacity: 0,
        duration: 1.4, ease: 'expo.out',
      })

      // ── Footer slide up ──
      gsap.from('.landing-footer', {
        scrollTrigger: { trigger: '.landing-footer', start: 'top 95%' },
        y: 40, opacity: 0, duration: 1, ease: 'power2.out',
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
    <VFXProvider>
    <div ref={containerRef} className="bg-kriptik-black text-kriptik-white overflow-x-hidden">

      {/* ═══════════════════════════════════════
          NAVIGATION — Floating depth + KriptikLogo + Glow CTA
          ═══════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between"
          style={{
            background: 'linear-gradient(180deg, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.85) 60%, transparent 100%)',
          }}>

          {/* Logo + wordmark */}
          <div className="flex items-center gap-3" data-cursor="-pointer" data-cursor-stick>
            <KriptikLogo size="sm" animated={false} />
            <span className="font-display font-bold text-lg tracking-tight">
              KripTik<span className="text-zinc-500">AI</span>
            </span>
          </div>

          {/* Nav links — animated underline */}
          <div className="hidden md:flex items-center gap-10 text-sm font-medium">
            {[
              { label: 'Features', id: 'features' },
              { label: 'Capabilities', id: 'capabilities' },
              { label: 'Deploy', id: 'deploy' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-zinc-400 hover:text-white transition-colors duration-300 relative group"
                data-cursor-text="View">
                {label}
                <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-kriptik-lime group-hover:w-full transition-all duration-300 ease-premium" />
              </button>
            ))}
          </div>

          {/* CTA — pulsing glow */}
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

      {/* ═══════════════════════════════════════
          HERO — SDF Metaballs + Liquid Warp Text + 3D Rotating Types
          ═══════════════════════════════════════ */}
      <section className="hero-section relative h-screen flex items-center justify-center overflow-hidden">
        <Suspense fallback={null}>
          <Hero3D />
        </Suspense>

        {/* Gradient fade at bottom for section transition */}
        <div className="absolute bottom-0 left-0 right-0 h-48 z-[5]"
          style={{ background: 'linear-gradient(transparent, #0a0a0a)' }} />

        {/* Text overlay */}
        <div className="relative z-10 w-full px-6 text-center" style={{ perspective: '1200px' }}>

          {/* "ONE PROMPT = DONE" — custom liquid warp VFX shader */}
          <h1 className="font-creative font-black tracking-tighter leading-[0.9]"
            style={{
              fontSize: 'clamp(2.5rem, 8vw, 7rem)',
              textShadow: '0 0 80px rgba(200,255,100,0.25), 0 4px 30px rgba(0,0,0,0.8)',
              transformStyle: 'preserve-3d',
            }}>
            <VFXSpan shader={SHADER_LIQUID_WARP}>One Prompt = Done</VFXSpan>
          </h1>

          {/* Subtitle + rotating build type */}
          <div className="hero-sub mt-8 max-w-3xl mx-auto">
            <p className="text-lg md:text-2xl text-zinc-300 leading-relaxed font-light">
              The AI engine that turns a single idea into a
              <br className="hidden sm:block" />
              <span className="font-semibold text-white">production-ready application</span>.
            </p>
            <p className="mt-6 text-xl md:text-3xl font-display font-bold">
              KripTik builds{' '}
              <RotatingBuildType items={BUILD_TYPES} />
            </p>
          </div>

          {/* CTA buttons */}
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
            <button onClick={() => scrollTo('features')}
              className="px-12 py-5 rounded-2xl font-semibold text-lg text-white border border-white/10 hover:border-white/25 transition-all duration-500 group"
              data-cursor="-pointer"
              style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' }}>
              <span className="group-hover:text-kriptik-lime transition-colors duration-500">Explore</span>
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="scroll-indicator absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3">
          <span className="text-xs text-zinc-600 uppercase tracking-[0.3em] font-medium">Scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-zinc-600 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ═══════════════════════════════════════
          BUILD TYPES — Pinned Scroll-Through Experience
          Each type zooms from behind the camera, holds, zooms past.
          Like traveling through a 3D tunnel of possibilities.
          (Design_References.md §6 — ScrollTrigger pinned scrub)
          ═══════════════════════════════════════ */}
      <section id="features" className="builds-pinned relative h-screen overflow-hidden"
        style={{ perspective: '1400px' }}>
        {/* Subtle radial glow per active type */}
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
                {b.title}
              </h2>
              <p className="mt-8 text-xl md:text-2xl text-zinc-400 font-light text-center max-w-xl leading-relaxed">
                {b.sub}
              </p>
              {/* Gradient accent line */}
              <div className="mt-8 h-[2px] w-20 mx-auto rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${b.color}, transparent)` }} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════
          CAPABILITIES — Fix / Komplete / Train
          Asymmetric 3D perspective reveals from alternating sides
          (Design_References.md §6, §7 — ScrollTrigger + cursor interaction)
          ═══════════════════════════════════════ */}
      <section id="capabilities" className="relative py-48 px-6 overflow-hidden"
        style={{ perspective: '1200px' }}>
        {/* Noise texture background */}
        <Suspense fallback={null}>
          <NoiseField opacity={0.04} speed={0.0002} scale={0.006} color={[6, 182, 212]} />
        </Suspense>

        <div className="relative z-10 max-w-6xl mx-auto space-y-48">
          {CAPABILITIES.map((cap, i) => (
            <div key={cap.title}
              className={`cap-item ${cap.align === 'right' ? 'ml-auto text-right' : 'mr-auto text-left'}`}
              style={{
                maxWidth: '750px',
                willChange: 'transform, opacity',
                transformOrigin: cap.align === 'left' ? 'right center' : 'left center',
              }}>
              <h3 className="font-creative font-black tracking-tight"
                style={{
                  fontSize: 'clamp(3rem, 7vw, 5.5rem)',
                  color: cap.color,
                  textShadow: `0 0 80px ${cap.color}25, 0 0 160px ${cap.color}08`,
                  lineHeight: 0.95,
                }}>
                <VFXSpan shader="rgbShift">{cap.title}</VFXSpan>
              </h3>
              <p className="mt-8 text-lg md:text-xl text-zinc-400 leading-relaxed font-light max-w-lg"
                style={{ marginLeft: cap.align === 'right' ? 'auto' : undefined }}>
                {cap.desc}
              </p>
              {/* Gradient accent bar */}
              <div className="mt-10 h-[2px] w-32 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${cap.color}, transparent)`,
                  marginLeft: cap.align === 'right' ? 'auto' : undefined,
                }} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════
          DESIGN QUALITY — "Not AI Slop."
          Massive statement with custom electric VFX shader.
          Zooms from infinity on scroll entry.
          (Design_References.md §1 — react-vfx custom GLSL)
          ═══════════════════════════════════════ */}
      <section className="quality-section relative py-56 px-6 overflow-hidden">
        {/* Radial glow background */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(200,255,100,0.04) 0%, transparent 65%)' }} />

        <Suspense fallback={null}>
          <NoiseField opacity={0.03} speed={0.00015} scale={0.01} color={[200, 255, 100]} />
        </Suspense>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="quality-text" style={{ willChange: 'transform, opacity' }}>
            <h2 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(3rem, 10vw, 8rem)',
                lineHeight: 0.9,
                color: '#c8ff64',
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
              <br />
              Not template-driven. Not cookie-cutter. Not generic.
            </p>
            {/* Gradient divider */}
            <div className="mx-auto mt-6 h-px w-48"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(200,255,100,0.3), transparent)' }} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          PRODUCTION FREEDOM — Your Code, Your Platforms
          Full-width gradient text with parallax scroll
          (Design_References.md §6 — scroll-scrubbed parallax)
          ═══════════════════════════════════════ */}
      <section id="deploy" className="relative py-56 px-6" style={{ perspective: '1000px' }}>
        <div className="max-w-5xl mx-auto space-y-40">
          <div className="freedom-block" style={{ willChange: 'transform, opacity', transformStyle: 'preserve-3d' }}>
            <h3 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
                lineHeight: 0.95,
                background: 'linear-gradient(135deg, #c8ff64 0%, #06b6d4 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
              One Prompt.
              <br />
              Production Ready.
            </h3>
            <p className="mt-10 text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-2xl font-light">
              Not a demo. Not a prototype. A fully deployed, production-ready
              application from a single prompt. Real databases, real APIs,
              real infrastructure — ready for real users.
            </p>
            {/* Accent line */}
            <div className="mt-8 h-[2px] w-24 rounded-full"
              style={{ background: 'linear-gradient(90deg, #c8ff64, #06b6d4)' }} />
          </div>

          <div className="freedom-block" style={{ willChange: 'transform, opacity', transformStyle: 'preserve-3d' }}>
            <h3 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
                lineHeight: 0.95,
                background: 'linear-gradient(135deg, #f59e0b 0%, #c8ff64 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
              Your Code.
              <br />
              Your Platforms.
            </h3>
            <p className="mt-10 text-xl md:text-2xl text-zinc-400 leading-relaxed max-w-2xl font-light">
              We deploy to any platform you choose — Vercel, AWS, Netlify, Cloudflare.
              When your app is built, it is truly yours. Complete source code ownership.
              No lock-in. No strings. No "stay on KripTik."
            </p>
            <div className="mt-8 h-[2px] w-24 rounded-full"
              style={{ background: 'linear-gradient(90deg, #f59e0b, #c8ff64)' }} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SHIP IN YOUR SLEEP + PLATFORM CAROUSEL
          Rotating 3D ring of real branded platform logos
          (Design_References.md §1, §7, §10 — WebGL icons + cursor)
          ═══════════════════════════════════════ */}
      <section className="ship-section relative py-56 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 35%, rgba(6,182,212,0.035) 0%, transparent 65%)' }} />

        <div className="relative z-10 text-center max-w-5xl mx-auto">
          <div className="ship-title" style={{ willChange: 'transform, opacity' }}>
            <h2 className="font-creative font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.5rem, 8vw, 6.5rem)',
                lineHeight: 0.9,
                background: 'linear-gradient(135deg, #f59e0b, #c8ff64, #06b6d4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
              Ship Software
              <br />
              In Your Sleep
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

      {/* ═══════════════════════════════════════
          AUTH SECTION
          ═══════════════════════════════════════ */}
      <LandingAuth />

      {/* ═══════════════════════════════════════
          FOOTER — Depth + gradient border
          ═══════════════════════════════════════ */}
      <footer className="landing-footer relative py-16 px-6">
        {/* Gradient top border */}
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
