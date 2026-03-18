import { useRef, useEffect } from 'react';
import { Renderer, Camera, Program, Mesh, Plane as OGLPlane } from 'ogl';

import bgFragShader from './shaders/domain-warp-bg.frag?raw';

/**
 * Full-screen domain-warped background using OGL (not Three.js — lighter weight).
 *
 * FBM noise fed into itself creates surreal organic flowing patterns.
 * Agent count and build activity modulate the visual energy.
 * Near-black base with warm underlighting that breathes.
 */
export function WarpBackground({
  agentCount = 0,
  buildActive = false,
}: {
  agentCount?: number;
  buildActive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const programRef = useRef<any>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new Renderer({
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 1.5), // cap DPR for perf
    });
    rendererRef.current = renderer;
    const gl = renderer.gl;
    containerRef.current.appendChild(gl.canvas);

    const camera = new Camera(gl);
    camera.position.z = 1;

    const geometry = new OGLPlane(gl);
    const program = new Program(gl, {
      vertex: `
        attribute vec2 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 0, 1);
        }
      `,
      fragment: bgFragShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height] },
        uAgentCount: { value: 0 },
        uBuildActive: { value: 0 },
      },
    });
    programRef.current = program;

    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      if (!containerRef.current) return;
      renderer.setSize(containerRef.current.offsetWidth, containerRef.current.offsetHeight);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    };
    resize();
    window.addEventListener('resize', resize);

    let startTime = performance.now();
    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      program.uniforms.uTime.value = (performance.now() - startTime) * 0.001;
      renderer.render({ scene: mesh, camera });
    }
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      gl.canvas.remove();
    };
  }, []);

  // Update uniforms when props change
  useEffect(() => {
    if (programRef.current) {
      programRef.current.uniforms.uAgentCount.value = agentCount;
      programRef.current.uniforms.uBuildActive.value = buildActive ? 1.0 : 0.0;
    }
  }, [agentCount, buildActive]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 -z-10 overflow-hidden"
      style={{ pointerEvents: 'none' }}
    />
  );
}
