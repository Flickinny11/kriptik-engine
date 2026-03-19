/**
 * Custom 3D SVG Icons for the landing page.
 * No Lucide, no emojis — all custom gradient SVGs.
 */

interface IconProps {
  size?: number
  className?: string
}

export function KriptikLogo({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="klogo" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#c8ff64" />
          <stop offset="1" stopColor="#a0d850" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#klogo)" />
      <path d="M13 10v20M13 20l8-10M13 20l8 10" stroke="#0a0a0a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 15l4 5-4 5" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  )
}

export function PhoneIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="phone-g" x1="16" y1="6" x2="48" y2="58">
          <stop stopColor="#c8ff64" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="18" y="6" width="28" height="52" rx="6" stroke="url(#phone-g)" strokeWidth="2.5" fill="none" />
      <rect x="22" y="14" width="20" height="30" rx="2" fill="rgba(200,255,100,0.08)" stroke="rgba(200,255,100,0.25)" strokeWidth="1" />
      <circle cx="32" cy="52" r="2.5" fill="rgba(200,255,100,0.5)" />
      <rect x="26" y="8" width="12" height="2" rx="1" fill="rgba(200,255,100,0.3)" />
    </svg>
  )
}

export function AppStoreIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="app-g" x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#c8ff64" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="48" height="48" rx="14" stroke="url(#app-g)" strokeWidth="2.5" fill="rgba(245,158,11,0.06)" />
      <path d="M32 20v12M26 26l6-6 6 6" stroke="url(#app-g)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 38h20M22 44h12" stroke="rgba(245,158,11,0.4)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function CodeBracketIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="code-g" x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#06b6d4" />
          <stop offset="1" stopColor="#c8ff64" />
        </linearGradient>
      </defs>
      <path d="M24 16L10 32l14 16" stroke="url(#code-g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M40 16l14 16-14 16" stroke="url(#code-g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="36" y1="12" x2="28" y2="52" stroke="rgba(200,255,100,0.35)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function BrowserIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="browser-g" x1="6" y1="10" x2="58" y2="54">
          <stop stopColor="#c8ff64" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="52" height="44" rx="6" stroke="url(#browser-g)" strokeWidth="2.5" fill="none" />
      <line x1="6" y1="22" x2="58" y2="22" stroke="rgba(200,255,100,0.25)" strokeWidth="1.5" />
      <circle cx="15" cy="16" r="2" fill="#ff5f57" />
      <circle cx="23" cy="16" r="2" fill="#febc2e" />
      <circle cx="31" cy="16" r="2" fill="#28c840" />
      <rect x="14" y="28" width="36" height="4" rx="1" fill="rgba(200,255,100,0.12)" />
      <rect x="14" y="36" width="24" height="4" rx="1" fill="rgba(200,255,100,0.08)" />
      <rect x="14" y="44" width="30" height="3" rx="1" fill="rgba(200,255,100,0.05)" />
    </svg>
  )
}

export function WrenchIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="wrench-g" x1="10" y1="10" x2="54" y2="54">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path d="M40 14a10 10 0 0 0-14.14 14.14L14 40a4 4 0 0 0 5.66 5.66l11.86-11.86A10 10 0 0 0 40 14z" stroke="url(#wrench-g)" strokeWidth="2.5" fill="rgba(245,158,11,0.06)" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="20" r="3" fill="rgba(245,158,11,0.3)" />
    </svg>
  )
}

export function PuzzleIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="puzzle-g" x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#c8ff64" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M36 12H20a4 4 0 0 0-4 4v8h4a4 4 0 0 1 0 8h-4v8a4 4 0 0 0 4 4h8v-4a4 4 0 0 1 8 0v4h8a4 4 0 0 0 4-4V28h-4a4 4 0 0 1 0-8h4V16a4 4 0 0 0-4-4h-8v4a4 4 0 0 1-8 0v-4z" stroke="url(#puzzle-g)" strokeWidth="2.5" fill="rgba(200,255,100,0.05)" />
    </svg>
  )
}

