/**
 * Animated KripTik Logo - 3D Planet with Animated Rings
 *
 * A small, subtle animated logo that appears in front of streaming tokens
 * to indicate that KripTik is working. Similar to Claude's orange squiggle.
 *
 * Features:
 * - 3D planet with orbiting rings
 * - Rings wrap around and fall off in smooth motion
 * - Status text display ("thinking", "building", etc.)
 * - High-quality animation at 60fps
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';

// =============================================================================
// Types
// =============================================================================

export interface AnimatedLogoProps {
    /** Size in pixels */
    size?: number;
    /** Current status text */
    status?: string;
    /** Whether the animation is active */
    isActive?: boolean;
    /** Show status text */
    showStatus?: boolean;
    /** Use minimal black outline style (for thinking header) */
    minimalStyle?: boolean;
}

// =============================================================================
// Status Messages - Fun, engaging messages like Claude Code
// =============================================================================

const STATUS_MESSAGES = [
    'thinking',
    'pondering',
    'reasoning',
    'analyzing',
    'building',
    'coding',
    'crafting',
    'designing',
    'orchestrating',
    'synthesizing',
    'computing',
    'processing',
    'flibbergibbing', // Fun one like Claude
];

// =============================================================================
// Animated Ring Component
// =============================================================================

function AnimatedRing({
    size,
    delay,
    duration,
    rotation,
    isActive,
    minimal = false,
}: {
    size: number;
    delay: number;
    duration: number;
    rotation: number;
    isActive: boolean;
    minimal?: boolean;
}) {
    return (
        <motion.div
            className="absolute inset-0"
            style={{
                transform: `rotateX(70deg) rotateZ(${rotation}deg)`,
                transformStyle: 'preserve-3d',
            }}
        >
            <motion.div
                className="absolute"
                style={{
                    left: '50%',
                    top: '50%',
                    width: size * 1.4,
                    height: size * 1.4,
                    marginLeft: -(size * 1.4) / 2,
                    marginTop: -(size * 1.4) / 2,
                    border: minimal ? `1.5px solid rgba(0, 0, 0, 0.6)` : `2px solid rgba(251, 191, 36, 0.5)`,
                    borderRadius: '50%',
                    boxShadow: minimal ? 'none' : `
                        0 0 10px rgba(251, 191, 36, 0.3),
                        inset 0 0 5px rgba(251, 191, 36, 0.2)
                    `,
                }}
                animate={
                    isActive
                        ? {
                              rotate: [0, 360],
                              scale: [1, 1.1, 1],
                              opacity: [0.7, 1, 0.7],
                          }
                        : {}
                }
                transition={{
                    duration,
                    delay,
                    repeat: Infinity,
                    ease: 'linear',
                }}
            />
        </motion.div>
    );
}

// =============================================================================
// Orbiting Particle
// =============================================================================

function OrbitingParticle({
    size,
    orbit,
    duration,
    startAngle,
    isActive,
}: {
    size: number;
    orbit: number;
    duration: number;
    startAngle: number;
    isActive: boolean;
}) {
    const controls = useAnimation();

    useEffect(() => {
        if (isActive) {
            controls.start({
                rotate: [startAngle, startAngle + 360],
                transition: {
                    duration,
                    repeat: Infinity,
                    ease: 'linear',
                },
            });
        } else {
            controls.stop();
        }
    }, [isActive, controls, duration, startAngle]);

    return (
        <motion.div
            className="absolute"
            style={{
                left: '50%',
                top: '50%',
                width: orbit * 2,
                height: orbit * 2,
                marginLeft: -orbit,
                marginTop: -orbit,
            }}
            animate={controls}
        >
            <div
                className="absolute rounded-full"
                style={{
                    left: 0,
                    top: '50%',
                    width: size * 0.15,
                    height: size * 0.15,
                    marginTop: -(size * 0.15) / 2,
                    background: 'radial-gradient(circle at 30% 30%, #fbbf24 0%, #f59e0b 100%)',
                    boxShadow: '0 0 8px rgba(251, 191, 36, 0.8)',
                }}
            />
        </motion.div>
    );
}

