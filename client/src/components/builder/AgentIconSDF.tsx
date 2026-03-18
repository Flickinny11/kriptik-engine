import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import agentIconFrag from './shaders/agent-icon.frag?raw';

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

/**
 * SDF metaball agent icon — mathematically rendered, not flat SVG.
 *
 * Each agent gets a unique color. The icon morphs based on the agent's current state:
 * idle = gentle ambient pulse, thinking = breathing rhythm, writing = rapid inner flicker,
 * tool call = rotating highlight, error = red pulse.
 *
 * Spawn animation: the metaball cluster materializes from nothing via smooth union.
 */

function AgentIconMesh({ color, state, spawnProgress }: { color: string; state: number; spawnProgress: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const colorVec = useMemo(() => {
    const c = new THREE.Color(color);
    return new THREE.Vector3(c.r, c.g, c.b);
  }, [color]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(48, 48) },
    uColor: { value: colorVec },
    uState: { value: 0 },
    uSpawnProgress: { value: 0 },
  }), [colorVec]);

  useFrame((s) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = s.clock.elapsedTime;
    matRef.current.uniforms.uState.value += (state - matRef.current.uniforms.uState.value) * 0.08;
    matRef.current.uniforms.uSpawnProgress.value += (spawnProgress - matRef.current.uniforms.uSpawnProgress.value) * 0.06;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={agentIconFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// Map event types to state numbers
const STATE_MAP: Record<string, number> = {
  agent_thinking: 1,
  agent_text: 1,
  agent_tool_call: 3,
  agent_tool_result: 3,
  agent_file_write: 2,
  agent_discovery: 2,
  agent_error: 5,
  agent_spawned: 0,
  agent_stopped: 0,
};

export function AgentIconSDF({
  color,
  eventType = '',
  size = 32,
}: {
  color: string;
  eventType?: string;
  size?: number;
}) {
  const [spawnProgress, setSpawnProgress] = useState(0);

  useEffect(() => {
    // Animate spawn
    const timeout = setTimeout(() => setSpawnProgress(1), 50);
    return () => clearTimeout(timeout);
  }, []);

  const state = STATE_MAP[eventType] ?? 0;

  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 1] }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <AgentIconMesh color={color} state={state} spawnProgress={spawnProgress} />
      </Canvas>
    </div>
  );
}
