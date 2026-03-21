/**
 * PhysicsLogos — Rapier2D WASM physics simulation for platform logos
 *
 * Logos drop with real gravity, bounce off walls and floor, settle into place.
 * Uses @dimforge/rapier2d-compat for WASM-based rigid body physics.
 * Design_References.md §8 — Rapier WASM Physics
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import {
  VercelIcon, NetlifyIcon, AWSIcon, CloudflareIcon, SupabaseIcon,
  GitHubIcon, GoogleIcon, StripeIcon, SlackIcon, DiscordIcon,
  HuggingFaceIcon, OpenAIIcon, AnthropicIcon, ReplicateIcon, ModalIcon,
} from '@/components/ui/icons'

const LOGOS = [
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

interface BodyState {
  x: number
  y: number
  rotation: number
}

export default function PhysicsLogos({ className = '' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [bodies, setBodies] = useState<BodyState[]>([])
  const [ready, setReady] = useState(false)

  // Intersection observer for lazy init
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.1, rootMargin: '100px',
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Rapier physics simulation
  useEffect(() => {
    if (!visible || !containerRef.current) return

    let destroyed = false
    let raf = 0
    let worldRef: any = null

    ;(async () => {
      const RAPIER = await import('@dimforge/rapier2d-compat')
      await RAPIER.init()
      if (destroyed) return

      const container = containerRef.current!
      const rect = container.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const scale = 50 // pixels per physics meter

      // World with gravity
      const gravity = new RAPIER.Vector2(0.0, 9.81)
      const world = new RAPIER.World(gravity)
      worldRef = world

      // Floor
      const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w / 2 / scale, h / scale))
      world.createCollider(RAPIER.ColliderDesc.cuboid(w / scale, 0.1).setRestitution(0.4), floorBody)

      // Left wall
      const leftBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-0.1, h / 2 / scale))
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, h / scale).setRestitution(0.3), leftBody)

      // Right wall
      const rightBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w / scale + 0.1, h / 2 / scale))
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, h / scale).setRestitution(0.3), rightBody)

      // Create logo bodies with staggered spawn positions
      const logoRigidBodies: any[] = []
      const logoSize = 0.5 // radius in physics units

      LOGOS.forEach((_, i) => {
        const col = i % 5
        const row = Math.floor(i / 5)
        const x = (w / scale) * (0.15 + col * 0.175 + (Math.random() - 0.5) * 0.1)
        const y = -1 - row * 1.5 - Math.random() * 0.8

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y)
          .setAngvel((Math.random() - 0.5) * 4)
          .setLinearDamping(0.3)
          .setAngularDamping(0.8)

        const rb = world.createRigidBody(bodyDesc)
        const colliderDesc = RAPIER.ColliderDesc.ball(logoSize)
          .setRestitution(0.45)
          .setFriction(0.6)
          .setDensity(1.5)
        world.createCollider(colliderDesc, rb)
        logoRigidBodies.push(rb)
      })

      setReady(true)

      function step() {
        if (destroyed) return
        world.step()

        const newBodies: BodyState[] = logoRigidBodies.map((rb) => {
          const pos = rb.translation()
          const rot = rb.rotation()
          return { x: pos.x * scale, y: pos.y * scale, rotation: rot }
        })
        setBodies(newBodies)

        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })()

    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      try { worldRef?.free() } catch { /* noop */ }
    }
  }, [visible])

  // Mouse interaction: apply impulse to nearest logo
  const handleClick = useCallback((e: React.MouseEvent) => {
    // The physics world handles the visual — click just for fun factor
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className}`}
      style={{ height: '400px', overflow: 'hidden' }}
      onClick={handleClick}>
      {ready && LOGOS.map((logo, i) => {
        const body = bodies[i]
        if (!body) return null
        return (
          <div key={logo.name}
            className="absolute flex flex-col items-center gap-1"
            style={{
              left: body.x - 28,
              top: body.y - 28,
              transform: `rotate(${body.rotation}rad)`,
              willChange: 'transform',
              transition: 'none',
            }}>
            <div className="w-14 h-14 rounded-xl flex items-center justify-center border"
              style={{
                background: `${logo.color}12`,
                borderColor: `${logo.color}25`,
                boxShadow: `0 0 20px ${logo.color}15`,
              }}>
              <div style={{ filter: `brightness(0) invert(1) drop-shadow(0 0 6px ${logo.color})` }}>
                <logo.Icon size={26} />
              </div>
            </div>
            <span className="text-[9px] font-bold tracking-wide whitespace-nowrap"
              style={{ color: logo.color, textShadow: `0 0 8px ${logo.color}30` }}>
              {logo.name}
            </span>
          </div>
        )
      })}
      {!ready && visible && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-kriptik-lime/30 border-t-kriptik-lime rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
