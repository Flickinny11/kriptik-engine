import { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import connectorFrag from './shaders/connector-flow.frag?raw';

const CONNECTOR_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Glowing energy connector between an agent and the Brain.
 *
 * Rendered as a WebGL quad with a custom fragment shader that creates
 * fiber-optic style flowing energy pulses. The flow direction and intensity
 * change based on whether the agent is reading from or writing to the Brain.
 *
 * NOT a CSS dashed line. NOT a canvas 2D stroke. A proper shader effect.
 */

function ConnectorLine({
  color,
  intensity,
  progress,
  angle,
  length: lineLength,
}: {
  color: string;
  intensity: number;
  progress: number;
  angle: number;
  length: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const colorVec = useMemo(() => {
    const c = new THREE.Color(color);
    return new THREE.Vector3(c.r, c.g, c.b);
  }, [color]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uColor: { value: colorVec },
    uIntensity: { value: 0 },
  }), [colorVec]);

  useFrame((state) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uIntensity.value += (intensity - matRef.current.uniforms.uIntensity.value) * 0.08;
    matRef.current.uniforms.uProgress.value += (progress - matRef.current.uniforms.uProgress.value) * 0.05;
  });

  return (
    <mesh rotation={[0, 0, angle]} position={[0, 0, 0]}>
      <planeGeometry args={[lineLength, 0.08]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={CONNECTOR_VERT}
        fragmentShader={connectorFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/**
 * Container that renders multiple connector lines from agents to the brain.
 * Each active agent gets a line. Lines glow brighter during read/write operations.
 */
export function BrainConnectors({
  agents,
  recentEvents,
}: {
  agents: Map<string, { sessionId: string; color: string; status: string }>;
  recentEvents: Array<{ type: string; data: Record<string, unknown> }>;
}) {
  const agentList = useMemo(() => Array.from(agents.values()).filter(a => a.status === 'active'), [agents]);

  // Determine which agents are actively communicating with brain
  const activeComms = useMemo(() => {
    const comms = new Map<string, { intensity: number; progress: number }>();
    const recent = recentEvents.slice(-10);
    for (const agent of agentList) {
      const agentEvents = recent.filter(e => (e.data.sessionId as string) === agent.sessionId);
      const hasBrainActivity = agentEvents.some(e =>
        e.type === 'brain_node_created' || e.type === 'brain_node_updated' ||
        e.type === 'agent_discovery' || e.type === 'brain_edge_created'
      );
      const hasToolActivity = agentEvents.some(e =>
        e.type === 'agent_tool_call' || e.type === 'agent_file_write'
      );
      comms.set(agent.sessionId, {
        intensity: hasBrainActivity ? 1.0 : hasToolActivity ? 0.3 : 0.1,
        progress: hasBrainActivity ? 0.8 : 0.0,
      });
    }
    return comms;
  }, [agentList, recentEvents]);

  if (agentList.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[5]" style={{ opacity: 0.6 }}>
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 2], fov: 50 }}
        style={{ background: 'transparent' }}
        dpr={[1, 1.5]}
      >
        {agentList.map((agent, i) => {
          const angle = ((i - (agentList.length - 1) / 2) * 0.4);
          const comm = activeComms.get(agent.sessionId) || { intensity: 0.1, progress: 0 };
          return (
            <ConnectorLine
              key={agent.sessionId}
              color={agent.color}
              intensity={comm.intensity}
              progress={comm.progress}
              angle={angle}
              length={1.5}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
