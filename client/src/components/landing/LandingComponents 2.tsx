/**
 * Landing page sub-components, constants, and VFX shaders.
 * Extracted from LandingPage for modularity (500-line limit).
 */

import { useRef, useEffect } from 'react'
import gsap from 'gsap'
import {
  VercelIcon, NetlifyIcon, AWSIcon, CloudflareIcon, SupabaseIcon,
  GitHubIcon, GoogleIcon, StripeIcon, SlackIcon, DiscordIcon,
  HuggingFaceIcon, OpenAIIcon, AnthropicIcon, ReplicateIcon, ModalIcon,
} from '@/components/ui/icons'

/* ═══════════════════════════════════════════
   VFX SHADERS — Design_References.md §1, §11
   5 unique custom GLSL shaders for react-vfx
   ═══════════════════════════════════════════ */

/** Liquid displacement + chromatic split — organic text distortion */
export const SHADER_LIQUID_WARP = `
precision mediump float;
uniform vec2 resolution; uniform vec2 offset; uniform float time; uniform sampler2D src;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  float w1 = sin(uv.x * 10.0 + time * 1.8) * cos(uv.y * 7.0 + time * 1.2) * 0.006;
  float w2 = cos(uv.x * 5.0 - time * 2.5) * sin(uv.y * 9.0 + time * 0.8) * 0.004;
  float w3 = sin((uv.x + uv.y) * 8.0 + time * 3.0) * 0.002;
  vec2 d = uv + vec2(w1 + w3, w2 + w3 * 0.7);
  float r = texture2D(src, d + vec2(0.003, 0.001)).r;
  float g = texture2D(src, d).g;
  float b = texture2D(src, d - vec2(0.003, 0.001)).b;
  gl_FragColor = vec4(r, g, b, texture2D(src, d).a);
}
`

/** Electric pulse with scanline — cybernetic text effect */
export const SHADER_ELECTRIC = `
precision mediump float;
uniform vec2 resolution; uniform vec2 offset; uniform float time; uniform sampler2D src;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  float distort = sin(uv.y * 40.0 + time * 6.0) * 0.002;
  vec4 col = texture2D(src, uv + vec2(distort, 0.0));
  float scanline = sin(uv.y * resolution.y * 0.5 + time * 8.0) * 0.06;
  float pulse = pow(sin(time * 3.0) * 0.5 + 0.5, 3.0);
  col.rgb += scanline * pulse; col.r += distort * 15.0 * pulse;
  gl_FragColor = col;
}
`

/** Holographic scanline — subtle rainbow shift + flicker */
export const SHADER_HOLOGRAM = `
precision mediump float;
uniform vec2 resolution; uniform vec2 offset; uniform float time; uniform sampler2D src;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  float scan = sin(uv.y * resolution.y * 0.5 + time * 2.0) * 0.025;
  float shift = sin(uv.y * 6.0 + time * 1.5) * 0.004;
  float r = texture2D(src, uv + vec2(shift, scan * 0.5)).r;
  float g = texture2D(src, uv + vec2(0.0, scan)).g;
  float b = texture2D(src, uv + vec2(-shift, scan * 0.3)).b;
  float flicker = 0.97 + 0.03 * sin(time * 12.0);
  gl_FragColor = vec4(r * flicker, g * flicker, b * flicker, texture2D(src, uv).a);
}
`

/** Data corruption glitch — block-based RGB tear */
export const SHADER_GLITCH = `
precision mediump float;
uniform vec2 resolution; uniform vec2 offset; uniform float time; uniform sampler2D src;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  float block = floor(uv.y * 12.0);
  float glitch = step(0.96, fract(sin(block * 43758.5453 + floor(time * 4.0)) * 2.0));
  vec2 d = uv;
  d.x += glitch * (fract(sin(time * 7.0 + block) * 43758.5453) - 0.5) * 0.08;
  float r = texture2D(src, d + vec2(0.003 * glitch, 0.0)).r;
  float g = texture2D(src, d).g;
  float b = texture2D(src, d - vec2(0.003 * glitch, 0.0)).b;
  gl_FragColor = vec4(r, g, b, texture2D(src, d).a);
}
`

