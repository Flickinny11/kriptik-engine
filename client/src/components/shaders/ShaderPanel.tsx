/**
 * ShaderPanel — WebGL-driven panel background using OGL
 *
 * Renders a fullscreen triangle with GLSL domain-warping noise behind panel content.
 * Real GPU shaders — NOT glassmorphism, NOT CSS gradients.
 *
 * Design_References.md: OGL + GLSL noise + domain warping
 * Reference: https://github.com/oframe/ogl/blob/master/examples/triangle-screen-shader.html
 */

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

// Domain warping noise fragment shader
const FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uNoiseScale;
uniform float uWarpStrength;

varying vec2 vUv;

vec3 hash33(vec3 p) {
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash33(i),f), dot(hash33(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
    mix(dot(hash33(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(hash33(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
    mix(mix(dot(hash33(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(hash33(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
    mix(dot(hash33(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(hash33(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}

float warpedNoise(vec3 p) {
  vec3 q = vec3(noise(p), noise(p + vec3(5.2,1.3,2.8)), noise(p + vec3(1.7,9.2,3.4)));
  vec3 r = vec3(noise(p + uWarpStrength * q + vec3(1.7,9.2,0) + 0.15*uTime),
                noise(p + uWarpStrength * q + vec3(8.3,2.8,0) + 0.126*uTime), 0.0);
  return noise(p + uWarpStrength * r);
}

void main() {
  float n = warpedNoise(vec3(vUv * uNoiseScale, uTime * 0.05));
  vec3 color = mix(uColorA, uColorB, n * 0.5 + 0.5);
  color *= 1.0 - 0.4 * length(vUv - 0.5);
  float grain = (fract(sin(dot(vUv * uTime, vec2(12.9898,78.233))) * 43758.5453) - 0.5) * 0.012;
  color += grain;
  gl_FragColor = vec4(color, 1.0);
}
`;

const VERT = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

interface ShaderPanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  colorA?: [number, number, number];
  colorB?: [number, number, number];
  noiseScale?: number;
  warpStrength?: number;
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
  const initRef = useRef(false);
  const [shaderReady, setShaderReady] = useState(false);

  useEffect(() => {
    if (initRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Wait for the container to have actual dimensions (layout must resolve first)
    const initWebGL = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) {
        // Layout not resolved yet — retry next frame
        requestAnimationFrame(initWebGL);
        return;
      }

      initRef.current = true;

      // Dynamic import to avoid SSR issues
      import('ogl').then(({ Renderer, Program, Mesh, Triangle }) => {
        const renderer = new Renderer({ canvas, alpha: false, antialias: false, dpr: Math.min(window.devicePixelRatio, 1.5) });
        const gl = renderer.gl;

        renderer.setSize(rect.width, rect.height);

        const geometry = new Triangle(gl);
        const program = new Program(gl, {
          vertex: VERT,
          fragment: FRAG,
          uniforms: {
            uTime: { value: 0 },
            uResolution: { value: [rect.width * renderer.dpr, rect.height * renderer.dpr] },
            uColorA: { value: colorA },
            uColorB: { value: colorB },
            uNoiseScale: { value: noiseScale },
            uWarpStrength: { value: warpStrength },
          },
        });
        const mesh = new Mesh(gl, { geometry, program });

        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) {
              renderer.setSize(width, height);
              program.uniforms.uResolution.value = [width * renderer.dpr, height * renderer.dpr];
            }
          }
        });
        observer.observe(container);

        const startTime = performance.now();
        let firstFrame = true;
        const render = (time: number) => {
          program.uniforms.uTime.value = (time - startTime) * 0.001;
          renderer.render({ scene: mesh });
          if (firstFrame) { firstFrame = false; setShaderReady(true); }
          animRef.current = requestAnimationFrame(render);
        };
        animRef.current = requestAnimationFrame(render);

        // Cleanup stored for unmount
        (container as any).__shaderCleanup = () => {
          cancelAnimationFrame(animRef.current);
          observer.disconnect();
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        };
      });
    };

    requestAnimationFrame(initWebGL);

    return () => {
      cancelAnimationFrame(animRef.current);
      const cleanup = (containerRef.current as any)?.__shaderCleanup;
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', borderRadius, background: '#0c0c10', ...style }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 'inherit', pointerEvents: 'none', opacity: shaderReady ? 1 : 0 }}
      />
      {/* Edge highlight for 3D depth */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.04)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>{children}</div>
    </div>
  );
}
