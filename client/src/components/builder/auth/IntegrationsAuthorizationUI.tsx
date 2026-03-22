/**
 * Integrations Authorization UI - Premium 3D Liquid Glass Popout
 *
 * Displays a square popout window for authorizing integrations before build.
 * Features:
 * - 3D liquid glass texture (Spline Hanna glass style)
 * - Raised tiles that sink when authorized
 * - OAuth2.0 connect buttons or manual credential inputs
 * - Continue button triggers shatter animation
 * - Background dimming and blur
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntegrationTile3D } from './IntegrationTile3D';
import { ShatterAnimation } from './ShatterAnimation';
import type { Integration } from '../../../data/integrations-database';

// =============================================================================
// Types
// =============================================================================

export interface RequiredIntegration {
    integration: Integration;
    purpose: string;
    isAuthorized: boolean;
    credentials?: Record<string, string>;
}

export interface IntegrationsAuthorizationUIProps {
    requiredIntegrations: RequiredIntegration[];
    projectId: string;
    onAuthComplete: (credentials: Map<string, Record<string, string>>) => void;
    onCancel: () => void;
    isVisible: boolean;
}

// =============================================================================
// Main Component
// =============================================================================

export function IntegrationsAuthorizationUI({
    requiredIntegrations,
    projectId,
    onAuthComplete,
    onCancel,
    isVisible,
}: IntegrationsAuthorizationUIProps) {
    const [integrations, setIntegrations] = useState<RequiredIntegration[]>(requiredIntegrations);
    const [isShatteringActive, setIsShatteringActive] = useState(false);
    const [hoveredTile, setHoveredTile] = useState<string | null>(null);

    // Sync with props
    useEffect(() => {
        setIntegrations(requiredIntegrations);
    }, [requiredIntegrations]);

    // Check if all integrations are authorized
    const allAuthorized = integrations.every(i => i.isAuthorized);

    // Handle OAuth success
    const handleOAuthSuccess = useCallback((integrationId: string, tokens: Record<string, string>) => {
        setIntegrations(prev =>
            prev.map(i =>
                i.integration.id === integrationId
                    ? { ...i, isAuthorized: true, credentials: tokens }
                    : i
            )
        );
    }, []);

    // Handle manual credential save
    const handleCredentialsSave = useCallback((integrationId: string, credentials: Record<string, string>) => {
        setIntegrations(prev =>
            prev.map(i =>
                i.integration.id === integrationId
                    ? { ...i, isAuthorized: true, credentials }
                    : i
            )
        );
    }, []);

    // Handle continue - trigger shatter animation
    const handleContinue = useCallback(() => {
        if (!allAuthorized) return;

        // Collect all credentials
        const credentialsMap = new Map<string, Record<string, string>>();
        integrations.forEach(i => {
            if (i.credentials) {
                credentialsMap.set(i.integration.id, i.credentials);
            }
        });

        // Start shatter animation
        setIsShatteringActive(true);
    }, [allAuthorized, integrations]);

    // Handle shatter animation complete
    const handleShatterComplete = useCallback(() => {
        const credentialsMap = new Map<string, Record<string, string>>();
        integrations.forEach(i => {
            if (i.credentials) {
                credentialsMap.set(i.integration.id, i.credentials);
            }
        });
        onAuthComplete(credentialsMap);
    }, [integrations, onAuthComplete]);

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            {/* Background Overlay - Dim and blur */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
                onClick={onCancel}
            />

            {/* Main Popout Container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            >
                <div
                    className="relative pointer-events-auto"
                    style={{
                        width: 'min(900px, 90vw)',
                        height: 'min(900px, 85vh)',
                        perspective: '1500px',
                    }}
                >
                    {/* Shatter Animation Overlay */}
                    <AnimatePresence>
                        {isShatteringActive && (
                            <ShatterAnimation
                                onComplete={handleShatterComplete}
                                width={900}
                                height={900}
                            />
                        )}
                    </AnimatePresence>

                    {/* 3D Glass Container */}
                    <motion.div
                        className="w-full h-full rounded-3xl overflow-hidden"
                        style={{
                            // Photorealistic liquid glass texture
                            background: `
                                linear-gradient(
                                    135deg,
                                    rgba(255,255,255,0.12) 0%,
                                    rgba(255,255,255,0.05) 25%,
                                    rgba(200,200,200,0.03) 50%,
                                    rgba(255,255,255,0.08) 75%,
                                    rgba(255,255,255,0.1) 100%
                                )
                            `,
                            backdropFilter: 'blur(40px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                            // 3D edges and thickness
                            border: '2px solid rgba(255,255,255,0.15)',
                            boxShadow: `
                                0 50px 100px rgba(0,0,0,0.5),
                                0 20px 40px rgba(0,0,0,0.3),
                                inset 0 2px 0 rgba(255,255,255,0.2),
                                inset 0 -2px 0 rgba(0,0,0,0.2),
                                inset 2px 0 0 rgba(255,255,255,0.1),
                                inset -2px 0 0 rgba(0,0,0,0.1),
                                0 0 100px rgba(251,191,36,0.1)
                            `,
                            transform: isShatteringActive ? 'scale(0)' : 'rotateX(2deg) rotateY(-1deg)',
                            transformStyle: 'preserve-3d',
                            transition: isShatteringActive ? 'transform 0.3s ease-out' : 'none',
                        }}
                        animate={{
                            opacity: isShatteringActive ? 0 : 1,
                        }}
                    >
                        {/* Header */}
                        <div
                            className="px-8 py-6 border-b border-white/10"
                            style={{
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-1">
                                        Connect Your Integrations
                                    </h2>
                                    <p className="text-zinc-400 text-sm">
                                        Authorize the required services to continue with your build
                                    </p>
                                </div>
                                <button
                                    onClick={onCancel}
                                    className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Progress indicator */}
                            <div className="mt-4 flex items-center gap-3">
                                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{
                                            background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
                                        }}
                                        initial={{ width: '0%' }}
                                        animate={{
                                            width: `${(integrations.filter(i => i.isAuthorized).length / integrations.length) * 100}%`,
                                        }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                                <span className="text-sm text-zinc-400 whitespace-nowrap">
                                    {integrations.filter(i => i.isAuthorized).length} / {integrations.length} connected
                                </span>
                            </div>
                        </div>

                        {/* Integration Tiles Grid */}
                        <div
                            className="flex-1 overflow-y-auto p-6"
                            style={{ maxHeight: 'calc(100% - 180px)' }}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {integrations.map((item, index) => (
                                    <IntegrationTile3D
                                        key={item.integration.id}
                                        integration={item.integration}
                                        purpose={item.purpose}
                                        isAuthorized={item.isAuthorized}
                                        isHovered={hoveredTile === item.integration.id}
                                        onHover={() => setHoveredTile(item.integration.id)}
                                        onLeave={() => setHoveredTile(null)}
                                        onOAuthSuccess={(tokens) => handleOAuthSuccess(item.integration.id, tokens)}
                                        onCredentialsSave={(creds) => handleCredentialsSave(item.integration.id, creds)}
                                        projectId={projectId}
                                        animationDelay={index * 0.05}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Footer with Continue Button */}
                        <div
                            className="px-8 py-5 border-t border-white/10"
                            style={{
                                background: 'linear-gradient(0deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 100%)',
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-zinc-400">
                                    {allAuthorized
                                        ? 'All integrations connected! Click Continue to start building.'
                                        : `${integrations.filter(i => !i.isAuthorized).length} integration(s) remaining`}
                                </p>
                                <motion.button
                                    onClick={handleContinue}
                                    disabled={!allAuthorized}
                                    whileHover={allAuthorized ? { scale: 1.05, y: -2 } : {}}
                                    whileTap={allAuthorized ? { scale: 0.95 } : {}}
                                    className="px-8 py-3 rounded-xl font-semibold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                        background: allAuthorized
                                            ? 'linear-gradient(145deg, rgba(251,191,36,0.95) 0%, rgba(245,158,11,0.9) 100%)'
                                            : 'linear-gradient(145deg, rgba(100,100,100,0.3) 0%, rgba(80,80,80,0.2) 100%)',
                                        color: allAuthorized ? '#1a1a1a' : '#666',
                                        boxShadow: allAuthorized
                                            ? '0 8px 30px rgba(251,191,36,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                                            : 'none',
                                        border: allAuthorized
                                            ? '1px solid rgba(251,191,36,0.5)'
                                            : '1px solid rgba(255,255,255,0.1)',
                                    }}
                                >
                                    {allAuthorized ? 'Continue →' : 'Waiting for connections...'}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

export default IntegrationsAuthorizationUI;
