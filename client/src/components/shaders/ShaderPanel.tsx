/**
 * ShaderPanel — WebGL-driven panel background using OGL
 *
 * Renders a fullscreen quad behind the panel content with a GLSL shader
 * that creates domain-warping noise, photorealistic depth, and subtle
 * animated grain. NOT glassmorphism. NOT CSS gradients. Real GPU shaders.
 *
 * Design_References.md: OGL + GLSL noise + domain warping
 */

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

// Domain warping noise fragment shader — creates organic, living surface
const FRAGMENT_SHADER = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uNoiseScale;
uniform float uWarpStrength;

// Simplex-style hash
vec3 hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// 3D simplex-like noise
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mix(dot(hash33(i), f),
            dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
        mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
            dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
    mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
            dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
        mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
            dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
    u.z
  );
}

// Domain warping — feeds noise back into itself for organic distortion
float warpedNoise(vec3 p) {
  vec3 q = vec3(
    noise(p),
    noise(p + vec3(5.2, 1.3, 2.8)),
    noise(p + vec3(1.7, 9.2, 3.4))
  );
  vec3 r = vec3(
    noise(p + uWarpStrength * q + vec3(1.7, 9.2, 0.0) + 0.15 * uTime),
    noise(p + uWarpStrength * q + vec3(8.3, 2.8, 0.0) + 0.126 * uTime),
    0.0
  );
  return noise(p + uWarpStrength * r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Domain warped noise
  float n = warpedNoise(vec3(uv * uNoiseScale, uTime * 0.05));

  // Map to color range
  vec3 color = mix(uColorA, uColorB, n * 0.5 + 0.5);

  // Add subtle vignette for depth
  float vignette = 1.0 - 0.4 * length(uv - 0.5);
  color *= vignette;

  // Film grain for photorealistic texture
  float grain = (fract(sin(dot(uv * uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.015;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

const VERTEX_SHADER = `
attribute vec2 position;
attribute vec2 uv;
void main() {
  gl_Position = vec4(position, 0, 1);
}
`;

interface ShaderPanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Base color A (dark) — default: deep charcoal */
  colorA?: [number, number, number];
  /** Base color B (highlight) — default: subtle warm */
  colorB?: [number, number, number];
  /** Noise scale — default: 3.0 */
  noiseScale?: number;
  /** Warp strength — default: 0.8 */
  warpStrength?: number;
  /** Border radius in px — default: 14 */
  borderRadius?: number;
}

export function ShaderPanel({
  children,
  className = '',
  style,
  colorA = [0.04, 0.04, 0.055],
  colorB = [0.08, 0.07, 0.09],
  noiseScale = 3.0,
  warpStrength = 0.8,
  borderRadius = 14,
}: ShaderPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new Renderer({ canvas, alpha: false, antialias: false, dpr: Math.min(window.devicePixelRatio, 1.5) });
    const gl = renderer.gl;

    // Fullscreen triangle (more efficient than quad)
    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [canvas.width, canvas.height] },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uNoiseScale: { value: noiseScale },
        uWarpStrength: { value: warpStrength },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      const { width, height } = container!.getBoundingClientRect();
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width * renderer.dpr, height * renderer.dpr];
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let startTime = performance.now();
    function render(time: number) {
      program.uniforms.uTime.value = (time - startTime) * 0.001;
      renderer.render({ scene: mesh });
      animRef.current = requestAnimationFrame(render);
    }
    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [colorA, colorB, noiseScale, warpStrength]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius,
        ...style,
      }}
    >
      {/* WebGL canvas — the actual shader surface */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          borderRadius: 'inherit',
          pointerEvents: 'none',
        }}
      />
      {/* Subtle edge highlight for 3D depth perception */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        pointerEvents: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.04)',
      }} />
      {/* Content layer */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
        {children}
      </div>
    </div>
  );
}
