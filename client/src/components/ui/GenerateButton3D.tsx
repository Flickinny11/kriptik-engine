import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  rotation: number;
  color: string;
}

interface GenerateButton3DProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const GenerateButton3D = ({ onClick, disabled, className }: GenerateButton3DProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [heatLevel, setHeatLevel] = useState(0);
  const [shimmerPos, setShimmerPos] = useState(-100);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shimmerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Idle shimmer sweep — continuous metallic light sweep every 4s
  useEffect(() => {
    const runSweep = () => {
      const start = performance.now();
      const animate = (now: number) => {
        const p = (now - start) / 2000;
        if (p >= 1) return;
        setShimmerPos(-100 + p * 300);
        requestAnimationFrame(animate);
      };
      setShimmerPos(-100);
      requestAnimationFrame(animate);
    };
    runSweep();
    shimmerRef.current = setInterval(runSweep, 4000);
    return () => { if (shimmerRef.current) clearInterval(shimmerRef.current); };
  }, []);

  // Heat-up on hover
  useEffect(() => {
    if (isHovered && !disabled) {
      hoverTimerRef.current = setInterval(() => {
        setHeatLevel(prev => Math.min(prev + 0.08, 1));
      }, 40);
    } else {
      if (hoverTimerRef.current) clearInterval(hoverTimerRef.current);
      setHeatLevel(0);
    }
    return () => { if (hoverTimerRef.current) clearInterval(hoverTimerRef.current); };
  }, [isHovered, disabled]);

  // Particle burst on click
  const createParticles = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const colors = ['#60e0ff', '#a0f0ff', '#30c0e0', '#80d0f0', '#ffffff', '#4080ff'];
    const newP: Particle[] = [];
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.4;
      const speed = 2.5 + Math.random() * 4;
      newP.push({
        id: i,
        x: cx + (Math.random() - 0.5) * 30,
        y: cy + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        size: 2 + Math.random() * 4,
        opacity: 1,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    setParticles(newP);
    setIsClicked(true);
    const interval = setInterval(() => {
      setParticles(prev => {
        const updated = prev.map(pt => ({
          ...pt,
          x: pt.x + pt.vx,
          y: pt.y + pt.vy,
          vy: pt.vy + 0.25,
          opacity: pt.opacity - 0.03,
          rotation: pt.rotation + 6,
        })).filter(pt => pt.opacity > 0);
        if (updated.length === 0) setIsClicked(false);
        return updated;
      });
    }, 16);
    setTimeout(() => { clearInterval(interval); setParticles([]); setIsClicked(false); }, 1200);
  }, []);

  const handleClick = () => {
    if (disabled) return;
    createParticles();
    onClick();
  };

  const h = heatLevel;

  // Dark titanium base with depth
  const baseGradient = `linear-gradient(
    145deg,
    rgba(18, 20, 38, 0.95) 0%,
    rgba(30, 35, 60, 0.9) 25%,
    rgba(45, 55, 90, 0.85) 50%,
    rgba(30, 35, 65, 0.9) 75%,
    rgba(15, 18, 35, 0.95) 100%
  )`;

  // Metallic sheen overlay
  const metallicLayer = `linear-gradient(
    165deg,
    transparent 0%,
    rgba(100, 180, 255, ${0.04 + h * 0.08}) 20%,
    rgba(150, 220, 255, ${0.08 + h * 0.12}) 40%,
    rgba(200, 240, 255, ${0.12 + h * 0.15}) 50%,
    rgba(150, 220, 255, ${0.08 + h * 0.1}) 60%,
    rgba(100, 180, 255, ${0.04 + h * 0.06}) 80%,
    transparent 100%
  )`;

  const glowColor = `rgba(80, 180, 255, ${0.15 + h * 0.35})`;
  const edgeColor = `rgba(120, 200, 255, ${0.3 + h * 0.4})`;

  return (
    <div className={cn("relative", className)}>
      {/* Particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute pointer-events-none z-50"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            transform: `rotate(${p.rotation}deg) scale(${p.opacity})`,
            background: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            boxShadow: `0 0 ${p.size * 1.5}px ${p.color}`,
          }}
        />
      ))}

      <button
        ref={buttonRef}
        onClick={handleClick}
        disabled={disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => setIsHovered(false)}
        className={cn(
          "relative overflow-hidden",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '7px 18px',
          borderRadius: '12px',
          border: `1px solid ${edgeColor}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'Syne, system-ui, sans-serif',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#d0eeff',
          background: baseGradient,
          boxShadow: `
            0 1px 0 rgba(180, 220, 255, ${0.15 + h * 0.15}) inset,
            0 -2px 0 rgba(0, 0, 0, 0.3) inset,
            0 ${3 + h * 2}px 0 rgba(8, 10, 25, 0.9),
            0 ${4 + h * 3}px 0 rgba(5, 8, 20, 0.7),
            0 ${6 + h * 4}px ${10 + h * 10}px ${glowColor},
            0 ${10 + h * 8}px ${20 + h * 16}px rgba(60, 140, 220, ${0.08 + h * 0.12}),
            0 0 ${h * 25}px ${glowColor}
          `,
          transform: `
            perspective(600px)
            rotateX(${isHovered ? 0 : 2}deg)
            rotateY(${isHovered ? 0 : -1}deg)
            translateY(${isHovered ? -2 : 0}px)
            scale(${isClicked ? 0.93 : 1})
          `,
          transformStyle: 'preserve-3d',
          transition: isClicked
            ? 'transform 0.08s ease-out, box-shadow 0.08s ease-out'
            : 'all 0.35s cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        {/* Metallic highlight layer */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: metallicLayer, borderRadius: '11px' }}
        />

        {/* Sweeping shimmer */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(
              105deg,
              transparent 0%,
              rgba(180, 230, 255, ${0.06 + h * 0.1}) 45%,
              rgba(220, 245, 255, ${0.14 + h * 0.16}) 50%,
              rgba(180, 230, 255, ${0.06 + h * 0.1}) 55%,
              transparent 100%
            )`,
            borderRadius: '11px',
            transform: `translateX(${isHovered ? 120 : shimmerPos}%)`,
            transition: isHovered ? 'transform 0.6s ease-in-out' : 'none',
          }}
        />

        {/* Heat glow pulse */}
        {h > 0.1 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 50%, rgba(100,200,255,${h * 0.12}) 0%, transparent 70%)`,
              borderRadius: '11px',
              animation: 'genPulse 0.6s ease-in-out infinite',
            }}
          />
        )}

        {/* Top edge highlight — simulates top surface catching light */}
        <div
          className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
          style={{
            background: `linear-gradient(90deg,
              rgba(120,200,255,0.05) 0%,
              rgba(180,230,255,${0.25 + h * 0.25}) 50%,
              rgba(120,200,255,0.05) 100%
            )`,
            borderRadius: '12px 12px 0 0',
          }}
        />

        {/* 3D bottom extrusion */}
        <div
          className="absolute -bottom-[3px] left-[3px] right-[3px] h-[4px] pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(15,20,40,0.9) 0%, rgba(5,8,18,1) 100%)',
            borderRadius: '0 0 10px 10px',
            transform: 'perspective(80px) rotateX(-12deg)',
            transformOrigin: 'top center',
          }}
        />

        {/* Bolt icon */}
        <svg
          className="relative z-10"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          style={{ filter: `drop-shadow(0 0 ${2 + h * 4}px rgba(100,200,255,${0.4 + h * 0.4}))` }}
        >
          <path
            d="M8.5 1L3 9.5H7.5L7 15L13 6.5H8.5L8.5 1Z"
            fill={`rgba(140,220,255,${0.8 + h * 0.2})`}
            stroke="rgba(200,240,255,0.6)"
            strokeWidth="0.5"
          />
        </svg>

        {/* Label */}
        <span
          className="relative z-10"
          style={{ textShadow: `0 0 ${4 + h * 8}px rgba(100,200,255,${0.3 + h * 0.3}), 0 1px 2px rgba(0,0,0,0.5)` }}
        >
          Generate
        </span>
      </button>

      <style>{`
        @keyframes genPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default GenerateButton3D;
