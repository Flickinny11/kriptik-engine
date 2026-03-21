/**
 * ShipSection — "Ship Software In Your Sleep" timeline visualization
 *
 * 24-hour timeline ring with scroll-driven GSAP progress arc,
 * notification mockups, and PhysicsLogos deploy showcase.
 */

import { useRef, useEffect, useState, Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const PhysicsLogos = lazy(() => import('./PhysicsLogos'))

const TIMELINE_EVENTS: readonly { hour: number; label: string; color: string; angle: number; pulse?: boolean }[] = [
  { hour: 22, label: 'Build started', color: '#c8ff64', angle: -60 },
  { hour: 0, label: 'Architecture done', color: '#06b6d4', angle: 0 },
  { hour: 2, label: 'Frontend built', color: '#c8ff64', angle: 30 },
  { hour: 4, label: 'APIs integrated', color: '#f59e0b', angle: 60 },
  { hour: 6, label: 'Verified & deployed', color: '#c8ff64', angle: 90, pulse: true },
]

const NOTIFICATIONS = [
  { type: 'email', text: 'Your app is ready', from: 'KripTik AI', color: '#c8ff64' },
  { type: 'sms', text: 'Build complete! View at yourapp.kriptik.app', color: '#06b6d4' },
  { type: 'slack', text: '#kriptik \u2014 Build deployed successfully \u2713', color: '#f59e0b' },
] as const

const HOUR_LABELS = [
  { hour: 12, label: '12am', x: 0, y: -1 },
  { hour: 3, label: '6am', x: 1, y: 0 },
  { hour: 6, label: '12pm', x: 0, y: 1 },
  { hour: 9, label: '6pm', x: -1, y: 0 },
]

function toRadians(deg: number) {
  return (deg - 90) * (Math.PI / 180)
}

function pointOnCircle(angleDeg: number, r: number) {
  const rad = toRadians(angleDeg)
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r }
}

