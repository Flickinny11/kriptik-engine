/**
 * ShaderButton — GSAP-animated 3D button with depth and glow
 *
 * Uses GSAP for smooth hover/press animations with real 3D transforms,
 * perspective, and dynamic shadow response. NOT CSS transitions.
 *
 * Design_References.md: GSAP for all animations
 */

import { useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import gsap from 'gsap';

interface ShaderButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const VARIANTS = {
  default: {
    bg: 'rgba(255,255,255,0.04)',
    bgHover: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.06)',
    borderHover: 'rgba(255,255,255,0.12)',
    color: 'rgba(200,200,210,0.9)',
    colorHover: '#fff',
    shadow: '0 2px 8px rgba(0,0,0,0.2)',
    shadowHover: '0 6px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)',
  },
  primary: {
    bg: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    bgHover: 'linear-gradient(135deg, #fcd34d, #fbbf24)',
    border: 'rgba(251,191,36,0.3)',
    borderHover: 'rgba(251,191,36,0.5)',
    color: '#0a0a0a',
    colorHover: '#000',
    shadow: '0 4px 16px rgba(251,191,36,0.15)',
    shadowHover: '0 8px 32px rgba(251,191,36,0.3), 0 0 20px rgba(251,191,36,0.1)',
  },
  accent: {
    bg: 'rgba(251,191,36,0.08)',
    bgHover: 'rgba(251,191,36,0.15)',
    border: 'rgba(251,191,36,0.15)',
    borderHover: 'rgba(251,191,36,0.3)',
    color: '#fbbf24',
    colorHover: '#fcd34d',
    shadow: '0 2px 8px rgba(0,0,0,0.2)',
    shadowHover: '0 4px 16px rgba(251,191,36,0.1)',
  },
  danger: {
    bg: 'transparent',
    bgHover: 'rgba(248,113,113,0.08)',
    border: 'transparent',
    borderHover: 'rgba(248,113,113,0.15)',
    color: 'rgba(161,161,170,0.6)',
    colorHover: '#f87171',
    shadow: 'none',
    shadowHover: '0 2px 12px rgba(248,113,113,0.1)',
  },
  ghost: {
    bg: 'transparent',
    bgHover: 'rgba(255,255,255,0.05)',
    border: 'transparent',
    borderHover: 'transparent',
    color: 'rgba(161,161,170,0.6)',
    colorHover: '#fff',
    shadow: 'none',
    shadowHover: 'none',
  },
};

const SIZES = {
  sm: { padding: '5px 10px', fontSize: '11px', borderRadius: '7px' },
  md: { padding: '7px 14px', fontSize: '12px', borderRadius: '9px' },
  lg: { padding: '10px 20px', fontSize: '13px', borderRadius: '11px' },
};

export function ShaderButton({
  children,
  onClick,
  disabled = false,
  variant = 'default',
  size = 'md',
  className = '',
  style,
  title,
}: ShaderButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const v = VARIANTS[variant];
  const s = SIZES[size];

  useEffect(() => {
    const btn = btnRef.current;
    if (!btn || disabled) return;

    const enterAnim = () => {
      gsap.to(btn, {
        y: -1,
        scale: 1.02,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: true,
      });
      gsap.to(btn, {
        boxShadow: v.shadowHover,
        borderColor: v.borderHover,
        color: v.colorHover,
        duration: 0.2,
        ease: 'power2.out',
      });
    };

    const leaveAnim = () => {
      gsap.to(btn, {
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: 'power2.inOut',
        overwrite: true,
      });
      gsap.to(btn, {
        boxShadow: v.shadow,
        borderColor: v.border,
        color: v.color,
        duration: 0.25,
        ease: 'power2.inOut',
      });
    };

    const pressAnim = () => {
      gsap.to(btn, { scale: 0.97, y: 1, duration: 0.1, ease: 'power3.out' });
    };

    const releaseAnim = () => {
      gsap.to(btn, { scale: 1.02, y: -1, duration: 0.15, ease: 'power2.out' });
    };

    btn.addEventListener('mouseenter', enterAnim);
    btn.addEventListener('mouseleave', leaveAnim);
    btn.addEventListener('mousedown', pressAnim);
    btn.addEventListener('mouseup', releaseAnim);

    return () => {
      btn.removeEventListener('mouseenter', enterAnim);
      btn.removeEventListener('mouseleave', leaveAnim);
      btn.removeEventListener('mousedown', pressAnim);
      btn.removeEventListener('mouseup', releaseAnim);
    };
  }, [disabled, v]);

  return (
    <button
      ref={btnRef}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 500,
        fontFamily: 'inherit',
        borderRadius: s.borderRadius,
        border: `1px solid ${v.border}`,
        background: v.bg,
        color: v.color,
        boxShadow: v.shadow,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        transition: 'none', // GSAP handles all transitions
        willChange: 'transform',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
