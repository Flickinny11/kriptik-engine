/**
 * CardExplosion — Hollywood-quality 3D explosion effect
 *
 * Full-screen canvas overlay that renders:
 * - 3D-projected debris fragments with physics (gravity, rotation, floor bounce)
 * - Additive-blended fire/spark particles
 * - Rising smoke plumes
 * - Expanding shockwave ring
 * - Screen shake callback
 * - Debris-to-card collision detection (bumps nearby cards)
 *
 * All rendering uses Canvas 2D with perspective projection — no extra deps.
 */

import { useEffect, useRef, useCallback, memo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExplosionEvent {
  id: string;
  x: number;       // center X (viewport px)
  y: number;       // center Y (viewport px)
  width: number;    // card width
  height: number;   // card height
}

export interface CardRect {
  id: string;
  rect: DOMRect;
}

export interface CardExplosionProps {
  explosions: ExplosionEvent[];
  onComplete: (id: string) => void;
  otherCardRects?: CardRect[];
  onCardBumped?: (cardId: string, force: { x: number; y: number }) => void;
  onScreenShake?: (intensity: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAVITY       = 1200;   // px/s²
const AIR_RESIST    = 0.985;
const FOV           = 800;    // perspective depth
const DEBRIS_N      = 55;
const FIRE_N        = 90;
const SPARK_N       = 50;
const SMOKE_N       = 18;
const EMBER_N       = 30;
const DURATION_MS   = 3400;   // total explosion lifetime

const DEBRIS_COLORS = [
  '#1a1a1a', '#2d2d2d', '#383838', '#444', '#555',
  '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d',
  '#f97316', '#fb923c',
];
const FIRE_COLORS = [
  'rgba(255,255,255,0.95)',
  'rgba(255,245,120,0.9)',
  'rgba(255,190,60,0.85)',
  'rgba(255,120,30,0.8)',
  'rgba(220,60,10,0.7)',
  'rgba(180,30,0,0.5)',
];
const SPARK_COLORS = ['#fff', '#fffbe6', '#ffd700', '#ff8c00', '#ff4500'];
const SMOKE_COLORS = [
  'rgba(50,50,50,0.35)',
  'rgba(70,70,70,0.25)',
  'rgba(90,90,90,0.18)',
];
const EMBER_COLORS = [
  'rgba(255,120,0,0.85)',
  'rgba(255,160,40,0.7)',
  'rgba(255,200,80,0.6)',
];

// ---------------------------------------------------------------------------
// Particle
// ---------------------------------------------------------------------------

type PType = 'debris' | 'fire' | 'spark' | 'smoke' | 'ember' | 'shockwave';

interface Particle {
  type: PType;
  // 3D position (relative to explosion center in viewport space)
  x: number; y: number; z: number;
  // velocity
  vx: number; vy: number; vz: number;
  // rotation (radians) + angular velocity
  rz: number; vrz: number;
  // visual
  w: number; h: number;
  color: string;
  alpha: number;
  // lifetime
  life: number;     // remaining 0→1
  maxLife: number;   // seconds
  age: number;       // seconds elapsed
  // origin (viewport)
  ox: number; oy: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Perspective project: returns screen x, y, scale */
function project3D(
  px: number, py: number, pz: number,
  cx: number, cy: number,
) {
  const d = Math.max(FOV + pz, 1);
  const scale = FOV / d;
  return { sx: cx + px * scale, sy: cy + py * scale, scale };
}

// Fire color interpolation based on life
function fireColor(life: number): string {
  if (life > 0.8) return FIRE_COLORS[0];
  if (life > 0.6) return FIRE_COLORS[1];
  if (life > 0.4) return FIRE_COLORS[2];
  if (life > 0.2) return FIRE_COLORS[3];
  if (life > 0.1) return FIRE_COLORS[4];
  return FIRE_COLORS[5];
}

// ---------------------------------------------------------------------------
// Spawn helpers
// ---------------------------------------------------------------------------

function spawnDebris(ox: number, oy: number, cw: number, ch: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < DEBRIS_N; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(250, 700);
    const upBias = rand(-500, -200);
    particles.push({
      type: 'debris',
      x: rand(-cw * 0.3, cw * 0.3),
      y: rand(-ch * 0.3, ch * 0.3),
      z: rand(-80, 80),
      vx: Math.cos(angle) * speed + rand(-100, 100),
      vy: upBias + Math.sin(angle) * speed * 0.5,
      vz: rand(-200, 200),
      rz: rand(0, Math.PI * 2),
      vrz: rand(-12, 12),
      w: rand(8, 36),
      h: rand(6, 28),
      color: pick(DEBRIS_COLORS),
      alpha: 1,
      life: 1,
      maxLife: rand(1.8, 3.2),
      age: 0,
      ox, oy,
    });
  }
  return particles;
}

function spawnFire(ox: number, oy: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < FIRE_N; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(100, 450);
    particles.push({
      type: 'fire',
      x: rand(-20, 20), y: rand(-20, 20), z: rand(-40, 40),
      vx: Math.cos(angle) * speed,
      vy: rand(-400, -80) + Math.sin(angle) * speed * 0.3,
      vz: rand(-60, 60),
      rz: 0, vrz: 0,
      w: rand(12, 50), h: 0,
      color: '', alpha: rand(0.7, 1),
      life: 1, maxLife: rand(0.3, 0.9), age: 0,
      ox, oy,
    });
  }
  return particles;
}

function spawnSparks(ox: number, oy: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < SPARK_N; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(400, 1100);
    particles.push({
      type: 'spark',
      x: rand(-10, 10), y: rand(-10, 10), z: rand(-20, 20),
      vx: Math.cos(angle) * speed,
      vy: rand(-600, -100) + Math.sin(angle) * speed * 0.4,
      vz: rand(-100, 100),
      rz: 0, vrz: 0,
      w: rand(2, 5), h: 0,
      color: pick(SPARK_COLORS), alpha: 1,
      life: 1, maxLife: rand(0.4, 1.2), age: 0,
      ox, oy,
    });
  }
  return particles;
}

function spawnSmoke(ox: number, oy: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < SMOKE_N; i++) {
    particles.push({
      type: 'smoke',
      x: rand(-30, 30), y: rand(-10, 20), z: rand(-20, 20),
      vx: rand(-40, 40),
      vy: rand(-120, -40),
      vz: rand(-10, 10),
      rz: rand(0, Math.PI * 2), vrz: rand(-0.5, 0.5),
      w: rand(40, 90), h: 0,
      color: pick(SMOKE_COLORS), alpha: rand(0.15, 0.3),
      life: 1, maxLife: rand(1.5, 3.0), age: 0,
      ox, oy,
    });
  }
  return particles;
}