export function NeuralIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="neural-g" x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#06b6d4" />
          <stop offset="0.5" stopColor="#c8ff64" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <line x1="32" y1="20" x2="16" y2="28" stroke="rgba(200,255,100,0.2)" strokeWidth="1.5" />
      <line x1="32" y1="20" x2="48" y2="28" stroke="rgba(200,255,100,0.2)" strokeWidth="1.5" />
      <line x1="16" y1="36" x2="24" y2="44" stroke="rgba(200,255,100,0.2)" strokeWidth="1.5" />
      <line x1="48" y1="36" x2="40" y2="44" stroke="rgba(200,255,100,0.2)" strokeWidth="1.5" />
      <line x1="16" y1="36" x2="40" y2="44" stroke="rgba(200,255,100,0.1)" strokeWidth="1" />
      <line x1="48" y1="36" x2="24" y2="44" stroke="rgba(200,255,100,0.1)" strokeWidth="1" />
      <circle cx="32" cy="16" r="5" stroke="url(#neural-g)" strokeWidth="2" fill="rgba(6,182,212,0.1)" />
      <circle cx="16" cy="32" r="5" stroke="url(#neural-g)" strokeWidth="2" fill="rgba(200,255,100,0.1)" />
      <circle cx="48" cy="32" r="5" stroke="url(#neural-g)" strokeWidth="2" fill="rgba(200,255,100,0.1)" />
      <circle cx="24" cy="48" r="5" stroke="url(#neural-g)" strokeWidth="2" fill="rgba(245,158,11,0.1)" />
      <circle cx="40" cy="48" r="5" stroke="url(#neural-g)" strokeWidth="2" fill="rgba(245,158,11,0.1)" />
    </svg>
  )
}

export function RocketIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="rocket-g" x1="16" y1="8" x2="48" y2="56">
          <stop stopColor="#c8ff64" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M32 8c-8 8-12 18-12 28h24c0-10-4-20-12-28z" stroke="url(#rocket-g)" strokeWidth="2.5" fill="rgba(200,255,100,0.05)" strokeLinejoin="round" />
      <circle cx="32" cy="28" r="4" fill="rgba(200,255,100,0.3)" stroke="url(#rocket-g)" strokeWidth="1.5" />
      <path d="M20 36l-6 8h10M44 36l6 8H40" stroke="rgba(245,158,11,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 48h12" stroke="rgba(245,158,11,0.5)" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 52h8" stroke="rgba(245,158,11,0.3)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function CloudDeployIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="cloud-g" x1="6" y1="16" x2="58" y2="48">
          <stop stopColor="#06b6d4" />
          <stop offset="1" stopColor="#c8ff64" />
        </linearGradient>
      </defs>
      <path d="M48 36a10 10 0 0 0-2-19.8A14 14 0 0 0 20 22a10 10 0 0 0-4 19h32z" stroke="url(#cloud-g)" strokeWidth="2.5" fill="rgba(6,182,212,0.05)" strokeLinejoin="round" />
      <path d="M32 28v16M26 38l6 6 6-6" stroke="url(#cloud-g)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SleepIcon3D({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <defs>
        <linearGradient id="sleep-g" x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#c8ff64" />
        </linearGradient>
      </defs>
      <path d="M42 12A20 20 0 1 0 44 44a16 16 0 0 1-2-32z" stroke="url(#sleep-g)" strokeWidth="2.5" fill="rgba(245,158,11,0.05)" />
      <text x="36" y="22" fill="rgba(200,255,100,0.6)" fontSize="10" fontWeight="bold">Z</text>
      <text x="42" y="16" fill="rgba(200,255,100,0.4)" fontSize="8" fontWeight="bold">Z</text>
      <text x="46" y="12" fill="rgba(200,255,100,0.25)" fontSize="6" fontWeight="bold">Z</text>
    </svg>
  )
}

export function NotifIcon3D({ size = 48 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <linearGradient id="notif-g" x1="8" y1="4" x2="40" y2="44">
          <stop stopColor="#c8ff64" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M24 4a12 12 0 0 0-12 12v8l-4 4v2h32v-2l-4-4v-8A12 12 0 0 0 24 4z" stroke="url(#notif-g)" strokeWidth="2" fill="rgba(200,255,100,0.05)" />
      <path d="M20 34a4 4 0 0 0 8 0" stroke="url(#notif-g)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="10" r="5" fill="#c8ff64" />
    </svg>
  )
}
