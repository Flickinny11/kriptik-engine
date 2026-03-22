/**
 * Animated 3D Stop Button
 *
 * A premium animated stop button that appears during builds.
 * Features:
 * - 3D appearance with depth and shadows
 * - Pulsing animation while active
 * - Click to stop the build
 */

import { motion } from 'framer-motion';

// =============================================================================
// Types
// =============================================================================

export interface AnimatedStopButtonProps {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

// =============================================================================
// Main Component
// =============================================================================

export function AnimatedStopButton({
    onClick,
    isActive = true,
    disabled = false,
    size = 'md',
}: AnimatedStopButtonProps) {
    const sizeMap = {
        sm: { button: 32, icon: 12, border: 2 },
        md: { button: 40, icon: 16, border: 2.5 },
        lg: { button: 48, icon: 20, border: 3 },
    };

    const dimensions = sizeMap[size];

    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            whileHover={!disabled ? { scale: 1.1, y: -2 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
            className="relative flex items-center justify-center rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-red-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
                width: dimensions.button,
                height: dimensions.button,
                background: isActive
                    ? 'linear-gradient(145deg, rgba(239,68,68,0.9) 0%, rgba(220,38,38,0.85) 100%)'
                    : 'linear-gradient(145deg, rgba(100,100,100,0.3) 0%, rgba(80,80,80,0.2) 100%)',
                border: `${dimensions.border}px solid ${isActive ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: isActive
                    ? `
                        0 4px 15px rgba(239,68,68,0.4),
                        0 2px 6px rgba(0,0,0,0.2),
                        inset 0 1px 0 rgba(255,255,255,0.2),
                        inset 0 -1px 0 rgba(0,0,0,0.2)
                    `
                    : `
                        0 2px 8px rgba(0,0,0,0.15),
                        inset 0 1px 0 rgba(255,255,255,0.1)
                    `,
                // 3D depth effect
                transform: 'perspective(500px) rotateX(5deg)',
                transformStyle: 'preserve-3d',
            }}
        >
            {/* Animated glow ring */}
            {isActive && (
                <motion.div
                    className="absolute inset-0 rounded-xl"
                    animate={{
                        boxShadow: [
                            '0 0 0 0 rgba(239,68,68,0.4)',
                            '0 0 0 8px rgba(239,68,68,0)',
                        ],
                    }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                    }}
                />
            )}

            {/* Stop Icon - Animated Square */}
            <motion.div
                className="rounded-sm"
                style={{
                    width: dimensions.icon,
                    height: dimensions.icon,
                    background: isActive
                        ? 'linear-gradient(145deg, #ffffff 0%, #f5f5f5 100%)'
                        : 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
                    boxShadow: isActive
                        ? '0 1px 3px rgba(0,0,0,0.2)'
                        : 'none',
                }}
                animate={
                    isActive
                        ? {
                              scale: [1, 0.9, 1],
                              rotate: [0, 0, 0],
                          }
                        : {}
                }
                transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />

            {/* Inner highlight */}
            <div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
                }}
            />
        </motion.button>
    );
}

export default AnimatedStopButton;
