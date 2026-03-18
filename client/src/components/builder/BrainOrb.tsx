import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import brainFragShader from './shaders/brain-sdf.frag?raw';
import brainVertShader from './shaders/brain-sdf.vert?raw';

/**
 * SDF ray-marched Brain visualization.
 *
 * Renders as a mathematically-defined organic form — not a model, not a sphere
 * with textures. The entire brain is computed per-pixel in the fragment shader
 * using signed distance functions with smooth union blending.
 *
 * Activity drives visual intensity: idle = subtle pulse, active = warm glow with
 * visible synaptic tendrils. Read/write operations flash cyan/amber on the surface.
 */

function BrainMesh({ activity, readPulse, writePulse }: { activity: number; readPulse: number; writePulse: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(200, 200) },
    uActivity: { value: 0 },
    uReadPulse: { value: 0 },
    uWritePulse: { value: 0 },
    uBaseColor: { value: new THREE.Vector3(0.78, 1.0, 0.39) }, // kriptik lime
  }), []);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    // Smooth lerp toward target values
    materialRef.current.uniforms.uActivity.value += (activity - materialRef.current.uniforms.uActivity.value) * 0.05;
    materialRef.current.uniforms.uReadPulse.value += (readPulse - materialRef.current.uniforms.uReadPulse.value) * 0.1;
    materialRef.current.uniforms.uWritePulse.value += (writePulse - materialRef.current.uniforms.uWritePulse.value) * 0.1;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={brainVertShader}
        fragmentShader={brainFragShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export function BrainOrb({
  activity = 0,
  readPulse = 0,
  writePulse = 0,
  size = 80,
}: {
  activity?: number;
  readPulse?: number;
  writePulse?: number;
  size?: number;
}) {
  return (
    <div style={{ width: size, height: size }} className="relative">
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 1] }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <BrainMesh activity={activity} readPulse={readPulse} writePulse={writePulse} />
      </Canvas>
      {/* Label */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-kriptik-lime/50 whitespace-nowrap tracking-wider uppercase">
        brain
      </div>
    </div>
  );
}
