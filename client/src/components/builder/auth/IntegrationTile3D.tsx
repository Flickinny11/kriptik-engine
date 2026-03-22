/**
 * Integration Tile 3D - Premium Raised Tile with Ambient Glow
 *
 * Features:
 * - Raised 3D appearance that sinks when authorized
 * - Ambient warm glow animation
 * - OAuth2.0 Connect button or manual credential inputs
 * - Simple Icons branding
 * - Unique premium font styling
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Integration } from '../../../data/integrations-database';
import { BrandIcon } from '../../ui/BrandIcon';
import { API_URL } from '../../../lib/api-config';

// =============================================================================
// Types
// =============================================================================

export interface IntegrationTile3DProps {
    integration: Integration;
    purpose: string;
    isAuthorized: boolean;
    isHovered: boolean;
    onHover: () => void;
    onLeave: () => void;
    onOAuthSuccess: (tokens: Record<string, string>) => void;
    onCredentialsSave: (credentials: Record<string, string>) => void;
    projectId: string;
    animationDelay?: number;
}

// =============================================================================
// Credential Input Component
// =============================================================================

function CredentialInputs({
    credentials,
    values,
    onChange,
    onSave,
    isSaving,
    docsUrl,
}: {
    credentials: Integration['credentials'];
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
    onSave: () => void;
    isSaving: boolean;
    docsUrl: string;
}) {
    const allFilled = credentials.every(
        c => !c.required || (values[c.envVariableName]?.trim())
    );

    return (
        <div className="mt-4 space-y-3">
            {/* Get credentials link */}
            <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Click to get credentials
            </a>

            {/* Input fields */}
            {credentials.map(cred => (
                <div key={cred.envVariableName}>
                    <label className="block text-xs text-zinc-400 mb-1.5">
                        {cred.name}
                        {cred.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    <input
                        type="password"
                        placeholder={`Enter ${cred.name}...`}
                        value={values[cred.envVariableName] || ''}
                        onChange={(e) => onChange(cred.envVariableName, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all"
                        style={{
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}
                    />
                </div>
            ))}

            {/* Save button */}
            <motion.button
                onClick={onSave}
                disabled={!allFilled || isSaving}
                whileHover={allFilled ? { scale: 1.02 } : {}}
                whileTap={allFilled ? { scale: 0.98 } : {}}
                className="w-full py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                    background: allFilled
                        ? 'linear-gradient(145deg, rgba(34,197,94,0.9) 0%, rgba(22,163,74,0.85) 100%)'
                        : 'linear-gradient(145deg, rgba(100,100,100,0.3) 0%, rgba(80,80,80,0.2) 100%)',
                    color: allFilled ? 'white' : '#666',
                    boxShadow: allFilled
                        ? '0 4px 15px rgba(34,197,94,0.3)'
                        : 'none',
                }}
            >
                {isSaving ? 'Saving...' : 'Save Credentials'}
            </motion.button>
        </div>
    );
}

// =============================================================================
// Main Component
// =============================================================================

