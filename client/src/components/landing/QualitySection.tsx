/**
 * QualitySection — Visual side-by-side comparison of template builders vs KripTik.
 *
 * GSAP ScrollTrigger for scroll-driven reveals and 3D perspective shifts.
 * Framer-motion spring entrances for quality badges.
 * VFXSpan + SHADER_ELECTRIC for the title.
 * Design_References.md — GSAP ScrollTrigger, framer-motion springs, 3D perspective.
 */

import { useRef, useEffect, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import { VFXSpan } from 'react-vfx'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SHADER_ELECTRIC } from './LandingComponents'

gsap.registerPlugin(ScrollTrigger)

const NoiseField = lazy(() => import('./NoiseField'))

const QUALITY_RULES = [
  'TypeScript Strict',
  'SAST Security',
  'No Placeholders',
  'Intent Verification',
  'Production Schemas',
  '28 Rules Enforced',
] as const

const badgeVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.8 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 120, damping: 14 },
  },
}

/* ── Mockup panels ──────────────────────────────── */

function OtherBuildersPanel() {
  return (
    <div className="relative w-full rounded-xl border border-white/10 bg-[#1a1a1f] p-4 overflow-hidden shadow-lg">
      {/* Watermark */}
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black tracking-widest select-none"
        style={{
          color: '#ef4444',
          opacity: 0.15,
          transform: 'rotate(-18deg)',
        }}
      >
        TEMPLATE
      </span>

      {/* Mock nav */}
      <div className="mb-3 flex gap-2">
        <div className="h-3 w-16 rounded bg-[#3a3a40]" />
        <div className="h-3 w-12 rounded bg-[#3a3a40]" />
        <div className="h-3 w-14 rounded bg-[#3a3a40]" />
        <div className="ml-auto h-3 w-8 rounded bg-[#4a4a50]" />
      </div>

      {/* Mock body */}
      <div className="flex gap-3">
        {/* Sidebar */}
        <div className="flex w-1/4 flex-col gap-2">
          <div className="h-6 rounded bg-[#2a2a30]" />
          <div className="h-6 rounded bg-[#2a2a30]" />
          <div className="h-6 rounded bg-[#2a2a30]" />
          <div className="h-6 rounded bg-[#2a2a30]" />
        </div>
        {/* Content area */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-8 w-3/4 rounded bg-[#2d2d33]" />
          <div className="h-20 rounded bg-[#252529]" />
          <div className="flex gap-2">
            <div className="h-10 flex-1 rounded bg-[#2a2a30]" />
            <div className="h-10 flex-1 rounded bg-[#2a2a30]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function KripTikPanel() {
  return (
    <div className="relative w-full rounded-xl border border-[#c8ff64]/20 bg-[#0f1115] p-4 overflow-hidden shadow-xl shadow-[#c8ff64]/5">
      {/* Custom badge */}
      <span
        className="absolute right-3 top-3 z-10 rounded-full px-3 py-0.5 text-xs font-bold tracking-wide"
        style={{
          color: '#c8ff64',
          border: '1px solid #c8ff64',
          boxShadow: '0 0 12px #c8ff6450',
          background: '#c8ff6410',
        }}
      >
        CUSTOM
      </span>

      {/* Mock nav */}
      <div className="mb-3 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-[#c8ff64]" />
        <div className="h-3 w-16 rounded bg-[#c8ff64]/30" />
        <div className="h-3 w-12 rounded bg-[#06b6d4]/30" />
        <div className="h-3 w-14 rounded bg-[#06b6d4]/20" />
        <div className="ml-auto h-3 w-8 rounded bg-[#c8ff64]/40" />
      </div>

      {/* Mock body */}
      <div className="flex gap-3">
        {/* Sidebar */}
        <div className="flex w-1/4 flex-col gap-2">
          <div className="h-6 rounded bg-[#c8ff64]/10 shadow-sm shadow-[#c8ff64]/10" />
          <div className="h-6 rounded bg-[#06b6d4]/10 shadow-sm shadow-[#06b6d4]/10" />
          <div className="h-6 rounded bg-[#c8ff64]/8" />
          <div className="h-6 rounded bg-[#06b6d4]/8" />
        </div>
        {/* Content area */}
        <div className="flex flex-1 flex-col gap-2">
          <div
            className="h-8 w-3/4 rounded"
            style={{
              background: 'linear-gradient(90deg, #c8ff6420, #06b6d420)',
              boxShadow: '0 2px 8px #c8ff6415',
            }}
          />
          <div
            className="h-20 rounded"
            style={{
              background: 'linear-gradient(135deg, #0d1117, #131820)',
              boxShadow: 'inset 0 1px 0 #c8ff640a, 0 4px 12px #00000040',
            }}
          />
          <div className="flex gap-2">
            <div
              className="h-10 flex-1 rounded"
              style={{
                background: '#c8ff6412',
                boxShadow: '0 2px 6px #c8ff6410',
              }}
            />
            <div
              className="h-10 flex-1 rounded"
              style={{
                background: '#06b6d412',
                boxShadow: '0 2px 6px #06b6d410',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── CSS Checkmark ──────────────────────────────── */

function Checkmark() {
  return (
    <span
      className="mr-2 inline-block h-4 w-4 flex-shrink-0 rounded-full"
      style={{
        background: '#c8ff64',
        boxShadow: '0 0 8px #c8ff6460',
        position: 'relative',
      }}
    >
      <span
        className="absolute"
        style={{
          left: '4.5px',
          top: '2px',
          width: '4px',
          height: '8px',
          border: 'solid #0a0a0a',
          borderWidth: '0 2px 2px 0',
          transform: 'rotate(45deg)',
        }}
      />
    </span>
  )
}

/* ── Progress bar ───────────────────────────────── */

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="progress-fill h-full rounded-full"
        style={{
          width: `${percent}%`,
          background: color,
          boxShadow: `0 0 10px ${color}60`,
          transition: 'width 1.2s ease',
        }}
      />
    </div>
  )
}

/* ── Main Section ───────────────────────────────── */

export default function QualitySection() {
  const sectionRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const badgesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title zoom-in
      if (titleRef.current) {
        gsap.fromTo(titleRef.current,
          { scale: 0.1, opacity: 0 },
          {
            scale: 1, opacity: 1, duration: 1.2, ease: 'back.out(1.7)',
            scrollTrigger: {
              trigger: titleRef.current,
              start: 'top 85%',
              toggleActions: 'play none none reverse',
            },
          },
        )
      }

      const isMobile = window.innerWidth < 768

      // Left panel: jitter + tilt away on scroll
      if (leftPanelRef.current) {
        // Micro-tremor (reduced amplitude on mobile)
        gsap.to(leftPanelRef.current, {
          x: isMobile ? '+=0.8' : '+=1.5',
          y: isMobile ? '+=0.5' : '+=1',
          rotation: isMobile ? 0.15 : 0.3,
          duration: 0.08, ease: 'none',
          yoyo: true, repeat: -1,
        })

        // Tilt away on scroll (reduced on mobile, not removed)
        gsap.fromTo(leftPanelRef.current,
          { rotateY: isMobile ? -2 : -4, opacity: 0, x: isMobile ? -30 : -60 },
          {
            rotateY: isMobile ? -8 : -18, opacity: 1, x: 0,
            scrollTrigger: {
              trigger: leftPanelRef.current,
              start: 'top 80%',
              end: 'bottom 30%',
              scrub: 1,
            },
          },
        )
      }

      // Right panel: come forward + grow
      if (rightPanelRef.current) {
        gsap.fromTo(rightPanelRef.current,
          { rotateY: isMobile ? 2 : 4, opacity: 0, x: isMobile ? 30 : 60, scale: 0.95 },
          {
            rotateY: isMobile ? 1 : 2, opacity: 1, x: 0, scale: isMobile ? 1.01 : 1.03,
            scrollTrigger: {
              trigger: rightPanelRef.current,
              start: 'top 80%',
              end: 'bottom 30%',
              scrub: 1,
            },
          },
        )
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="quality-section relative min-h-screen overflow-hidden px-6 py-24 md:py-32"
    >
      {/* Noise background */}
      <Suspense fallback={null}>
        <NoiseField opacity={0.04} speed={0.3} />
      </Suspense>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* ── Title ─────────────────────────── */}
        <div ref={titleRef} className="mb-16 text-center md:mb-24">
          <h2 className="text-5xl font-black tracking-tight text-white md:text-7xl">
            <VFXSpan shader={SHADER_ELECTRIC}>Not AI Slop.</VFXSpan>
          </h2>
        </div>

        {/* ── Comparison panels ──────────────── */}
        <div
          className="mb-16 grid gap-8 md:mb-24 md:grid-cols-2 md:gap-6"
          style={{ perspective: '1200px' }}
        >
          {/* Left: Other Builders */}
          <div
            ref={leftPanelRef}
            className="flex flex-col items-center"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <OtherBuildersPanel />
            <p className="mt-4 text-sm font-medium text-[#ef4444]/80">
              Template-driven
            </p>
            <ProgressBar percent={25} color="#ef4444" />
          </div>

          {/* VS divider — visible on mobile only */}
          <div className="flex items-center justify-center md:hidden">
            <div className="h-8 w-px bg-white/10" />
            <span
              className="mx-3 rounded-full px-3 py-1 text-xs font-black tracking-widest"
              style={{
                color: '#fff',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 0 16px rgba(200,255,100,0.08)',
              }}
            >
              VS
            </span>
            <div className="h-8 w-px bg-white/10" />
          </div>

          {/* Right: KripTik */}
          <div
            ref={rightPanelRef}
            className="flex flex-col items-center"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <KripTikPanel />
            <p className="mt-4 text-sm font-medium text-[#c8ff64]/80">
              Brain-driven intelligence
            </p>
            <ProgressBar percent={95} color="#c8ff64" />
          </div>
        </div>

        {/* ── Quality badges ────────────────── */}
        <div
          ref={badgesRef}
          className="mb-12 grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-center md:justify-center md:gap-4"
        >
          {QUALITY_RULES.map((rule, i) => (
            <motion.div
              key={rule}
              variants={badgeVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center rounded-full border px-4 py-2 text-sm font-medium text-white"
              style={{
                borderColor: '#c8ff6440',
                boxShadow: '0 0 12px #c8ff6418',
                background: '#c8ff6408',
              }}
            >
              <Checkmark />
              {rule}
            </motion.div>
          ))}
        </div>

        {/* ── Subtitle ──────────────────────── */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring' as const, stiffness: 60, damping: 16, delay: 0.6 }}
          className="text-center text-lg font-medium tracking-wide text-white/60 md:text-xl"
        >
          Custom. Intentional. Production-grade.
        </motion.p>
      </div>
    </section>
  )
}
