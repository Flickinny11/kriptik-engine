/**
 * FloatingPanelIcon3D — Animated 3D orb icon for floating panels
 *
 * Used by FloatingSoftInterrupt and other floating panels.
 * Renders a layered SVG orb with gradient fills and optional glow ring.
 */

import { type ReactNode } from 'react';

interface FloatingOrbIconProps {
  size?: number;
  accent?: string;
  core?: string;
  ring?: string;
  variant?: 'interrupt' | 'tool' | 'default';
  className?: string;
  children?: ReactNode;
}

export function FloatingOrbIcon({
  size = 34,
  accent = '#f59e0b',
  core = '#fde68a',
  ring = '#fb923c',
  variant = 'default',
  className = '',
  children,
}: FloatingOrbIconProps) {
  const id = `orb-${variant}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <radialGradient id={`${id}-core`} cx="40%" cy="35%">
            <stop offset="0%" stopColor={core} />
            <stop offset="60%" stopColor={accent} />
            <stop offset="100%" stopColor={ring} stopOpacity="0.8" />
          </radialGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer glow */}
        <circle cx="20" cy="20" r="18" fill={`url(#${id}-glow)`} />

        {/* Ring */}
        <ellipse
          cx="20"
          cy="20"
          rx="14"
          ry="5"
          transform="rotate(-20 20 20)"
          stroke={ring}
          strokeWidth="1.2"
          fill="none"
          opacity="0.6"
        />

        {/* Core orb */}
        <circle cx="20" cy="20" r="10" fill={`url(#${id}-core)`} />

        {/* Specular highlight */}
        <ellipse
          cx="17"
          cy="16"
          rx="4"
          ry="3"
          fill="white"
          opacity="0.35"
        />
      </svg>

      {/* Child icon overlay */}
      {children && (
        <div className="relative z-10 flex items-center justify-center" style={{ width: size * 0.45, height: size * 0.45 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function InterruptGlyph({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 text-white ${className}`}
    >
      <path d="M8 2v8" />
      <circle cx="8" cy="13" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default FloatingOrbIcon;
