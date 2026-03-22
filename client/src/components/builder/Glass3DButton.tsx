/**
 * Glass3DButton - Premium Photorealistic 3D Glass Button
 *
 * Features:
 * - Visible depth and perspective
 * - Visible glass edges with light refraction
 * - Layered shadows for depth
 * - Gradient backgrounds
 * - Custom 3D icons
 */

import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Glass3DButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: 'default' | 'amber' | 'emerald' | 'primary';
    size?: 'sm' | 'md' | 'lg';
    icon?: 'preview' | 'show' | 'play' | 'stop' | 'custom';
    className?: string;
}

// Custom 3D Icons
function PreviewIcon({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <defs>
                <linearGradient id="previewGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
            </defs>
            {/* Monitor frame */}
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="url(#previewGrad)" strokeWidth="2" fill="none" />
            {/* Screen content - small play icon */}
            <path d="M10 8l4 3-4 3V8z" fill="url(#previewGrad)" />
            {/* Stand */}
            <path d="M8 21h8M12 17v4" stroke="url(#previewGrad)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function ShowIcon({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <defs>
                <linearGradient id="showGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
            </defs>
            {/* Eye outline */}
            <path
                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"
                stroke="url(#showGrad)"
                strokeWidth="2"
                fill="none"
            />
            {/* Pupil with 3D effect */}
            <circle cx="12" cy="12" r="3" fill="url(#showGrad)" />
            {/* Highlight */}
            <circle cx="13" cy="11" r="1" fill="white" opacity="0.8" />
        </svg>
    );
}

function PlayIcon3D({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <defs>
                <linearGradient id="playGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                </linearGradient>
            </defs>
            <path
                d="M8 5v14l11-7L8 5z"
                fill="url(#playGrad)"
                stroke="url(#playGrad)"
                strokeWidth="1"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function Glass3DButton({
    children,
    onClick,
    disabled = false,
    variant = 'default',
    size = 'md',
    icon,
    className = '',
}: Glass3DButtonProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [isPressed, setIsPressed] = useState(false);

    // 3D tilt effect
    useEffect(() => {
        const button = buttonRef.current;
        if (!button || disabled) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = button.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            setMousePos({ x: x * 6, y: y * 6 });
        };

        const handleMouseLeave = () => {
            setMousePos({ x: 0, y: 0 });
        };

        button.addEventListener('mousemove', handleMouseMove);
        button.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            button.removeEventListener('mousemove', handleMouseMove);
            button.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [disabled]);

    const getVariantStyles = () => {
        switch (variant) {
            case 'amber':
                return {
                    bg: 'linear-gradient(165deg, rgba(255,251,235,0.98) 0%, rgba(254,243,199,0.95) 30%, rgba(253,230,138,0.9) 100%)',
                    border: 'rgba(245,158,11,0.3)',
                    glow: 'rgba(245,158,11,0.2)',
                    text: '#92400e',
                };
            case 'emerald':
                return {
                    bg: 'linear-gradient(165deg, rgba(240,253,244,0.98) 0%, rgba(220,252,231,0.95) 30%, rgba(187,247,208,0.9) 100%)',
                    border: 'rgba(34,197,94,0.3)',
                    glow: 'rgba(34,197,94,0.2)',
                    text: '#166534',
                };
            case 'primary':
                return {
                    bg: 'linear-gradient(165deg, rgba(245,168,108,0.95) 0%, rgba(234,88,12,0.9) 100%)',
                    border: 'rgba(245,168,108,0.4)',
                    glow: 'rgba(245,168,108,0.35)',
                    text: '#ffffff',
                };
            default:
                return {
                    bg: 'linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 30%, rgba(241,245,249,0.9) 100%)',
                    border: 'rgba(0,0,0,0.08)',
                    glow: 'rgba(0,0,0,0.05)',
                    text: '#1a1a1a',
                };
        }
    };

    const getSizeStyles = () => {
        switch (size) {
            case 'sm':
                return { padding: '6px 12px', fontSize: '12px', iconSize: 14 };
            case 'lg':
                return { padding: '12px 24px', fontSize: '15px', iconSize: 20 };
            default:
                return { padding: '10px 18px', fontSize: '13px', iconSize: 16 };
        }
    };

    const styles = getVariantStyles();
    const sizeStyles = getSizeStyles();

    const renderIcon = () => {
        switch (icon) {
            case 'preview':
                return <PreviewIcon size={sizeStyles.iconSize} />;
            case 'show':
                return <ShowIcon size={sizeStyles.iconSize} />;
            case 'play':
                return <PlayIcon3D size={sizeStyles.iconSize} />;
            default:
                return null;
        }
    };

    return (
        <motion.button
            ref={buttonRef}
            onClick={onClick}
            disabled={disabled}
            onMouseDown={() => setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            onMouseLeave={() => setIsPressed(false)}
            className={`relative flex items-center gap-2 rounded-xl font-medium transition-all ${className}`}
            style={{
                padding: sizeStyles.padding,
                fontSize: sizeStyles.fontSize,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                background: styles.bg,
                border: `1px solid ${styles.border}`,
                color: styles.text,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: `
                    0 8px 24px ${styles.glow},
                    0 4px 12px rgba(0,0,0,0.06),
                    inset 0 2px 0 rgba(255,255,255,0.7),
                    inset 0 -1px 0 rgba(0,0,0,0.03),
                    0 0 0 1px rgba(255,255,255,0.4)
                `,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                transform: `
                    perspective(500px)
                    rotateX(${isPressed ? 2 : -mousePos.y}deg)
                    rotateY(${isPressed ? 0 : mousePos.x}deg)
                    translateY(${isPressed ? 2 : 0}px)
                    scale(${isPressed ? 0.98 : 1})
                `,
                transformStyle: 'preserve-3d',
                transition: 'transform 0.1s ease-out, box-shadow 0.15s ease',
            }}
            whileHover={disabled ? {} : {
                boxShadow: `
                    0 12px 32px ${styles.glow},
                    0 6px 16px rgba(0,0,0,0.08),
                    inset 0 2px 0 rgba(255,255,255,0.8),
                    inset 0 -1px 0 rgba(0,0,0,0.03),
                    0 0 0 1px rgba(255,255,255,0.5)
                `,
            }}
        >
            {/* Glass edge highlights */}
            <div
                className="absolute left-0 top-0 bottom-0 w-px rounded-l-xl"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.2) 100%)',
                }}
            />
            <div
                className="absolute left-0 right-0 top-0 h-px rounded-t-xl"
                style={{
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.4) 100%)',
                }}
            />

            {/* Icon */}
            {icon && (
                <span style={{ transform: 'translateZ(3px)' }}>
                    {renderIcon()}
                </span>
            )}

            {/* Content */}
            <span style={{ transform: 'translateZ(2px)' }}>
                {children}
            </span>
        </motion.button>
    );
}

export default Glass3DButton;
