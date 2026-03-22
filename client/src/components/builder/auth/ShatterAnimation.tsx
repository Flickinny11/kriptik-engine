/**
 * Shatter Animation - Three.js Glass Shatter Effect
 *
 * Creates a photorealistic glass shattering effect when the
 * Integrations Authorization UI is dismissed after successful auth.
 *
 * Features:
 * - Glass shards with realistic physics
 * - Particle disintegration with fade out
 * - High frame rate (60fps+)
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';

// =============================================================================
// Types
// =============================================================================

interface ShatterAnimationProps {
    onComplete: () => void;
    width?: number;
    height?: number;
}

interface Shard {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    rotationVelocity: THREE.Vector3;
    opacity: number;
    fadeSpeed: number;
}

// =============================================================================
// Shatter Animation Component
// =============================================================================

export function ShatterAnimation({
    onComplete,
    width = 900,
    height = 900,
}: ShatterAnimationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const shardsRef = useRef<Shard[]>([]);
    const animationFrameRef = useRef<number | null>(null);

    // Create glass shards
    const createShards = useCallback((scene: THREE.Scene) => {
        const shards: Shard[] = [];
        const shardCount = 80;
        const centerX = 0;
        const centerY = 0;

        // Glass material - translucent with refraction effect
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0,
            roughness: 0.1,
            transmission: 0.9,
            thickness: 0.5,
            envMapIntensity: 1,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });

        for (let i = 0; i < shardCount; i++) {
            // Random triangular shard shape
            const shape = new THREE.Shape();
            const size = 20 + Math.random() * 60;

            // Create irregular triangle
            shape.moveTo(0, 0);
            shape.lineTo(size * (0.5 + Math.random() * 0.5), size * Math.random() * 0.3);
            shape.lineTo(size * Math.random() * 0.5, size * (0.5 + Math.random() * 0.5));
            shape.closePath();

            const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: 2 + Math.random() * 4,
                bevelEnabled: false,
            });

            const material = glassMaterial.clone();
            const mesh = new THREE.Mesh(geometry, material);

            // Position shards in a grid pattern initially
            const gridSize = Math.ceil(Math.sqrt(shardCount));
            const gridX = (i % gridSize) - gridSize / 2;
            const gridY = Math.floor(i / gridSize) - gridSize / 2;

            mesh.position.set(
                centerX + gridX * (width / gridSize / 10),
                centerY + gridY * (height / gridSize / 10),
                0
            );

            // Random initial rotation
            mesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            scene.add(mesh);

            // Calculate velocity - explosion outward from center
            const angle = Math.atan2(mesh.position.y - centerY, mesh.position.x - centerX);
            const distance = Math.sqrt(
                Math.pow(mesh.position.x - centerX, 2) +
                Math.pow(mesh.position.y - centerY, 2)
            );
            const speed = 15 + Math.random() * 25 + (distance / 100) * 5;

            shards.push({
                mesh,
                velocity: new THREE.Vector3(
                    Math.cos(angle) * speed + (Math.random() - 0.5) * 10,
                    Math.sin(angle) * speed + (Math.random() - 0.5) * 10,
                    (Math.random() - 0.3) * speed * 0.8
                ),
                rotationVelocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3
                ),
                opacity: 0.8 + Math.random() * 0.2,
                fadeSpeed: 0.015 + Math.random() * 0.01,
            });
        }

        return shards;
    }, [width, height]);

    // Initialize Three.js scene
    useEffect(() => {
        if (!containerRef.current) return;

        // Create scene
        const scene = new THREE.Scene();
        scene.background = null;
        sceneRef.current = scene;

        // Create camera
        const camera = new THREE.PerspectiveCamera(
            50,
            width / height,
            0.1,
            2000
        );
        camera.position.z = 500;
        cameraRef.current = camera;

        // Create renderer with transparency
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xfbbf24, 1, 1000);
        pointLight.position.set(0, 0, 300);
        scene.add(pointLight);

        // Create shards
        shardsRef.current = createShards(scene);

        // Animation loop
        let startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            let allGone = true;

            // Update shards
            shardsRef.current.forEach((shard) => {
                // Apply velocity with gravity
                shard.velocity.y -= 0.3; // Gravity

                shard.mesh.position.x += shard.velocity.x;
                shard.mesh.position.y += shard.velocity.y;
                shard.mesh.position.z += shard.velocity.z;

                // Apply rotation
                shard.mesh.rotation.x += shard.rotationVelocity.x;
                shard.mesh.rotation.y += shard.rotationVelocity.y;
                shard.mesh.rotation.z += shard.rotationVelocity.z;

                // Fade out
                shard.opacity -= shard.fadeSpeed;
                if (shard.opacity > 0) {
                    allGone = false;
                    (shard.mesh.material as THREE.MeshPhysicalMaterial).opacity = shard.opacity;
                } else {
                    shard.mesh.visible = false;
                }

                // Slow down rotation over time
                shard.rotationVelocity.multiplyScalar(0.98);
                // Air resistance
                shard.velocity.multiplyScalar(0.99);
            });

            renderer.render(scene, camera);

            // Check if animation is complete
            if (allGone || elapsed > 3) {
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                }
                onComplete();
                return;
            }

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        // Start animation
        animate();

        // Cleanup
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }

            // Dispose of Three.js resources
            shardsRef.current.forEach((shard) => {
                shard.mesh.geometry.dispose();
                (shard.mesh.material as THREE.Material).dispose();
            });

            renderer.dispose();

            if (containerRef.current && renderer.domElement) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [width, height, createShards, onComplete]);

    return (
        <motion.div
            ref={containerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-50"
            style={{
                width,
                height,
            }}
        />
    );
}

export default ShatterAnimation;
