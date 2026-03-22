/**
 * Standalone Integrations Authorization Page
 *
 * Mobile and desktop optimized page for connecting integrations.
 * Accessed via notification links when credentials are required.
 *
 * Route: /integrations-auth/:projectId?integration=<id>
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { IntegrationsAuthorizationUI, RequiredIntegration } from '@/components/builder/auth/IntegrationsAuthorizationUI';
import { INTEGRATIONS_DATABASE } from '@/data/integrations-database';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import {
    Loader2Icon,
    ArrowLeftIcon,
    AlertCircleIcon,
    CheckCircle2Icon,
    ZapIcon,
} from '@/components/ui/icons';

// =============================================================================
// Types
// =============================================================================

interface ProjectIntegrationData {
    projectId: string;
    projectName: string;
    requiredIntegrations: Array<{
        integrationId: string;
        purpose: string;
        isAuthorized: boolean;
    }>;
}

// =============================================================================
// Styles
// =============================================================================

const primaryButtonStyles: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    padding: '14px 28px',
    borderRadius: '14px',
    fontWeight: 600,
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
    background: 'linear-gradient(135deg, rgba(251,191,36,0.95) 0%, rgba(249,115,22,0.95) 50%, rgba(239,68,68,0.9) 100%)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.25)',
    boxShadow: '0 4px 0 rgba(0,0,0,0.3), 0 8px 24px rgba(251,146,60,0.4), inset 0 1px 0 rgba(255,255,255,0.35)',
    cursor: 'pointer',
    transition: 'all 0.15s ease-out',
};

const secondaryButtonStyles: React.CSSProperties = {
    position: 'relative',
    padding: '12px 24px',
    borderRadius: '12px',
    fontWeight: 500,
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
    background: 'rgba(30, 41, 59, 0.5)',
    color: '#e2e8f0',
    border: '1px solid rgba(100, 116, 139, 0.4)',
    cursor: 'pointer',
    transition: 'all 0.15s ease-out',
};

// =============================================================================
// Component
// =============================================================================

export default function IntegrationsAuth() {
    const { projectId } = useParams<{ projectId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    // State
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [projectData, setProjectData] = useState<ProjectIntegrationData | null>(null);
    const [requiredIntegrations, setRequiredIntegrations] = useState<RequiredIntegration[]>([]);
    const [showAuthUI, setShowAuthUI] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Get highlighted integration from query params
    const highlightedIntegrationId = searchParams.get('integration');

    // Fetch required integrations for the project
    useEffect(() => {
        async function fetchProjectIntegrations() {
            if (!projectId) {
                setError('No project ID provided');
                setIsLoading(false);
                return;
            }

            try {
                // Fetch project data and required integrations
                const response = await apiClient.get<ProjectIntegrationData>(
                    `/api/projects/${projectId}/integrations`
                );

                setProjectData(response.data);

                // Map integration IDs to full Integration objects
                const mappedIntegrations: RequiredIntegration[] = response.data.requiredIntegrations
                    .map(req => {
                        const integration = INTEGRATIONS_DATABASE.find(i => i.id === req.integrationId);
                        if (!integration) return null;
                        return {
                            integration,
                            purpose: req.purpose,
                            isAuthorized: req.isAuthorized,
                        };
                    })
                    .filter((i): i is RequiredIntegration => i !== null);

                // If a specific integration is highlighted, put it first
                if (highlightedIntegrationId) {
                    const highlightedIndex = mappedIntegrations.findIndex(
                        i => i.integration.id === highlightedIntegrationId
                    );
                    if (highlightedIndex > 0) {
                        const [highlighted] = mappedIntegrations.splice(highlightedIndex, 1);
                        mappedIntegrations.unshift(highlighted);
                    }
                }

                setRequiredIntegrations(mappedIntegrations);
                setShowAuthUI(true);
            } catch (err: any) {
                console.error('[IntegrationsAuth] Failed to fetch project integrations:', err);

                if (err?.response?.status === 401) {
                    setError('Please sign in to continue');
                } else if (err?.response?.status === 404) {
                    setError('Project not found');
                } else {
                    setError('Failed to load integrations. Please try again.');
                }
            } finally {
                setIsLoading(false);
            }
        }

        fetchProjectIntegrations();
    }, [projectId, highlightedIntegrationId]);

    // Handle auth completion - save credentials to vault
    const handleAuthComplete = useCallback(async (credentials: Map<string, Record<string, string>>) => {
        if (!projectId) return;

        setIsSaving(true);

        try {
            // Convert Map to object for API
            const credentialsObject: Record<string, Record<string, string>> = {};
            credentials.forEach((value, key) => {
                credentialsObject[key] = value;
            });

            // Save credentials to project vault
            await apiClient.post(`/api/projects/${projectId}/credentials`, {
                credentials: credentialsObject,
            });

            toast({
                title: 'Credentials Saved',
                description: 'Your integrations have been connected. Build will continue automatically.',
            });

            // Redirect to dashboard
            setTimeout(() => {
                navigate(`/dashboard?project=${projectId}`);
            }, 1500);
        } catch (err: any) {
            console.error('[IntegrationsAuth] Failed to save credentials:', err);
            toast({
                title: 'Failed to Save',
                description: 'There was an error saving your credentials. Please try again.',
                variant: 'destructive',
            });
            setIsSaving(false);
        }
    }, [projectId, navigate, toast]);

    // Handle cancel
    const handleCancel = useCallback(() => {
        navigate(`/dashboard?project=${projectId}`);
    }, [navigate, projectId]);

    // Loading state
    if (isLoading) {
        return (
            <div
                className="min-h-screen flex items-center justify-center"
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                }}
            >
                <div className="text-center">
                    <Loader2Icon size={48} className="mx-auto mb-4 text-amber-400 animate-spin" />
                    <p className="text-slate-300">Loading integrations...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div
                className="min-h-screen flex items-center justify-center p-4"
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                }}
            >
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                        <AlertCircleIcon size={32} className="text-red-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
                    <p className="text-slate-400 mb-6">{error}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            style={secondaryButtonStyles}
                            className="hover:bg-slate-600/60"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => navigate('/dashboard')}
                            style={primaryButtonStyles}
                            className="hover:translate-y-[2px]"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // No integrations required
    if (requiredIntegrations.length === 0) {
        return (
            <div
                className="min-h-screen flex items-center justify-center p-4"
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                }}
            >
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2Icon size={32} className="text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">All Set!</h1>
                    <p className="text-slate-400 mb-6">
                        No integrations are required for this project, or all integrations have already been connected.
                    </p>
                    <button
                        onClick={() => navigate(`/dashboard?project=${projectId}`)}
                        style={primaryButtonStyles}
                        className="hover:translate-y-[2px]"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Main content
    return (
        <div
            className="min-h-screen"
            style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            }}
        >
            {/* Header - Mobile optimized */}
            <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-lg border-b border-slate-700/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleCancel}
                            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <ArrowLeftIcon size={20} />
                            <span className="hidden sm:inline">Back to Dashboard</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <ZapIcon size={20} className="text-amber-400" />
                            <span className="font-semibold text-white">KripTik</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {/* Info Section - Mobile optimized */}
                <div className="mb-8 text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                        Connect Your Integrations
                    </h1>
                    <p className="text-slate-400 max-w-lg mx-auto">
                        {projectData?.projectName ? (
                            <>
                                <span className="text-amber-400">{projectData.projectName}</span> requires the following integrations to function properly.
                            </>
                        ) : (
                            'The following integrations are required for your app.'
                        )}
                    </p>
                </div>

                {/* Progress indicator */}
                <div className="mb-8">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                        <span className="text-emerald-400 font-medium">
                            {requiredIntegrations.filter(i => i.isAuthorized).length}
                        </span>
                        <span>/</span>
                        <span>{requiredIntegrations.length} connected</span>
                    </div>
                    <div className="mt-2 h-2 bg-slate-800 rounded-full overflow-hidden max-w-xs mx-auto">
                        <motion.div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                            initial={{ width: 0 }}
                            animate={{
                                width: `${(requiredIntegrations.filter(i => i.isAuthorized).length / requiredIntegrations.length) * 100}%`
                            }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                </div>

                {/* Integration Auth UI */}
                <AnimatePresence>
                    {showAuthUI && (
                        <IntegrationsAuthorizationUI
                            requiredIntegrations={requiredIntegrations}
                            projectId={projectId || ''}
                            onAuthComplete={handleAuthComplete}
                            onCancel={handleCancel}
                            isVisible={true}
                        />
                    )}
                </AnimatePresence>

                {/* Saving overlay */}
                <AnimatePresence>
                    {isSaving && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                        >
                            <div className="text-center">
                                <Loader2Icon size={48} className="mx-auto mb-4 text-amber-400 animate-spin" />
                                <p className="text-white font-medium">Saving credentials...</p>
                                <p className="text-slate-400 text-sm mt-2">Redirecting to dashboard...</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Mobile-optimized footer */}
            <footer className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur-lg border-t border-slate-700/50 sm:hidden">
                <div className="flex gap-3">
                    <button
                        onClick={handleCancel}
                        style={secondaryButtonStyles}
                        className="flex-1 text-center"
                    >
                        Skip for Now
                    </button>
                </div>
            </footer>
        </div>
    );
}
