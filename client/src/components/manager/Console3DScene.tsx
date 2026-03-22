/**
 * Console 3D Background Scene
 *
 * Floating glass geometric shapes for the Manager's Console background.
 * Uses MeshTransmissionMaterial for photorealistic glass refraction
 * with adaptive quality fallback for lower-end devices.
 */

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
    Float,
    Environment,
    Lightformer,
    RoundedBox,
    Sphere,
    MeshTransmissionMaterial,
} from '@react-three/drei';
import * as THREE from 'three';
import { getQualityLevel, supportsTransmission } from '@/lib/webgl';

/* ── Shape configuration ──────────────────────────────────────────────── */

const SHAPES: Array<{
    type: 'sphere' | 'box' | 'torus';
    position: [number, number, number];
    scale: number;
    speed: number;
}> = [
    { type: 'sphere', position: [-7, 3.5, -10], scale: 1.3, speed: 0.7 },
    { type: 'box', position: [8, -2.5, -12], scale: 1.0, speed: 1.0 },
    { type: 'sphere', position: [3.5, 4.5, -14], scale: 0.8, speed: 0.55 },
    { type: 'box', position: [-4.5, -3.5, -7], scale: 0.55, speed: 1.2 },
    { type: 'torus', position: [6, 1.5, -11], scale: 0.85, speed: 0.85 },
    { type: 'sphere', position: [-2.5, -4.5, -16], scale: 1.1, speed: 0.65 },
    { type: 'torus', position: [-8, 0, -13], scale: 0.6, speed: 1.05 },
];

/* ── GlassShape ───────────────────────────────────────────────────────── */

function GlassShape({
    type,
    position,
    scale: shapeScale,
    speed,
}: (typeof SHAPES)[0]) {
    const meshRef = useRef<THREE.Mesh>(null);
    const useTransmissionMat = supportsTransmission();
    const quality = getQualityLevel();

    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.x =
            Math.sin(state.clock.elapsedTime * speed * 0.3) * 0.15;
        meshRef.current.rotation.y += 0.002 * speed;
    });

    const transmissionMat = (
        <MeshTransmissionMaterial
            backside
            samples={quality === 'high' ? 12 : 6}
            resolution={quality === 'high' ? 512 : 256}
            transmission={0.92}
            roughness={0.08}
            thickness={0.5}
            ior={1.5}
            chromaticAberration={0.06}
            distortion={0.12}
            distortionScale={0.3}
            temporalDistortion={0.15}
            clearcoat={1}
            attenuationDistance={0.5}
            attenuationColor="#f59e0b"
            color="#fff7ed"
        />
    );

    const fallbackMat = (
        <meshPhysicalMaterial
            color="#fff7ed"
            transmission={0.85}
            roughness={0.15}
            thickness={0.4}
            ior={1.5}
            clearcoat={0.8}
            envMapIntensity={1.2}
            transparent
        />
    );

    const material = useTransmissionMat ? transmissionMat : fallbackMat;

    return (
        <Float
            speed={speed}
            rotationIntensity={0.15}
            floatIntensity={0.25}
            floatingRange={[-0.15, 0.15]}
        >
            {type === 'sphere' ? (
                <Sphere
                    ref={meshRef}
                    args={[1, 32, 32]}
                    position={position}
                    scale={shapeScale}
                >
                    {material}
                </Sphere>
            ) : type === 'box' ? (
                <RoundedBox
                    ref={meshRef}
                    args={[1.5, 1.5, 1.5]}
                    radius={0.15}
                    position={position}
                    scale={shapeScale}
                >
                    {material}
                </RoundedBox>
            ) : (
                <mesh ref={meshRef} position={position} scale={shapeScale}>
                    <torusGeometry args={[1, 0.35, 16, 32]} />
                    {material}
                </mesh>
            )}
        </Float>
    );
}

/* ── Ambient Particles ────────────────────────────────────────────────── */

function AmbientParticles({ count = 40 }: { count?: number }) {
    const ref = useRef<THREE.Points>(null);

    const positions = useMemo(() => {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            arr[i * 3] = (Math.random() - 0.5) * 30;
            arr[i * 3 + 1] = (Math.random() - 0.5) * 20;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
        }
        return arr;
    }, [count]);

    useFrame((state) => {
        if (!ref.current) return;
        ref.current.rotation.y = state.clock.elapsedTime * 0.015;
        ref.current.rotation.x =
            Math.sin(state.clock.elapsedTime * 0.04) * 0.05;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positions, 3]}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.035}
                color="#f59e0b"
                transparent
                opacity={0.35}
                sizeAttenuation
            />
        </points>
    );
}

/* ── Main Scene ───────────────────────────────────────────────────────── */

export default function Console3DScene() {
    const quality = getQualityLevel();
    if (quality === 'none') return null;

    const dpr: [number, number] =
        quality === 'high' ? [1, 2] : [1, 1.5];
    const particleCount =
        quality === 'high' ? 40 : quality === 'medium' ? 25 : 15;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
                opacity: 0.55,
            }}
        >
            <Canvas
                dpr={dpr}
                camera={{ position: [0, 0, 8], fov: 45 }}
                gl={{
                    antialias: true,
                    alpha: true,
                    powerPreference: 'high-performance',
                }}
                style={{ background: 'transparent' }}
            >
                {/* Three-point lighting with warm tones */}
                <ambientLight intensity={0.3} />
                <directionalLight
                    position={[5, 8, 5]}
                    intensity={0.8}
                    color="#fff5eb"
                />
                <directionalLight
                    position={[-5, 3, 5]}
                    intensity={0.4}
                    color="#e0f2fe"
                />
                <pointLight
                    position={[0, 0, 4]}
                    intensity={1.5}
                    color="#f59e0b"
                    distance={15}
                />

                {/* Studio environment for reflections */}
                <Environment preset="studio">
                    <Lightformer
                        position={[0, 5, -5]}
                        scale={[10, 1, 1]}
                        intensity={3}
                        color="#fff5eb"
                    />
                    <Lightformer
                        position={[0, -5, 0]}
                        scale={[10, 1, 1]}
                        intensity={0.8}
                        color="#1e3a5f"
                    />
                </Environment>

                {/* Glass shapes */}
                {SHAPES.map((shape, i) => (
                    <GlassShape key={i} {...shape} />
                ))}

                {/* Floating particles */}
                <AmbientParticles count={particleCount} />

                {/* Depth fog */}
                <fog attach="fog" args={['#0a0a0f', 5, 25]} />
            </Canvas>
        </div>
    );
}
