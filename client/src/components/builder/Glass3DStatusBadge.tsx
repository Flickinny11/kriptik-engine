/**
 * Glass3DStatusBadge - Premium 3D Glass Status Indicator
 *
 * Photorealistic liquid glass pane with visible depth, edges,
 * layered shadows, and animated 3D logo.
 */

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Glass3DStatusBadgeProps {
    status: 'idle' | 'generating_plan' | 'awaiting_plan_approval' | 'configuring_stack' | 'awaiting_credentials' | 'building' | 'complete';
    label: string;
}

// 3D Animated Logo Component using CSS transforms
function Animated3DLogo({ status, size = 18 }: { status: string; size?: number }) {
    const isActive = status !== 'idle' && status !== 'complete';
    const isReady = status === 'idle';
    const isComplete = status === 'complete';

    return (
        <div
            className="relative"
            style={{
                width: size,
                height: size,
                perspective: '100px',
                transformStyle: 'preserve-3d',
            }}
        >
            {/* Planet Core */}
            <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                    background: isReady
                        ? 'linear-gradient(145deg, #10b981 0%, #059669 50%, #047857 100%)'
                        : isComplete
                            ? 'linear-gradient(145deg, #22c55e 0%, #16a34a 50%, #15803d 100%)'
                            : 'linear-gradient(145deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                    boxShadow: isReady
                        ? '0 0 12px rgba(16,185,129,0.5), inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.3)'
                        : isComplete
                            ? '0 0 12px rgba(34,197,94,0.5), inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.3)'
                            : '0 0 12px rgba(245,158,11,0.5), inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.3)',
                }}
                animate={isActive ? { scale: [1, 1.08, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Orbiting Ring */}
            <motion.div
                className="absolute"
                style={{
                    width: size * 1.6,
                    height: size * 0.4,
                    left: -(size * 0.3),
                    top: size * 0.3,
                    borderRadius: '50%',
                    border: `1.5px solid ${isReady ? 'rgba(16,185,129,0.6)' : isComplete ? 'rgba(34,197,94,0.6)' : 'rgba(245,158,11,0.6)'}`,
                    transformStyle: 'preserve-3d',
                    transform: 'rotateX(65deg)',
                    boxShadow: isReady
                        ? '0 0 8px rgba(16,185,129,0.4)'
                        : isComplete
                            ? '0 0 8px rgba(34,197,94,0.4)'
                            : '0 0 8px rgba(245,158,11,0.4)',
                }}
                animate={isActive ? { rotateZ: [0, 360] } : { rotateZ: [0, 360] }}
                transition={{
                    duration: isActive ? 3 : 8,
                    repeat: Infinity,
                    ease: 'linear'
                }}
            />

            {/* Second Ring */}
            <motion.div
                className="absolute"
                style={{
                    width: size * 1.3,
                    height: size * 0.3,
                    left: -(size * 0.15),
                    top: size * 0.35,
                    borderRadius: '50%',
                    border: `1px solid ${isReady ? 'rgba(16,185,129,0.4)' : isComplete ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    transformStyle: 'preserve-3d',
                    transform: 'rotateX(65deg) rotateZ(30deg)',
                }}
                animate={isActive ? { rotateZ: [30, 390] } : {}}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'linear'
                }}
            />

            {/* Pulse effect for active states */}
            {isActive && (
                <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: 'transparent',
                        border: '1px solid rgba(245,158,11,0.3)',
                    }}
                    animate={{
                        scale: [1, 1.8],
                        opacity: [0.6, 0]
                    }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut'
                    }}
                />
            )}

            {/* Checkmark for complete */}
            {isComplete && (
                <motion.svg
                    className="absolute inset-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                    <path
                        d="M9 12l2 2 4-4"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </motion.svg>
            )}
        </div>
    );
}

export function Glass3DStatusBadge({ status, label }: Glass3DStatusBadgeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // Subtle 3D tilt effect on hover
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            setMousePos({ x: x * 4, y: y * 4 });
        };

        const handleMouseLeave = () => {
            setMousePos({ x: 0, y: 0 });
        };

        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    const getStatusColors = () => {
        switch (status) {
            case 'idle':
                return {
                    bg: 'linear-gradient(165deg, rgba(15,23,42,0.85) 0%, rgba(30,41,59,0.65) 55%, rgba(15,23,42,0.7) 100%)',
                    border: 'rgba(16,185,129,0.35)',
                    glow: 'rgba(16,185,129,0.25)',
                };
            case 'building':
            case 'generating_plan':
                return {
                    bg: 'linear-gradient(165deg, rgba(15,23,42,0.85) 0%, rgba(45,30,15,0.65) 55%, rgba(30,41,59,0.7) 100%)',
                    border: 'rgba(245,158,11,0.45)',
                    glow: 'rgba(245,158,11,0.3)',
                };
            case 'awaiting_plan_approval':
            case 'complete':
                return {
                    bg: 'linear-gradient(165deg, rgba(15,23,42,0.85) 0%, rgba(16,55,38,0.6) 55%, rgba(30,41,59,0.7) 100%)',
                    border: 'rgba(34,197,94,0.45)',
                    glow: 'rgba(34,197,94,0.28)',
                };
            default:
                return {
                    bg: 'linear-gradient(165deg, rgba(15,23,42,0.85) 0%, rgba(30,41,59,0.65) 55%, rgba(15,23,42,0.7) 100%)',
                    border: 'rgba(255,255,255,0.12)',
                    glow: 'rgba(0,0,0,0.45)',
                };
        }
    };

    const colors = getStatusColors();

    return (
        <motion.div
            ref={containerRef}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs cursor-default select-none"
            style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                boxShadow: `
                    0 8px 24px ${colors.glow},
                    0 4px 12px rgba(0,0,0,0.4),
                    inset 0 1px 0 rgba(255,255,255,0.18),
                    inset 0 -1px 0 rgba(0,0,0,0.45),
                    0 0 0 1px rgba(255,255,255,0.06)
                `,
                backdropFilter: 'blur(22px) saturate(160%)',
                WebkitBackdropFilter: 'blur(22px) saturate(160%)',
                transform: `perspective(500px) rotateX(${-mousePos.y}deg) rotateY(${mousePos.x}deg)`,
                transformStyle: 'preserve-3d',
                transition: 'transform 0.1s ease-out, box-shadow 0.2s ease',
            }}
            whileHover={{
                boxShadow: `
                    0 12px 32px ${colors.glow},
                    0 6px 16px rgba(0,0,0,0.45),
                    inset 0 1px 0 rgba(255,255,255,0.22),
                    inset 0 -1px 0 rgba(0,0,0,0.5),
                    0 0 0 1px rgba(255,255,255,0.1)
                `,
            }}
        >
            {/* Glass edge highlight - left */}
            <div
                className="absolute left-0 top-0 bottom-0 w-px"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.08) 100%)',
                }}
            />

            {/* Glass edge highlight - top */}
            <div
                className="absolute left-0 right-0 top-0 h-px"
                style={{
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.32) 50%, rgba(255,255,255,0.12) 100%)',
                }}
            />

            {/* 3D Animated Logo */}
            <Animated3DLogo status={status} size={18} />

            {/* Status Text */}
            <span
                className="font-semibold tracking-tight"
                style={{
                    color: '#f8fafc',
                    fontFamily: "'Satoshi', 'Cabinet Grotesk', system-ui, sans-serif",
                    fontSize: '12px',
                    textShadow: '0 1px 8px rgba(0,0,0,0.45)',
                    transform: 'translateZ(2px)',
                }}
            >
                {label}
            </span>
        </motion.div>
    );
}

export default Glass3DStatusBadge;