function spawnEmbers(ox: number, oy: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < EMBER_N; i++) {
    particles.push({
      type: 'ember',
      x: rand(-40, 40), y: rand(-20, 20), z: rand(-30, 30),
      vx: rand(-60, 60),
      vy: rand(-180, -60),
      vz: rand(-20, 20),
      rz: 0, vrz: 0,
      w: rand(2, 6), h: 0,
      color: pick(EMBER_COLORS), alpha: rand(0.6, 1),
      life: 1, maxLife: rand(1.2, 2.8), age: 0,
      ox, oy,
    });
  }
  return particles;
}

function spawnShockwave(ox: number, oy: number): Particle {
  return {
    type: 'shockwave',
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    rz: 0, vrz: 0,
    w: 10, h: 0,
    color: 'rgba(255,200,100,0.6)', alpha: 0.7,
    life: 1, maxLife: 0.6, age: 0,
    ox, oy,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CardExplosion = memo(function CardExplosion({
  explosions,
  onComplete,
  otherCardRects,
  onCardBumped,
  onScreenShake,
}: CardExplosionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const scenesRef = useRef<Map<string, { particles: Particle[]; startTime: number }>>(new Map());
  const processedRef = useRef<Set<string>>(new Set());
  const bumpedRef = useRef<Set<string>>(new Set()); // track which cards already bumped

  // Spawn a new explosion scene
  const spawnExplosion = useCallback((evt: ExplosionEvent) => {
    const particles: Particle[] = [
      ...spawnDebris(evt.x, evt.y, evt.width, evt.height),
      ...spawnFire(evt.x, evt.y),
      ...spawnSparks(evt.x, evt.y),
      ...spawnSmoke(evt.x, evt.y),
      ...spawnEmbers(evt.x, evt.y),
      spawnShockwave(evt.x, evt.y),
    ];
    scenesRef.current.set(evt.id, { particles, startTime: performance.now() });
    bumpedRef.current.clear();

    // Trigger screen shake
    onScreenShake?.(1);
  }, [onScreenShake]);

  // Register new explosions
  useEffect(() => {
    for (const evt of explosions) {
      if (!processedRef.current.has(evt.id) && !scenesRef.current.has(evt.id)) {
        processedRef.current.add(evt.id);
        spawnExplosion(evt);
      }
    }
  }, [explosions, spawnExplosion]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function tick(now: number) {
      animRef.current = requestAnimationFrame(tick);
      if (!ctx || !canvas) return;

      const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
      lastTime = now;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      ctx.clearRect(0, 0, vw, vh);

      const completedIds: string[] = [];

      for (const [id, scene] of scenesRef.current) {
        const elapsed = (now - scene.startTime) / 1000;
        if (elapsed > DURATION_MS / 1000) {
          completedIds.push(id);
          continue;
        }

        // Update & draw particles
        const alive: Particle[] = [];

        // Sort by z for depth (far first)
        scene.particles.sort((a, b) => b.z - a.z);

        for (const p of scene.particles) {
          p.age += dt;
          p.life = Math.max(0, 1 - p.age / p.maxLife);
          if (p.life <= 0) continue;

          // --- Physics per type ---
          switch (p.type) {
            case 'debris': {
              p.vy += GRAVITY * dt;
              p.vx *= AIR_RESIST;
              p.vy *= AIR_RESIST;
              p.vz *= AIR_RESIST;
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.z += p.vz * dt;
              p.rz += p.vrz * dt;

              // Floor bounce
              const screenY = p.oy + p.y;
              if (screenY > vh + 20) {
                p.y = vh + 20 - p.oy;
                p.vy *= -0.35;
                p.vrz *= 0.6;
              }

              // Card collision detection
              if (otherCardRects && onCardBumped) {
                const sx = p.ox + p.x;
                const sy = p.oy + p.y;
                for (const cr of otherCardRects) {
                  const r = cr.rect;
                  const bumpKey = `${id}-${cr.id}-${Math.floor(p.age * 4)}`;
                  if (
                    !bumpedRef.current.has(bumpKey) &&
                    sx > r.left - 15 && sx < r.right + 15 &&
                    sy > r.top - 15 && sy < r.bottom + 15
                  ) {
                    bumpedRef.current.add(bumpKey);
                    const fx = (sx - (r.left + r.width / 2)) * 0.15;
                    const fy = (sy - (r.top + r.height / 2)) * 0.15;
                    onCardBumped(cr.id, { x: fx, y: fy });
                    // Deflect debris slightly
                    p.vx *= -0.3;
                    p.vy *= -0.3;
                  }
                }
              }

              // Draw debris with 3D perspective
              const proj = project3D(p.x, p.y, p.z, p.ox, p.oy);
              const sw = p.w * proj.scale;
              const sh = p.h * proj.scale;
              ctx.save();
              ctx.translate(proj.sx, proj.sy);
              ctx.rotate(p.rz);
              ctx.globalAlpha = p.alpha * Math.min(p.life * 2, 1);
              ctx.fillStyle = p.color;
              // Slight 3D shading
              ctx.shadowColor = 'rgba(0,0,0,0.4)';
              ctx.shadowBlur = 4 * proj.scale;
              ctx.shadowOffsetY = 2 * proj.scale;
              ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
              ctx.restore();
              break;
            }

            case 'fire': {
              p.vy -= 180 * dt; // fire rises
              p.vx *= 0.96;
              p.vy *= 0.96;
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.z += p.vz * dt;

              const proj = project3D(p.x, p.y, p.z, p.ox, p.oy);
              const size = p.w * proj.scale * (0.3 + p.life * 0.7);

              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = p.alpha * p.life * p.life;
              const grad = ctx.createRadialGradient(proj.sx, proj.sy, 0, proj.sx, proj.sy, size);
              const fc = fireColor(p.life);
              grad.addColorStop(0, fc);
              grad.addColorStop(0.5, fc.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 0.4})`));
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(proj.sx, proj.sy, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              break;
            }

            case 'spark': {
              p.vy += GRAVITY * 0.4 * dt;
              p.vx *= 0.98;
              p.vy *= 0.98;
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              p.z += p.vz * dt;

              const proj = project3D(p.x, p.y, p.z, p.ox, p.oy);
              const trailLen = Math.min(Math.hypot(p.vx, p.vy) * 0.015, 20) * proj.scale;

              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = p.alpha * p.life;
              ctx.strokeStyle = p.color;
              ctx.lineWidth = p.w * proj.scale;
              ctx.lineCap = 'round';
              ctx.beginPath();
              const angle = Math.atan2(p.vy, p.vx);
              ctx.moveTo(proj.sx, proj.sy);
              ctx.lineTo(
                proj.sx - Math.cos(angle) * trailLen,
                proj.sy - Math.sin(angle) * trailLen
              );
              ctx.stroke();
              // Bright head
              ctx.fillStyle = '#fff';
              ctx.globalAlpha = p.alpha * p.life * 0.9;
              ctx.beginPath();
              ctx.arc(proj.sx, proj.sy, p.w * proj.scale * 0.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              break;
            }

            case 'smoke': {
              p.vy -= 30 * dt; // slow rise
              p.vx += rand(-15, 15) * dt; // turbulence
              p.x += p.vx * dt;
              p.y += p.vy * dt;

              const proj = project3D(p.x, p.y, p.z, p.ox, p.oy);
              const size = p.w * proj.scale * (1 + (1 - p.life) * 1.5);

              ctx.save();
              ctx.globalAlpha = p.alpha * p.life * p.life;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(proj.sx, proj.sy, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              break;
            }

            case 'ember': {
              p.vy -= 50 * dt; // float up
              p.vx += rand(-20, 20) * dt;
              p.x += p.vx * dt;
              p.y += p.vy * dt;

              const proj = project3D(p.x, p.y, p.z, p.ox, p.oy);

              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = p.alpha * p.life;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(proj.sx, proj.sy, p.w * proj.scale, 0, Math.PI * 2);
              ctx.fill();
              // Glow
              ctx.globalAlpha = p.alpha * p.life * 0.3;
              ctx.beginPath();
              ctx.arc(proj.sx, proj.sy, p.w * proj.scale * 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              break;
            }

            case 'shockwave': {
              const radius = (1 - p.life) * 350;
              const lineW = Math.max(3 - (1 - p.life) * 3, 0.5);

              ctx.save();
              ctx.globalAlpha = p.alpha * p.life * p.life;
              ctx.strokeStyle = `rgba(255,200,100,${p.life * 0.6})`;
              ctx.lineWidth = lineW;
              ctx.beginPath();
              ctx.arc(p.ox, p.oy, radius, 0, Math.PI * 2);
              ctx.stroke();
              // Inner glow
              if (p.life > 0.5) {
                const glowGrad = ctx.createRadialGradient(p.ox, p.oy, radius * 0.7, p.ox, p.oy, radius);
                glowGrad.addColorStop(0, 'rgba(255,180,80,0)');
                glowGrad.addColorStop(0.8, `rgba(255,150,50,${p.life * 0.15})`);
                glowGrad.addColorStop(1, 'rgba(255,100,20,0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(p.ox, p.oy, radius, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
              break;
            }
          }

          alive.push(p);
        }

        scene.particles = alive;
      }

      // Clean up completed
      for (const id of completedIds) {
        scenesRef.current.delete(id);
        onComplete(id);
      }
    }

    animRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [onComplete, otherCardRects, onCardBumped]);

  // Don't render canvas if no active scenes and no pending explosions
  const hasActiveScenes = scenesRef.current.size > 0 || explosions.length > 0;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: hasActiveScenes ? 1 : 0,
      }}
    />
  );
});

export default CardExplosion;
