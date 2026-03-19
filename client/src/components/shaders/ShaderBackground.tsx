/**
 * ShaderBackground — Fullscreen OGL background with animated domain-warping noise
 *
 * Covers the entire viewport behind all content. Creates an organic,
 * slowly evolving surface that replaces flat #0a0a0a backgrounds.
 *
 * Design_References.md: OGL + domain warping noise + film grain
 */

import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

const FRAGMENT = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;

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

float fbm(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Very slow domain warp for living background
  float t = uTime * 0.02;
  vec3 p = vec3(uv * 1.5, t);
  float n = fbm(p + fbm(p + fbm(p + t)));

  // Deep dark color range — barely visible movement
  vec3 dark = vec3(0.028, 0.025, 0.035);
  vec3 mid = vec3(0.05, 0.045, 0.06);
  vec3 color = mix(dark, mid, n * 0.5 + 0.5);

  // Radial falloff — darker at edges
  float vignette = 1.0 - 0.35 * pow(length(uv - 0.5) * 1.4, 2.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;

const VERTEX = `attribute vec2 position; void main() { gl_Position = vec4(position, 0, 1); }`;

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new Renderer({ canvas, alpha: false, antialias: false, dpr: Math.min(window.devicePixelRatio, 1) });
    const gl = renderer.gl;
    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [canvas.width, canvas.height] },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      program.uniforms.uResolution.value = [window.innerWidth * renderer.dpr, window.innerHeight * renderer.dpr];
    }
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now();
    function render(time: number) {
      program.uniforms.uTime.value = (time - start) * 0.001;
      renderer.render({ scene: mesh });
      animRef.current = requestAnimationFrame(render);
    }
    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
