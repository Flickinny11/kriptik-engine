/**
 * BuildTypesSection — Pinned scroll-through with 3D device mockups
 *
 * Each build type (Mobile, iOS, Software, Web) has a 3D device frame
 * with animated "code being written" on its screen. Scroll scrubs through
 * the types with morphing transitions.
 *
 * Design_References.md §6 — ScrollTrigger pin + scrub
 * Design_References.md §11 — displacement, chromatic aberration
 */

import { useRef, useEffect, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { VFXSpan } from 'react-vfx'
import { SHADER_HOLOGRAM } from './LandingComponents'

gsap.registerPlugin(ScrollTrigger)

const BUILD_TYPES = [
  {
    title: 'Mobile Apps',
    sub: 'Native performance. Beautiful UI. Full-stack mobile from a single prompt.',
    color: '#c8ff64',
    device: 'phone',
    codeLines: [
      { text: 'import { App } from', color: '#c8ff64' },
      { text: "  '@kriptik/mobile'", color: '#06b6d4' },
      { text: '', color: '' },
      { text: 'export default function', color: '#c8ff64' },
      { text: '  HomeScreen() {', color: '#fff' },
      { text: '  return <TabNav>', color: '#f59e0b' },
      { text: '    <Feed />', color: '#06b6d4' },
      { text: '    <Search />', color: '#06b6d4' },
      { text: '    <Profile />', color: '#06b6d4' },
      { text: '  </TabNav>', color: '#f59e0b' },
    ],
  },
  {
    title: 'iOS Apps',
    sub: 'Swift & SwiftUI. App Store-ready architecture from day one.',
    color: '#06b6d4',
    device: 'phone',
    codeLines: [
      { text: 'import SwiftUI', color: '#c8ff64' },
      { text: '', color: '' },
      { text: 'struct ContentView:', color: '#06b6d4' },
      { text: '  View {', color: '#fff' },
      { text: '  var body: some View {', color: '#f59e0b' },
      { text: '    NavigationStack {', color: '#c8ff64' },
      { text: '      List(items) { item in', color: '#fff' },
      { text: '        ItemRow(item)', color: '#06b6d4' },
      { text: '      }', color: '#fff' },
      { text: '    }', color: '#fff' },
    ],
  },
  {
    title: 'Software',
    sub: 'Desktop, CLI, server-side. Enterprise-grade architecture.',
    color: '#f59e0b',
    device: 'terminal',
    codeLines: [
      { text: '$ kriptik build', color: '#c8ff64' },
      { text: '→ Analyzing intent...', color: '#06b6d4' },
      { text: '→ Spawning architect', color: '#06b6d4' },
      { text: '→ Creating schema', color: '#f59e0b' },
      { text: '→ Building API layer', color: '#f59e0b' },
      { text: '→ Running SAST scan', color: '#c8ff64' },
      { text: '→ All 28 rules pass', color: '#c8ff64' },
      { text: '→ Deploying...', color: '#06b6d4' },
      { text: '✓ Live at app.co', color: '#c8ff64' },
      { text: '', color: '' },
    ],
  },
  {
    title: 'Web Apps',
    sub: 'Modern frameworks. Responsive. Production-grade. Deployed.',
    color: '#c8ff64',
    device: 'browser',
    codeLines: [
      { text: "import { createApp }", color: '#c8ff64' },
      { text: "  from 'kriptik'", color: '#06b6d4' },
      { text: '', color: '' },
      { text: 'const app = createApp({', color: '#fff' },
      { text: "  framework: 'next',", color: '#f59e0b' },
      { text: "  db: 'supabase',", color: '#f59e0b' },
      { text: "  auth: 'oauth',", color: '#f59e0b' },
      { text: "  deploy: 'vercel',", color: '#c8ff64' },
      { text: '})', color: '#fff' },
      { text: '', color: '' },
    ],
  },
]

function DeviceFrame({ type, color, codeLines, progress }: {
  type: string
  color: string
  codeLines: { text: string; color: string }[]
  progress: number
}) {
  const visibleLines = Math.floor(progress * codeLines.length)

  const frameClass = type === 'terminal'
    ? 'rounded-lg border border-zinc-700'
    : type === 'browser'
      ? 'rounded-xl border border-zinc-700'
      : 'rounded-[2rem] border-4 border-zinc-700' // phone

  const headerContent = type === 'terminal' ? (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
      <div className="w-3 h-3 rounded-full bg-red-500/60" />
      <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
      <div className="w-3 h-3 rounded-full bg-green-500/60" />
      <span className="ml-3 text-[10px] text-zinc-600 font-mono">terminal</span>
    </div>
  ) : type === 'browser' ? (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
      <div className="w-3 h-3 rounded-full bg-red-500/60" />
      <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
      <div className="w-3 h-3 rounded-full bg-green-500/60" />
      <div className="ml-3 flex-1 bg-zinc-900 rounded-md px-3 py-1 text-[10px] text-zinc-500 font-mono">
        yourapp.kriptik.app
      </div>
    </div>
  ) : (
    <div className="flex justify-center py-2">
      <div className="w-20 h-1.5 rounded-full bg-zinc-700" />
    </div>
  )

  return (
    <div
      className={`${frameClass} bg-zinc-950 overflow-hidden shadow-2xl`}
      style={{
        width: type === 'phone' ? 220 : 340,
        boxShadow: `0 0 60px ${color}15, 0 20px 60px rgba(0,0,0,0.5)`,
      }}
    >
      {headerContent}
      <div className="p-4 font-mono text-[11px] leading-[1.6] min-h-[180px]">
        {codeLines.map((line, i) => (
          <div
            key={i}
            className="transition-all duration-300"
            style={{
              opacity: i < visibleLines ? 1 : 0,
              transform: i < visibleLines ? 'translateX(0)' : 'translateX(-20px)',
            }}
          >
            <span style={{ color: line.color || '#666' }}>{line.text}</span>
            {i === visibleLines - 1 && (
              <span className="inline-block w-2 h-4 ml-0.5 animate-pulse"
                style={{ background: color }} />
            )}
          </div>
        ))}
      </div>
      {type === 'phone' && (
        <div className="flex justify-center pb-3">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
      )}
    </div>
  )
}

export default function BuildTypesSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        pin: true,
        scrub: 0.8,
        end: () => `+=${window.innerHeight * BUILD_TYPES.length * 1.2}`,
        onUpdate: (self) => {
          const p = self.progress
          setScrollProgress(p)
          const idx = Math.min(
            Math.floor(p * BUILD_TYPES.length),
            BUILD_TYPES.length - 1
          )
          setActiveIndex(idx)
        },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  // Per-type progress (0-1 for the active type's portion of scroll)
  const typeProgress = (() => {
    const segSize = 1 / BUILD_TYPES.length
    const segStart = activeIndex * segSize
    return Math.min(1, Math.max(0, (scrollProgress - segStart) / segSize))
  })()

  const active = BUILD_TYPES[activeIndex]

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative h-screen overflow-hidden"
      style={{ perspective: '1400px' }}
    >
      {/* Radial glow background */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${active.color}06 0%, transparent 60%)`,
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20 px-6 max-w-5xl mx-auto">
          {/* Left: Device mockup */}
          <div
            className="relative"
            style={{
              transform: `perspective(1000px) rotateY(${-5 + typeProgress * 10}deg) rotateX(${3 - typeProgress * 6}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.3s ease-out',
            }}
          >
            <DeviceFrame
              type={active.device}
              color={active.color}
              codeLines={active.codeLines}
              progress={typeProgress}
            />
            {/* Reflection glow */}
            <div
              className="absolute -inset-4 -z-10 rounded-3xl blur-3xl opacity-20 transition-colors duration-700"
              style={{ background: active.color }}
            />
          </div>

          {/* Right: Text */}
          <div className="text-center md:text-left max-w-md">
            <h2
              className="font-creative font-black tracking-tighter"
              style={{
                fontSize: 'clamp(3rem, 10vw, 7rem)',
                color: active.color,
                textShadow: `0 0 80px ${active.color}30`,
                lineHeight: 0.9,
                transition: 'color 0.5s, text-shadow 0.5s',
              }}
            >
              <VFXSpan shader={SHADER_HOLOGRAM}>{active.title}</VFXSpan>
            </h2>
            <p className="mt-6 text-lg md:text-xl text-zinc-400 font-light leading-relaxed">
              {active.sub}
            </p>

            {/* Progress indicators */}
            <div className="flex gap-3 mt-8 justify-center md:justify-start">
              {BUILD_TYPES.map((bt, i) => (
                <div
                  key={bt.title}
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: i === activeIndex ? 40 : 12,
                    background: i === activeIndex ? bt.color : 'rgba(255,255,255,0.1)',
                    boxShadow: i === activeIndex ? `0 0 12px ${bt.color}50` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Type counter */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs text-zinc-600 font-mono">
        {String(activeIndex + 1).padStart(2, '0')} / {String(BUILD_TYPES.length).padStart(2, '0')}
      </div>
    </section>
  )
}