function TimelineRing({ progress }: { progress: number }) {
  const r = 140
  const circumference = 2 * Math.PI * r
  const arcOffset = circumference * (1 - progress)
  const centerText = progress >= 0.98 ? 'Done.' : '24h'

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="-200 -200 400 400"
        className="w-[320px] h-[320px] md:w-[400px] md:h-[400px]"
      >
        <defs>
          <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c8ff64" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Background ring */}
        <circle
          cx={0} cy={0} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3}
        />

        {/* 24 tick marks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = i * 15
          const inner = pointOnCircle(angle, r - 8)
          const outer = pointOnCircle(angle, r + 8)
          return (
            <line
              key={i}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={i % 6 === 0 ? 2 : 1}
            />
          )
        })}

        {/* Hour labels */}
        {HOUR_LABELS.map(({ label, x, y }) => (
          <text
            key={label}
            x={x * (r + 28)}
            y={y * (r + 28)}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.4)"
            fontSize={12}
            fontFamily="monospace"
          >
            {label}
          </text>
        ))}

        {/* Progress arc */}
        <circle
          cx={0} cy={0} r={r}
          fill="none"
          stroke="url(#arc-grad)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={arcOffset}
          transform="rotate(-150)"
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />

        {/* Center text */}
        <text
          x={0} y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={progress >= 0.98 ? 32 : 40}
          fontWeight={700}
          fontFamily="monospace"
          style={{ transition: 'font-size 0.3s ease' }}
        >
          {centerText}
        </text>
      </svg>

      {/* Event indicators */}
      {TIMELINE_EVENTS.map((evt) => {
        const eventProgress = (evt.angle + 60) / 150
        const visible = progress >= eventProgress
        const pos = pointOnCircle(evt.angle - 150, 140)
        const scaleFactor = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.8 : 1

        return (
          <motion.div
            key={evt.hour}
            className="absolute pointer-events-none"
            style={{
              left: `calc(50% + ${pos.x * scaleFactor}px)`,
              top: `calc(50% + ${pos.y * scaleFactor}px)`,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={visible ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ type: 'spring' as const, stiffness: 400, damping: 20 }}
          >
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-3 h-3 rounded-full ${evt.pulse ? 'animate-pulse' : ''}`}
                style={{
                  background: evt.color,
                  boxShadow: `0 0 12px ${evt.color}60`,
                  width: evt.pulse ? 16 : 12,
                  height: evt.pulse ? 16 : 12,
                }}
              />
              <span
                className="text-[10px] md:text-xs whitespace-nowrap font-medium"
                style={{ color: evt.color }}
              >
                {evt.label}
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function NotificationCard({
  notification,
  index,
  visible,
}: {
  notification: typeof NOTIFICATIONS[number]
  index: number
  visible: boolean
}) {
  const icons: Record<string, string> = {
    email: '\u2709',
    sms: '\u{1F4F1}',
    slack: '\u{1F4AC}',
  }

  return (
    <motion.div
      className="w-full max-w-xs md:max-w-sm"
      initial={{ x: 120, opacity: 0 }}
      animate={visible ? { x: 0, opacity: 1 } : { x: 120, opacity: 0 }}
      transition={{
        type: 'spring' as const,
        stiffness: 260,
        damping: 24,
        delay: index * 0.15,
      }}
    >
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{
          background: 'rgba(15,15,20,0.85)',
          border: `1px solid ${notification.color}30`,
          boxShadow: `0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 ${notification.color}10`,
        }}
      >
        <span className="text-lg mt-0.5 shrink-0" aria-hidden>
          {icons[notification.type]}
        </span>
        <div className="min-w-0">
          {notification.type === 'email' && (
            <p className="text-[11px] mb-0.5" style={{ color: `${notification.color}90` }}>
              {notification.from}
            </p>
          )}
          {notification.type === 'slack' && (
            <p className="text-[11px] text-white/40 mb-0.5">Slack</p>
          )}
          {notification.type === 'sms' && (
            <p className="text-[11px] text-white/40 mb-0.5">iMessage</p>
          )}
          <p className="text-sm text-white/90 leading-snug">{notification.text}</p>
        </div>
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
          style={{ background: notification.color }}
        />
      </div>
    </motion.div>
  )
}

export default function ShipSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [progress, setProgress] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    const title = titleRef.current
    if (!section || !title) return

    const ctx = gsap.context(() => {
      // Title entrance
      gsap.from(title, {
        scale: 0.85,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      })

      // Timeline progress driven by scroll
      ScrollTrigger.create({
        trigger: section,
        start: 'top 60%',
        end: 'bottom 40%',
        scrub: 0.5,
        onUpdate: (self) => {
          setProgress(self.progress)
          if (self.progress > 0.75) {
            setShowNotifications(true)
          }
        },
      })
    }, section)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="ship-section min-h-screen relative py-24 md:py-32 px-6 overflow-hidden"
    >
      {/* Title */}
      <h2
        ref={titleRef}
        className="text-4xl md:text-6xl font-bold text-center mb-16 md:mb-24"
      >
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: 'linear-gradient(135deg, #f59e0b, #c8ff64, #06b6d4)',
          }}
        >
          Ship Software In Your Sleep
        </span>
      </h2>

      {/* Main content: ring + notifications */}
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-16">
        {/* Timeline ring with overlaid notifications on mobile */}
        <div className="relative flex-1 flex justify-center">
          <TimelineRing progress={progress} />

          {/* Mobile: notifications overlaid on ring area */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 gap-2 pointer-events-none md:hidden">
            {NOTIFICATIONS.map((n, i) => (
              <div key={n.type} className="pointer-events-auto w-full px-2">
                <NotificationCard
                  notification={n}
                  index={i}
                  visible={showNotifications}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: notifications beside ring */}
        <div className="hidden md:flex flex-1 flex-col gap-3 items-start">
          {NOTIFICATIONS.map((n, i) => (
            <NotificationCard
              key={n.type}
              notification={n}
              index={i}
              visible={showNotifications}
            />
          ))}
        </div>
      </div>

      {/* Connecting line from ring to deploy section */}
      <div className="flex justify-center my-4 md:hidden">
        <div
          className="w-px h-16"
          style={{
            background: 'linear-gradient(to bottom, #c8ff6440, #06b6d420, transparent)',
          }}
        />
      </div>

      {/* Deploy platform section */}
      <div className="mt-12 md:mt-32 text-center">
        <p className="text-white/50 text-sm md:text-base tracking-wide uppercase mb-8">
          Deploys to any platform
        </p>
        <div className="max-w-4xl mx-auto h-[220px] min-[375px]:h-[300px] md:h-[360px]">
          <Suspense fallback={<div className="w-full h-full" />}>
            <PhysicsLogos />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