export function IntegrationTile3D({
    integration,
    purpose,
    isAuthorized,
    isHovered,
    onHover,
    onLeave,
    onOAuthSuccess,
    onCredentialsSave,
    projectId,
    animationDelay = 0,
}: IntegrationTile3DProps) {
    const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showCredentialInputs, setShowCredentialInputs] = useState(false);

    // Handle OAuth connection
    const handleOAuthConnect = useCallback(async () => {
        if (!integration.oauthConfig) return;

        setIsConnecting(true);

        try {
            // Open OAuth popup
            const width = 600;
            const height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const oauthWindow = window.open(
                `${API_URL}/api/oauth/${integration.id}/authorize?projectId=${projectId}`,
                'OAuth',
                `width=${width},height=${height},left=${left},top=${top},popup=1`
            );

            // Listen for OAuth completion
            const checkClosed = setInterval(() => {
                if (oauthWindow?.closed) {
                    clearInterval(checkClosed);
                    setIsConnecting(false);

                    // Check for success via localStorage or API
                    const tokens = localStorage.getItem(`oauth_tokens_${integration.id}`);
                    if (tokens) {
                        onOAuthSuccess(JSON.parse(tokens));
                        localStorage.removeItem(`oauth_tokens_${integration.id}`);
                    }
                }
            }, 500);

            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(checkClosed);
                setIsConnecting(false);
            }, 5 * 60 * 1000);
        } catch (error) {
            console.error('[IntegrationTile3D] OAuth error:', error);
            setIsConnecting(false);
        }
    }, [integration, projectId, onOAuthSuccess]);

    // Handle manual credential save
    const handleSaveCredentials = useCallback(async () => {
        setIsSaving(true);

        try {
            // Save credentials to backend
            await fetch(`${API_URL}/api/credentials`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    projectId,
                    integrationId: integration.id,
                    credentials: credentialValues,
                }),
            });

            onCredentialsSave(credentialValues);
        } catch (error) {
            console.error('[IntegrationTile3D] Save error:', error);
        } finally {
            setIsSaving(false);
        }
    }, [integration.id, projectId, credentialValues, onCredentialsSave]);

    // Handle credential input change
    const handleCredentialChange = useCallback((key: string, value: string) => {
        setCredentialValues(prev => ({ ...prev, [key]: value }));
    }, []);

    const isOAuth = integration.authType === 'oauth2';

    return (
        <motion.div
            initial={{ opacity: 0, y: 30, rotateX: -15 }}
            animate={{
                opacity: 1,
                y: 0,
                rotateX: 0,
                translateZ: isAuthorized ? -20 : isHovered ? 15 : 0,
                scale: isAuthorized ? 0.98 : isHovered ? 1.02 : 1,
            }}
            transition={{
                delay: animationDelay,
                type: 'spring',
                stiffness: 300,
                damping: 25,
            }}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
            className="relative"
            style={{
                transformStyle: 'preserve-3d',
                perspective: '1000px',
            }}
        >
            {/* Ambient Glow Effect */}
            <motion.div
                className="absolute inset-0 rounded-2xl"
                animate={{
                    opacity: isAuthorized ? 0.8 : isHovered ? 0.6 : 0,
                    scale: isAuthorized ? 1.05 : isHovered ? 1.02 : 1,
                }}
                transition={{ duration: 0.3 }}
                style={{
                    background: isAuthorized
                        ? 'radial-gradient(circle at center, rgba(34,197,94,0.4) 0%, transparent 70%)'
                        : 'radial-gradient(circle at center, rgba(251,191,36,0.3) 0%, transparent 70%)',
                    filter: 'blur(20px)',
                    zIndex: -1,
                }}
            />

            {/* Main Tile */}
            <div
                className="relative rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                    background: isAuthorized
                        ? 'linear-gradient(145deg, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.1) 100%)'
                        : 'linear-gradient(145deg, rgba(50,50,55,0.95) 0%, rgba(40,40,45,0.98) 100%)',
                    border: isAuthorized
                        ? '2px solid rgba(34,197,94,0.4)'
                        : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: isAuthorized
                        ? `
                            inset 0 2px 10px rgba(34,197,94,0.2),
                            0 2px 10px rgba(0,0,0,0.2)
                        `
                        : isHovered
                            ? `
                                0 15px 40px rgba(0,0,0,0.4),
                                0 5px 15px rgba(0,0,0,0.2),
                                inset 0 1px 0 rgba(255,255,255,0.15),
                                0 0 30px rgba(251,191,36,0.15)
                            `
                            : `
                                0 10px 30px rgba(0,0,0,0.3),
                                0 3px 10px rgba(0,0,0,0.2),
                                inset 0 1px 0 rgba(255,255,255,0.1)
                            `,
                    transform: `translateZ(${isAuthorized ? -10 : isHovered ? 10 : 0}px)`,
                }}
            >
                {/* Authorized Checkmark Overlay */}
                <AnimatePresence>
                    {isAuthorized && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center z-10"
                            style={{
                                background: 'linear-gradient(145deg, rgba(34,197,94,0.9) 0%, rgba(22,163,74,0.85) 100%)',
                                boxShadow: '0 2px 10px rgba(34,197,94,0.4)',
                            }}
                        >
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Content */}
                <div className="p-5">
                    {/* Header with Icon and Name */}
                    <div className="flex items-start gap-4 mb-3">
                        {/* Brand Icon */}
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        >
                            <BrandIcon
                                iconId={integration.iconSlug}
                                size={28}
                                className="text-white"
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3
                                className="font-semibold text-white text-lg leading-tight mb-1"
                                style={{
                                    fontFamily: '"Outfit", "Satoshi", sans-serif',
                                }}
                            >
                                {integration.name}
                            </h3>
                            <p className="text-xs text-zinc-400 line-clamp-2">
                                {purpose}
                            </p>
                        </div>
                    </div>

                    {/* Action Area */}
                    {!isAuthorized && (
                        <div className="mt-4">
                            {isOAuth ? (
                                // OAuth Connect Button
                                <motion.button
                                    onClick={handleOAuthConnect}
                                    disabled={isConnecting}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60"
                                    style={{
                                        background: 'linear-gradient(145deg, rgba(251,191,36,0.9) 0%, rgba(245,158,11,0.85) 100%)',
                                        color: '#1a1a1a',
                                        boxShadow: '0 4px 20px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                                        border: '1px solid rgba(251,191,36,0.4)',
                                        fontFamily: '"Outfit", sans-serif',
                                    }}
                                >
                                    {isConnecting ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                                className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full"
                                            />
                                            Connecting...
                                        </span>
                                    ) : (
                                        'Connect'
                                    )}
                                </motion.button>
                            ) : (
                                // Manual Credential Input Toggle
                                <>
                                    <motion.button
                                        onClick={() => setShowCredentialInputs(!showCredentialInputs)}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
                                        style={{
                                            background: showCredentialInputs
                                                ? 'linear-gradient(145deg, rgba(100,100,100,0.3) 0%, rgba(80,80,80,0.2) 100%)'
                                                : 'linear-gradient(145deg, rgba(251,191,36,0.9) 0%, rgba(245,158,11,0.85) 100%)',
                                            color: showCredentialInputs ? '#ccc' : '#1a1a1a',
                                            boxShadow: showCredentialInputs
                                                ? 'none'
                                                : '0 4px 20px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                                            border: showCredentialInputs
                                                ? '1px solid rgba(255,255,255,0.1)'
                                                : '1px solid rgba(251,191,36,0.4)',
                                            fontFamily: '"Outfit", sans-serif',
                                        }}
                                    >
                                        {showCredentialInputs ? 'Hide Inputs' : 'Enter Credentials'}
                                    </motion.button>

                                    {/* Credential Inputs */}
                                    <AnimatePresence>
                                        {showCredentialInputs && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                            >
                                                <CredentialInputs
                                                    credentials={integration.credentials}
                                                    values={credentialValues}
                                                    onChange={handleCredentialChange}
                                                    onSave={handleSaveCredentials}
                                                    isSaving={isSaving}
                                                    docsUrl={integration.docsUrl}
                                                />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </>
                            )}
                        </div>
                    )}

                    {/* Authorized State */}
                    {isAuthorized && (
                        <div className="mt-3 text-center">
                            <span className="text-sm text-emerald-400 font-medium">
                                ✓ Connected
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

export default IntegrationTile3D;