/** Neural network pulse — radial wave + displacement */
export const SHADER_NEURAL = `
precision mediump float;
uniform vec2 resolution; uniform vec2 offset; uniform float time; uniform sampler2D src;
void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  float dist = length(uv - 0.5);
  float pulse = sin(dist * 20.0 - time * 3.0) * 0.5 + 0.5;
  pulse = smoothstep(0.3, 0.7, pulse);
  float d = pulse * 0.003;
  vec2 displaced = uv + vec2(d * sin(time), d * cos(time * 0.7));
  vec4 col = texture2D(src, displaced);
  float glow = smoothstep(0.02, 0.0, abs(fract(dist * 5.0 - time * 0.5) - 0.5));
  col.rgb += glow * vec3(0.2, 0.8, 0.1) * 0.15;
  gl_FragColor = col;
}
`

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

export const BUILD_TYPES = ['Mobile Apps', 'iOS Apps', 'Software', 'Web Apps'] as const

export const BUILD_DATA = [
  { title: 'Mobile Apps', sub: 'Native performance. Beautiful UI. Full-stack mobile from a single prompt.', color: '#c8ff64' },
  { title: 'iOS Apps', sub: 'Swift & SwiftUI. App Store-ready architecture from day one.', color: '#06b6d4' },
  { title: 'Software', sub: 'Desktop, CLI, server-side. Enterprise-grade architecture.', color: '#f59e0b' },
  { title: 'Web Apps', sub: 'Modern frameworks. Responsive. Production-grade. Deployed.', color: '#c8ff64' },
]

export const CAPABILITIES = [
  {
    title: 'Fix My App',
    desc: 'Bring your broken project. We diagnose root causes, trace the architecture, and ship a real fix — not a band-aid.',
    align: 'left' as const, color: '#f59e0b', shader: SHADER_GLITCH,
  },
  {
    title: 'Komplete My App',
    desc: 'Half-finished app collecting dust? Hand it over. We analyze what exists and build the rest — fast, correct, production-grade.',
    align: 'right' as const, color: '#06b6d4', shader: SHADER_HOLOGRAM,
  },
  {
    title: 'Train & Fine-Tune',
    desc: 'Custom AI models tuned to your data, your domain, your use case. From fine-tuning to deployment — end to end.',
    align: 'left' as const, color: '#c8ff64', shader: SHADER_NEURAL,
  },
]

export const DEPLOY_FEATURES = [
  { title: 'Real Databases', desc: 'PostgreSQL, Supabase, or your own. Production schemas, migrations, and seed data.', color: '#c8ff64' },
  { title: 'Real APIs', desc: '178 integrations probed and configured. OAuth, API keys, webhooks — all wired.', color: '#06b6d4' },
  { title: 'Real Infrastructure', desc: 'Vercel, AWS, Netlify, Cloudflare. Deployed, monitored, production-grade.', color: '#f59e0b' },
  { title: 'Full Source Code', desc: 'Every line is yours. No lock-in, no proprietary runtime, no strings attached.', color: '#c8ff64' },
  { title: 'Continuous Verification', desc: '28 quality rules enforced in real-time. TypeScript strict, SAST, no placeholders.', color: '#06b6d4' },
  { title: 'Ship in Your Sleep', desc: 'Builds run autonomously for up to 24 hours. Get notified when it is ready.', color: '#f59e0b' },
]

export const QUALITY_BARS = [
  { label: 'Others', sublabel: 'Template-driven', pct: 25, color: '#ef4444' },
  { label: 'KripTik', sublabel: 'Brain-driven intelligence', pct: 95, color: '#c8ff64' },
]

export const PLATFORMS = [
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
   REUSABLE COMPONENTS
   ═══════════════════════════════════════════ */

/** 3D-rotating build type text — cycles through items with perspective flip */
export function RotatingBuildType({ items }: { items: readonly string[] }) {
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

/** CSS 3D rotating ring of branded platform logos with colored glow */
export function PlatformCarousel() {
  const ringRef = useRef<HTMLDivElement>(null)
  const count = PLATFORMS.length
  const angleStep = 360 / count

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
              transform: `rotateY(${angleStep * i}deg) translateZ(320px)`,
              backfaceVisibility: 'hidden',
            }}>
            <div className="w-[4.5rem] h-[4.5rem] rounded-2xl flex items-center justify-center border"
              style={{
                background: `${p.color}12`, borderColor: `${p.color}25`,
                boxShadow: `0 0 25px ${p.color}20, 0 0 50px ${p.color}08`,
              }}>
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