// =============================================================================
// Main Component
// =============================================================================

export function AnimatedLogo({
    size = 24,
    status,
    isActive = true,
    showStatus = true,
    minimalStyle = false,
}: AnimatedLogoProps) {
    const [currentStatus, setCurrentStatus] = useState(status || STATUS_MESSAGES[0]);
    const statusIndexRef = useRef(0);

    // Cycle through status messages if none provided
    useEffect(() => {
        if (status) {
            setCurrentStatus(status);
            return;
        }

        if (!isActive) return;

        const interval = setInterval(() => {
            statusIndexRef.current = (statusIndexRef.current + 1) % STATUS_MESSAGES.length;
            setCurrentStatus(STATUS_MESSAGES[statusIndexRef.current]);
        }, 3000);

        return () => clearInterval(interval);
    }, [status, isActive]);

    // Minimal black outline planet style (user requested 1/3 size with black outline)
    if (minimalStyle) {
        return (
            <motion.div
                className="inline-flex items-center gap-1.5"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
            >
                {/* Minimal Planet Container */}
                <div
                    className="relative"
                    style={{
                        width: size,
                        height: size,
                        perspective: '100px',
                        transformStyle: 'preserve-3d',
                    }}
                >
                    {/* Core Planet - Black outline only */}
                    <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                            border: '1.5px solid rgba(0, 0, 0, 0.7)',
                            background: 'transparent',
                        }}
                        animate={
                            isActive
                                ? {
                                      scale: [1, 1.08, 1],
                                  }
                                : {}
                        }
                        transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    />

                    {/* Single animated ring - black outline */}
                    <AnimatedRing
                        size={size}
                        delay={0}
                        duration={2}
                        rotation={-20}
                        isActive={isActive}
                        minimal={true}
                    />
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
        >
            {/* 3D Planet Container */}
            <div
                className="relative"
                style={{
                    width: size,
                    height: size,
                    perspective: '200px',
                    transformStyle: 'preserve-3d',
                }}
            >
                {/* Core Planet */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: `
                            radial-gradient(
                                circle at 35% 35%,
                                #fcd34d 0%,
                                #f59e0b 40%,
                                #d97706 70%,
                                #92400e 100%
                            )
                        `,
                        boxShadow: `
                            inset -3px -3px 6px rgba(0,0,0,0.3),
                            inset 2px 2px 4px rgba(255,255,255,0.3),
                            0 0 15px rgba(251, 191, 36, 0.5)
                        `,
                    }}
                    animate={
                        isActive
                            ? {
                                  scale: [1, 1.05, 1],
                                  boxShadow: [
                                      'inset -3px -3px 6px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.3), 0 0 15px rgba(251, 191, 36, 0.5)',
                                      'inset -3px -3px 6px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.3), 0 0 25px rgba(251, 191, 36, 0.7)',
                                      'inset -3px -3px 6px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.3), 0 0 15px rgba(251, 191, 36, 0.5)',
                                  ],
                              }
                            : {}
                    }
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />

                {/* Animated Rings */}
                <AnimatedRing
                    size={size}
                    delay={0}
                    duration={3}
                    rotation={-15}
                    isActive={isActive}
                />
                <AnimatedRing
                    size={size * 0.9}
                    delay={0.5}
                    duration={4}
                    rotation={30}
                    isActive={isActive}
                />

                {/* Orbiting Particles */}
                <OrbitingParticle
                    size={size}
                    orbit={size * 0.6}
                    duration={2.5}
                    startAngle={0}
                    isActive={isActive}
                />
                <OrbitingParticle
                    size={size}
                    orbit={size * 0.75}
                    duration={4}
                    startAngle={180}
                    isActive={isActive}
                />
            </div>

            {/* Status Text */}
            <AnimatePresence mode="wait">
                {showStatus && isActive && (
                    <motion.span
                        key={currentStatus}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 5 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs font-medium text-amber-400"
                        style={{
                            fontFamily: '"JetBrains Mono", monospace',
                        }}
                    >
                        {currentStatus}...
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default AnimatedLogo;
