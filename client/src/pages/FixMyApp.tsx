/**
 * Fix My App Page
 *
 * Multi-step wizard for importing and fixing broken apps from other AI builders.
 * Flow: Source Selection → Consent → Upload → Analysis → Strategy → Fix → Verify → Builder
 */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UploadIcon, GitHubIcon, CodeIcon, PackageIcon, SparklesIcon, AlertCircleIcon,
    CheckCircle2Icon, ArrowRightIcon, ArrowLeftIcon, Loader2Icon,
    TargetIcon, SettingsIcon, EyeIcon, RocketIcon, BrainIcon, MessageSquareIcon,
    DownloadIcon, MonitorIcon, ExternalLinkIcon, LinkIcon
} from '../components/ui/icons';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
// Switch removed - using single consent checkbox now
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
// Ultimate AI-First Builder Architecture Components
import { SpeedDialSelector } from '@/components/builder/SpeedDialSelector';
import { NotificationPreferencesModal } from '@/components/fix-my-app/NotificationPreferencesModal';
import '../styles/realistic-glass.css';
import '../styles/fix-my-app-premium.css';

// Lazy load 3D components - GSAP + Three.js premium glass selection
// Eagerly start the import so the chunk is ready before the component mounts
const premiumGlassPromise = import('@/components/fix-my-app/PremiumGlassSelection');
const PremiumGlassSelection = lazy(() => premiumGlassPromise);

// =============================================================================
// MODERN 3D BUTTON STYLES (React CSSProperties)
// =============================================================================

// Primary action button - warm amber gradient with 3D depth
const primaryButtonStyles: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    padding: '14px 28px',
    borderRadius: '16px',
    fontWeight: 600,
    letterSpacing: '0.025em',
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
    background: 'linear-gradient(135deg, #c25a00 0%, #a04800 50%, #8b3d00 100%)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.2)',
    boxShadow: '0 4px 0 rgba(0,0,0,0.15), 0 8px 24px rgba(194,90,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
    transform: 'translateY(-2px)',
    cursor: 'pointer',
    transition: 'all 0.15s ease-out',
};

// Secondary/outline button - frosted glass with visible edges
const secondaryButtonStyles: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    padding: '12px 24px',
    borderRadius: '14px',
    fontWeight: 500,
    letterSpacing: '0.02em',
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
    background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
    color: '#1a1a1a',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '0 3px 0 rgba(200,195,190,0.4), 0 6px 20px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.9)',
    transform: 'translateY(-1px)',
    cursor: 'pointer',
    transition: 'all 0.15s ease-out',
};

// Large CTA button - for major actions
const ctaButtonStyles: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    padding: '18px 36px',
    borderRadius: '20px',
    fontSize: '1.1rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
    background: 'linear-gradient(135deg, #c25a00 0%, #a04800 40%, #8b3d00 100%)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.2)',
    boxShadow: '0 6px 0 rgba(0,0,0,0.15), 0 14px 35px rgba(194,90,0,0.35), inset 0 2px 0 rgba(255,255,255,0.3)',
    transform: 'translateY(-3px) scale(1.01)',
    cursor: 'pointer',
    transition: 'all 0.15s ease-out',
};

// Subtle ghost button with glass effect
const ghostButtonStyles: React.CSSProperties = {
    position: 'relative',
    padding: '10px 18px',
    borderRadius: '10px',
    fontWeight: 500,
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
    background: 'rgba(0,0,0,0.03)',
    color: '#666',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
    cursor: 'pointer',
    transition: 'all 0.2s ease-out',
};

// Types - All supported AI builders and platforms
type ImportSource =
    // AI Builders
    | 'lovable' | 'bolt' | 'v0' | 'create' | 'tempo' | 'gptengineer' | 'databutton' | 'magic_patterns'
    // AI Assistants
    | 'claude' | 'chatgpt' | 'gemini' | 'copilot'
    // AI Editors
    | 'cursor' | 'windsurf' | 'antigravity' | 'vscode' | 'cody' | 'continue'
    // Dev Platforms
    | 'replit' | 'codesandbox' | 'stackblitz'
    // Repositories
    | 'github' | 'gitlab' | 'bitbucket'
    // File Upload
    | 'zip';

type Step = 'source' | 'consent' | 'login' | 'upload' | 'context' | 'analysis' | 'preferences' | 'strategy' | 'fix' | 'verify' | 'complete';

type UIPreference = 'keep_ui' | 'improve_ui' | 'rebuild_ui';

type SourceCategory = 'ai_builder' | 'ai_assistant' | 'ai_editor' | 'dev_platform' | 'repository' | 'file_upload';

interface FixSession {
    sessionId: string;
    source: ImportSource;
    projectId?: string;
    status: string;
    progress: number;
    currentStep: string;
}

interface Feature {
    id: string;
    name: string;
    description: string;
    status: 'implemented' | 'partial' | 'missing' | 'broken';
    importance: 'primary' | 'secondary';
}

interface ErrorEvent {
    messageNumber: number;
    errorType: string;
    description: string;
}

interface IntentSummary {
    corePurpose: string;
    primaryFeatures: Feature[];
    secondaryFeatures: Feature[];
    frustrationPoints: { issue: string; userQuote: string }[];
}

interface ErrorTimeline {
    firstError: ErrorEvent | null;
    errorChain: ErrorEvent[];
    rootCause: string;
    cascadingFailures: boolean;
    errorCount: number;
}

interface FixStrategy {
    approach: 'repair' | 'rebuild_partial' | 'rebuild_full';
    estimatedTimeMinutes: number;
    estimatedCost: number;
    confidence: number;
    reasoning: string;
    featuresToFix: { featureName: string; fixType: string }[];
}

interface SarcasticNotification {
    title: string;
    message: string;
    emoji: string;
    subtext: string;
    celebrationGif?: string;
}

// Source configuration interface
interface SourceConfig {
    id: ImportSource;
    name: string;
    icon: string | React.ReactNode;
    description: string;
    category: SourceCategory;
    contextAvailable: boolean;
    requiresUrl: boolean;
    urlPlaceholder?: string;
    chatInstructions?: string[];
}

// Comprehensive source options organized by category
const sourceOptions: SourceConfig[] = [
    // =========================================================================
    // AI BUILDERS - Full-featured AI app builders with chat history
    // =========================================================================
    {
        id: 'lovable',
        name: 'Lovable.dev',
        icon: '💜',
        description: 'Full-stack AI app builder',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open your Lovable project',
            'Scroll to the top of the chat',
            'Select all messages (Cmd/Ctrl + A)',
            'Copy and paste below',
        ],
    },
    {
        id: 'bolt',
        name: 'Bolt.new',
        icon: '⚡',
        description: 'AI-powered web builder',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open your Bolt.new project',
            'Click the chat history icon',
            'Select and copy all messages',
            'Paste the conversation below',
        ],
    },
    {
        id: 'v0',
        name: 'v0.dev',
        icon: '▲',
        description: 'Vercel\'s component builder',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false, // URL input is on consent page for AI builders
        chatInstructions: [
            'Open your v0 conversation',
            'Copy the shareable link',
            'Also copy/paste the conversation',
        ],
    },
    {
        id: 'create',
        name: 'Create.xyz',
        icon: '🎨',
        description: 'AI-powered app creation',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false, // URL input is on consent page for AI builders
        chatInstructions: [
            'Open your Create.xyz project',
            'Copy the project URL',
            'Export or copy the chat history',
        ],
    },
    {
        id: 'tempo',
        name: 'Tempo Labs',
        icon: '🎵',
        description: 'AI development platform',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false, // URL input is on consent page for AI builders
        chatInstructions: [
            'Open your Tempo project',
            'Copy the project URL',
            'Copy conversation from chat panel',
        ],
    },
    {
        id: 'gptengineer',
        name: 'GPT Engineer',
        icon: '🤖',
        description: 'gptengineer.app',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false, // URL input is on consent page for AI builders
        chatInstructions: [
            'Open your GPT Engineer project',
            'Copy the project URL',
            'Copy full conversation history',
        ],
    },
    {
        id: 'databutton',
        name: 'Databutton',
        icon: '📊',
        description: 'AI data app builder',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false, // URL input is on consent page for AI builders
        chatInstructions: [
            'Open your Databutton project',
            'Copy the app URL',
            'Export or copy build conversation',
        ],
    },
    {
        id: 'magic_patterns',
        name: 'Magic Patterns',
        icon: '✨',
        description: 'Design-to-code AI',
        category: 'ai_builder',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open Magic Patterns',
            'Export generated components',
            'Copy the design conversation',
        ],
    },

    // =========================================================================
    // AI ASSISTANTS - Paste code + conversation
    // =========================================================================
    {
        id: 'claude',
        name: 'Claude (Artifacts)',
        icon: '🧠',
        description: 'Anthropic Claude + Artifacts',
        category: 'ai_assistant',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open your Claude conversation',
            'Click "Share" or export',
            'Or: Select all and copy',
            'Include all artifact code',
        ],
    },
    {
        id: 'chatgpt',
        name: 'ChatGPT (Canvas)',
        icon: '💚',
        description: 'OpenAI ChatGPT + Canvas',
        category: 'ai_assistant',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open your ChatGPT conversation',
            'Click share and copy link',
            'Or: Select all and copy',
            'Include Canvas code outputs',
        ],
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        icon: '💎',
        description: 'Google\'s AI assistant',
        category: 'ai_assistant',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open your Gemini conversation',
            'Select and copy all messages',
            'Include any code blocks',
        ],
    },
    {
        id: 'copilot',
        name: 'GitHub Copilot',
        icon: '🐙',
        description: 'Copilot Chat history',
        category: 'ai_assistant',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open VS Code or GitHub.com',
            'Find Copilot chat history',
            'Copy relevant conversation',
        ],
    },

    // =========================================================================
    // AI CODE EDITORS - Export project + chat
    // =========================================================================
    {
        id: 'cursor',
        name: 'Cursor IDE',
        icon: '🖱️',
        description: 'AI-first code editor',
        category: 'ai_editor',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'In Cursor, open Composer panel',
            'Copy conversation history',
            'Upload project folder as ZIP',
            'Paste Composer conversation',
        ],
    },
    {
        id: 'windsurf',
        name: 'Windsurf IDE',
        icon: '🏄',
        description: 'Codeium\'s AI editor',
        category: 'ai_editor',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'In Windsurf, open Cascade chat',
            'Export or copy chat history',
            'Upload project folder as ZIP',
            'Paste Cascade conversation',
        ],
    },
    {
        id: 'antigravity',
        name: 'Google Antigravity',
        icon: '🌌',
        description: 'Google\'s agentic AI platform',
        category: 'ai_editor',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'In Antigravity, open Agent panel',
            'Click "Export Session" or copy chat',
            'Include artifacts (plans, tasks)',
            'Upload project as ZIP',
            'Paste agent conversation',
        ],
    },
    {
        id: 'vscode',
        name: 'VS Code',
        icon: '💙',
        description: 'VS Code + AI extensions',
        category: 'ai_editor',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open VS Code with your project',
            'Open your AI extension chat panel',
            'Copy the conversation history',
            'Upload project as ZIP',
            'Paste AI conversation',
        ],
    },
    {
        id: 'cody',
        name: 'Sourcegraph Cody',
        icon: '🔍',
        description: 'Sourcegraph\'s AI assistant',
        category: 'ai_editor',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open IDE with Cody',
            'Copy Cody chat history',
            'Upload project folder',
            'Paste conversation below',
        ],
    },
    {
        id: 'continue',
        name: 'Continue.dev',
        icon: '▶️',
        description: 'Open-source AI assistant',
        category: 'ai_editor',
        contextAvailable: true,
        requiresUrl: false,
        chatInstructions: [
            'Open IDE with Continue',
            'Export session history',
            'Upload project folder',
            'Paste conversation below',
        ],
    },

    // =========================================================================
    // DEV PLATFORMS - Code + limited context
    // =========================================================================
    {
        id: 'replit',
        name: 'Replit',
        icon: '🔄',
        description: 'Online IDE with AI',
        category: 'dev_platform',
        contextAvailable: true,
        requiresUrl: true,
        urlPlaceholder: 'https://replit.com/@username/project',
        chatInstructions: [
            'Open your Replit project',
            'Copy the Repl URL',
            'Copy AI assistant chat',
        ],
    },
    {
        id: 'codesandbox',
        name: 'CodeSandbox',
        icon: '📦',
        description: 'Browser-based IDE',
        category: 'dev_platform',
        contextAvailable: false,
        requiresUrl: true,
        urlPlaceholder: 'https://codesandbox.io/s/...',
    },
    // =========================================================================
    // REPOSITORIES - Code only
    // =========================================================================
    {
        id: 'github',
        name: 'GitHub',
        icon: <GitHubIcon size={24} />,
        description: 'GitHub repository',
        category: 'repository',
        contextAvailable: false,
        requiresUrl: true,
        urlPlaceholder: 'https://github.com/username/repo',
    },
    {
        id: 'gitlab',
        name: 'GitLab',
        icon: '🦊',
        description: 'GitLab repository',
        category: 'repository',
        contextAvailable: false,
        requiresUrl: true,
        urlPlaceholder: 'https://gitlab.com/username/repo',
    },
    {
        id: 'bitbucket',
        name: 'Bitbucket',
        icon: '🪣',
        description: 'Bitbucket repository',
        category: 'repository',
        contextAvailable: false,
        requiresUrl: true,
        urlPlaceholder: 'https://bitbucket.org/username/repo',
    },

    // =========================================================================
    // FILE UPLOAD
    // =========================================================================
    {
        id: 'zip',
        name: 'ZIP Upload',
        icon: <PackageIcon size={24} />,
        description: 'Upload project as ZIP',
        category: 'file_upload',
        contextAvailable: false,
        requiresUrl: false,
    },
];

// Note: Category info and getSourcesByCategory are now handled in PremiumGlassSelection component

// Step configuration - using custom icons with size prop
// Wrapper to convert size prop icons to className prop compatibility
const createStepIcon = (IconComponent: React.FC<{ size?: number; className?: string }>) => {
    return ({ className }: { className?: string }) => <IconComponent size={16} className={className} />;
};

const steps: { id: Step; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'source', label: 'Source', icon: createStepIcon(UploadIcon) },
    { id: 'consent', label: 'Access', icon: createStepIcon(EyeIcon) },
    { id: 'upload', label: 'Import', icon: createStepIcon(CodeIcon) },
    { id: 'context', label: 'Context', icon: createStepIcon(MessageSquareIcon) },
    { id: 'analysis', label: 'Analysis', icon: createStepIcon(BrainIcon) },
    { id: 'preferences', label: 'UI Pref', icon: createStepIcon(EyeIcon) },
    { id: 'strategy', label: 'Strategy', icon: createStepIcon(TargetIcon) },
    { id: 'fix', label: 'Fix', icon: createStepIcon(SettingsIcon) },
    { id: 'complete', label: 'Done', icon: createStepIcon(SparklesIcon) },
];

export default function FixMyApp() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const eventSourceRef = useRef<EventSource | null>(null);

    // State
    const [step, setStep] = useState<Step>('source');
    const [session, setSession] = useState<FixSession | null>(null);
    const [source, setSource] = useState<ImportSource | null>(null);
    const [_sourceUrl, _setSourceUrl] = useState(''); // Reserved for future use
    const [consent, setConsent] = useState({
        chatHistory: true,
        buildLogs: true,
        errorLogs: true,
        versionHistory: true, // Auto-selected for maximum context
    });

    // Log step changes
    useEffect(() => {
        console.log('[FixMyApp] Step changed to:', step);
        console.log('[FixMyApp] Current state - source:', source);
    }, [step, source]);

    // Keyboard shortcut: Ctrl+Enter to proceed from source selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                console.log('[FixMyApp] Ctrl+Enter pressed, step:', step, 'source:', source);
                if (step === 'source' && source) {
                    e.preventDefault();
                    initSession();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, source]);


    const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
    const [githubUrl, setGithubUrl] = useState('');
    const [projectUrl, setProjectUrl] = useState(''); // URL of user's project in AI builder
    const [chatHistory, setChatHistory] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentActivity, setCurrentActivity] = useState('');
    const [logs, setLogs] = useState<string[]>([]);

    // HyperBrowser capture state
    const [isStartingCapture, setIsStartingCapture] = useState(false);
    const [captureJobId, setCaptureJobId] = useState<string | null>(null);
    const [liveLoginUrl, setLiveLoginUrl] = useState<string | null>(null);
    const [loginCheckInterval, setLoginCheckInterval] = useState<NodeJS.Timeout | null>(null);
    const [useShareLinkFallback, setUseShareLinkFallback] = useState(false);
    const [shareLink, setShareLink] = useState('');

    // Notification preferences modal state
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

    /**
     * Start HyperBrowser capture with live login flow.
     * Returns the liveUrl for user to log in.
     */
    const startCaptureWithLiveLogin = async () => {
        if (!projectUrl) {
            toast({
                title: 'URL Required',
                description: 'Please enter your project URL to continue.',
                variant: 'destructive',
            });
            return;
        }

        setIsStartingCapture(true);

        try {
            // Start capture with live login - no cookies, user will log in
            const response = await apiClient.post<{
                jobId: string;
                projectId: string;
                liveUrl?: string;
                estimatedCost?: string;
            }>(
                '/api/fix-my-app/capture/start-with-login',
                {
                    url: projectUrl,
                    platform: source,
                    maxSteps: 50,
                }
            );

            setCaptureJobId(response.data.jobId);
            setPendingProjectId(response.data.projectId);

            if (response.data.liveUrl) {
                setLiveLoginUrl(response.data.liveUrl);
                // Move to login step
                setStep('login');

                // Show notification preferences modal
                setShowNotificationModal(true);

                toast({
                    title: 'Cloud Browser Ready',
                    description: 'Please log into your account in the new window.',
                });
            } else {
                // No live URL - show notification preferences then redirect to dashboard
                setShowNotificationModal(true);
            }
        } catch (error: any) {
            console.error('[FixMyApp] Start capture error:', error);

            if (error?.response?.status === 401) {
                toast({
                    title: 'Login Required',
                    description: 'Please sign in to continue.',
                    variant: 'destructive',
                });
                navigate('/');
            } else {
                toast({
                    title: 'Capture Failed',
                    description: error?.response?.data?.message || 'Failed to start capture. Please try again.',
                    variant: 'destructive',
                });
            }
        } finally {
            setIsStartingCapture(false);
        }
    };

    /**
     * Check if user has logged in via the HyperBrowser live URL.
     * Polls the server to detect authentication.
     */
    const checkLoginAndResume = async () => {
        if (!captureJobId) return;

        try {
            const response = await apiClient.get<{
                loggedIn: boolean;
                projectId?: string;
            }>(`/api/fix-my-app/capture/${captureJobId}/login-status`);

            if (response.data.loggedIn) {
                // Stop polling
                if (loginCheckInterval) {
                    clearInterval(loginCheckInterval);
                    setLoginCheckInterval(null);
                }

                toast({
                    title: 'Login Detected!',
                    description: 'Capture is now running. Redirecting to dashboard...',
                });

                // Resume capture and redirect
                await apiClient.post(`/api/fix-my-app/capture/${captureJobId}/resume`);
                navigate(`/dashboard?capturingProject=${response.data.projectId || captureJobId}`);
            }
        } catch (error) {
            console.error('[FixMyApp] Login check error:', error);
        }
    };

    /**
     * Handle user clicking "I've logged in" button.
     */
    const handleLoginComplete = async () => {
        setIsStartingCapture(true);

        try {
            // Try to resume capture
            const response = await apiClient.post<{
                success: boolean;
                projectId?: string;
                message?: string;
            }>(`/api/fix-my-app/capture/${captureJobId}/resume`);

            if (response.data.success) {
                // Stop polling if active
                if (loginCheckInterval) {
                    clearInterval(loginCheckInterval);
                    setLoginCheckInterval(null);
                }

                toast({
                    title: 'Capture Resumed',
                    description: 'Redirecting to dashboard...',
                });

                navigate(`/dashboard?capturingProject=${response.data.projectId || captureJobId}`);
            } else {
                toast({
                    title: 'Login Not Detected',
                    description: response.data.message || 'Please make sure you\'ve logged in via the cloud browser window.',
                    variant: 'destructive',
                });
            }
        } catch (error: any) {
            console.error('[FixMyApp] Resume error:', error);
            toast({
                title: 'Resume Failed',
                description: error?.response?.data?.message || 'Could not resume capture. Try logging in again.',
                variant: 'destructive',
            });
        } finally {
            setIsStartingCapture(false);
        }
    };

    /**
     * Start polling for login detection.
     */
    const startLoginPolling = useCallback(() => {
        if (loginCheckInterval) return;

        const interval = setInterval(checkLoginAndResume, 3000); // Check every 3 seconds
        setLoginCheckInterval(interval);

        // Auto-stop after 5 minutes
        setTimeout(() => {
            clearInterval(interval);
            setLoginCheckInterval(null);
        }, 5 * 60 * 1000);
    }, [captureJobId]);

    // Start polling when we're on the login step
    useEffect(() => {
        if (step === 'login' && captureJobId && liveLoginUrl) {
            startLoginPolling();
        }
        return () => {
            if (loginCheckInterval) {
                clearInterval(loginCheckInterval);
            }
        };
    }, [step, captureJobId, liveLoginUrl]);

    /**
     * Handle share link fallback - user pastes a public share link.
     */
    const handleShareLinkCapture = async () => {
        if (!shareLink) {
            toast({
                title: 'Share Link Required',
                description: 'Please paste your project\'s share link.',
                variant: 'destructive',
            });
            return;
        }

        setIsStartingCapture(true);

        try {
            const response = await apiClient.post<{
                jobId: string;
                projectId: string;
            }>(
                '/api/fix-my-app/capture',
                {
                    url: shareLink,
                    platform: source,
                    isPublicShareLink: true,
                    maxSteps: 50,
                }
            );

            toast({
                title: 'Capture Started',
                description: 'Processing your shared project. Redirecting to dashboard...',
            });

            navigate(`/dashboard?capturingProject=${response.data.projectId}`);
        } catch (error: any) {
            console.error('[FixMyApp] Share link capture error:', error);
            toast({
                title: 'Capture Failed',
                description: error?.response?.data?.message || 'Failed to capture from share link.',
                variant: 'destructive',
            });
        } finally {
            setIsStartingCapture(false);
        }
    };

    // Analysis results
    const [intentSummary, setIntentSummary] = useState<IntentSummary | null>(null);
    const [errorTimeline, setErrorTimeline] = useState<ErrorTimeline | null>(null);
    const [_implementationGaps, setImplementationGaps] = useState<any[]>([]); // Used in analysis
    const [recommendedStrategy, setRecommendedStrategy] = useState<FixStrategy | null>(null);
    const [alternativeStrategies, setAlternativeStrategies] = useState<FixStrategy[]>([]);
    const [selectedStrategy, setSelectedStrategy] = useState<FixStrategy | null>(null);

    // UI Preferences
    const [uiPreference, setUiPreference] = useState<UIPreference>('improve_ui');
    const [additionalInstructions, setAdditionalInstructions] = useState('');

    // Browser state (simplified - just for opening new tabs)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_browserStatus, _setBrowserStatus] = useState<'idle' | 'user_control' | 'complete'>('idle');

    // Completion
    const [verificationReport, setVerificationReport] = useState<any>(null);
    const [notification, setNotification] = useState<SarcasticNotification | null>(null);

    // Fix mode — standard or production
    const [fixMode, setFixMode] = useState<'standard' | 'production'>('standard');

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            eventSourceRef.current?.close();
        };
    }, []);

    // Initialize session - first check if we need consent/extension step (client-side)
    // The actual API call happens when user proceeds from consent step
    const initSession = async () => {
        if (!source) return;

        console.log('[FixMyApp] initSession called with source:', source);

        // Check if this source has context available (needs consent + extension)
        const sourceConfig = sourceOptions.find(s => s.id === source);
        const needsConsent = sourceConfig?.contextAvailable ?? false;

        console.log('[FixMyApp] Source config:', sourceConfig);
        console.log('[FixMyApp] needsConsent (contextAvailable):', needsConsent);
        console.log('[FixMyApp] requiresBrowserLogin:', requiresBrowserLogin());

        if (needsConsent) {
            // Go to consent step first - no API call needed yet
            // This allows user to see the Extension download option before login
            console.log('[FixMyApp] Going to consent step (client-side, no API call yet)');
            setStep('consent');
        } else {
            // For sources without context, call API directly
            console.log('[FixMyApp] Source does not need consent, calling API...');
            await callInitSessionApi();
        }
    };

    // The actual API call - made when proceeding from consent step or for sources without consent
    const callInitSessionApi = async () => {
        if (!source) return;

        setIsLoading(true);
        try {
            const response = await apiClient.post<{ sessionId: string; consentRequired: boolean }>(
                '/api/fix-my-app/init',
                { source, sourceUrl: _sourceUrl }
            );

            console.log('[FixMyApp] Server response:', response.data);

            setSession({
                sessionId: response.data.sessionId,
                source,
                status: 'initializing',
                progress: 0,
                currentStep: 'Initializing',
            });

            // After API call from consent, go to upload
            setStep('upload');
        } catch (error: any) {
            console.error('[FixMyApp] initSession API error:', error);

            // Check if it's an auth error
            if (error?.response?.status === 401) {
                toast({
                    title: 'Login Required',
                    description: 'Please sign in to continue with Fix My App.',
                    variant: 'destructive',
                });
                // Could redirect to login here
                navigate('/');
            } else {
                toast({
                    title: 'Error',
                    description: 'Failed to initialize session. Please try again.',
                    variant: 'destructive',
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Submit consent - call API to initialize session, then open URL and proceed
    const submitConsent = async () => {
        console.log('[FixMyApp] submitConsent called');

        // First, call the API to initialize the session (requires auth)
        // This will fail if user is not logged in, but show a helpful message
        await callInitSessionApi();

        // If we get here, the API call succeeded
        // The callInitSessionApi function will:
        // 1. Set the session
        // 2. Navigate to upload step
        // 3. Show error if auth fails

        // Note: Opening the URL is now handled in the button onClick
        // because we want to do it only if extension is installed
    };

    // Upload files
    const uploadFiles = async () => {
        if (!session) return;

        setIsLoading(true);
        setCurrentActivity('Uploading files...');

        try {
            if (source === 'github') {
                await apiClient.post(`/api/fix-my-app/${session.sessionId}/upload`, { githubUrl });
            } else {
                await apiClient.post(`/api/fix-my-app/${session.sessionId}/upload`, { files });
            }

            // If source has context available, go to context step
            const sourceConfig = sourceOptions.find(s => s.id === source);
            if (sourceConfig?.contextAvailable && consent.chatHistory) {
                setStep('context');
            } else {
                // Skip to analysis
                await runAnalysis();
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to upload files',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    // =========================================================================
    // EMBEDDED BROWSER FUNCTIONS
    // =========================================================================

    // Check if source requires browser login (AI builders with context)
    const requiresBrowserLogin = useCallback(() => {
        const browserSources: ImportSource[] = ['lovable', 'bolt', 'v0', 'create', 'tempo', 'gptengineer', 'databutton', 'magic_patterns', 'replit'];
        const result = source && browserSources.includes(source);
        console.log('[FixMyApp] requiresBrowserLogin() called - source:', source, 'result:', result);
        return result;
    }, [source]);

    // Get platform URL based on source
    const getPlatformUrl = useCallback(() => {
        // If user provided a specific project URL, use that
        if (projectUrl) {
            return projectUrl;
        }
        // Otherwise fall back to platform homepage
        const urls: Record<string, string> = {
            lovable: 'https://lovable.dev/projects',
            bolt: 'https://bolt.new',
            v0: 'https://v0.dev',
            create: 'https://create.xyz',
            tempo: 'https://tempo.new',
            gptengineer: 'https://gptengineer.app',
            databutton: 'https://databutton.com',
            magic_patterns: 'https://magicpatterns.com',
            replit: 'https://replit.com',
        };
        return source ? urls[source] || '' : '';
    }, [source, projectUrl]);

    // Note: Browser automation removed - users now export and upload manually


    // Submit chat context
    const submitContext = async () => {
        if (!session) return;

        setIsLoading(true);
        setCurrentActivity('Processing context...');

        try {
            await apiClient.post(`/api/fix-my-app/${session.sessionId}/context`, {
                chatHistory,
            });

            await runAnalysis();
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to submit context',
                variant: 'destructive',
            });
            setIsLoading(false);
        }
    };

    // Run analysis
    const runAnalysis = async () => {
        if (!session) return;

        setStep('analysis');
        setCurrentActivity('Analyzing your project...');

        try {
            const response = await apiClient.post<{
                intentSummary: IntentSummary;
                errorTimeline: ErrorTimeline;
                implementationGaps: any[];
                recommendedStrategy: FixStrategy;
                alternativeStrategies: FixStrategy[];
            }>(`/api/fix-my-app/${session.sessionId}/analyze`);

            setIntentSummary(response.data.intentSummary);
            setErrorTimeline(response.data.errorTimeline);
            setImplementationGaps(response.data.implementationGaps);
            setRecommendedStrategy(response.data.recommendedStrategy);
            setAlternativeStrategies(response.data.alternativeStrategies);
            setSelectedStrategy(response.data.recommendedStrategy);

            // Go to preferences step first
            setStep('preferences');
        } catch (error) {
            toast({
                title: 'Analysis Failed',
                description: 'Failed to analyze project',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Submit UI preferences
    const submitPreferences = async () => {
        if (!session) return;

        setIsLoading(true);
        try {
            await apiClient.post(`/api/fix-my-app/${session.sessionId}/preferences`, {
                uiPreference,
                additionalInstructions: additionalInstructions || undefined,
            });

            setStep('strategy');
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to save preferences',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const startFix = async () => {
        if (!session || !selectedStrategy) return;

        setStep('fix');
        setProgress(0);
        setLogs([]);

        // Connect to SSE stream for real-time updates
        eventSourceRef.current = new EventSource(
            `/api/fix-my-app/${session.sessionId}/stream`
        );

        eventSourceRef.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleFixEvent(data);
        };

        eventSourceRef.current.onerror = () => {
            eventSourceRef.current?.close();
            toast({
                title: 'Connection Lost',
                description: 'Lost connection to fix stream. Build may still be running - check back later.',
                variant: 'destructive',
            });
        };

        // This routes through Brain-driven engine with Intent Satisfaction gate
        const endpoint = `/api/fix-my-app/${session.sessionId}/fix`;

        try {
            await apiClient.post(endpoint, {
                strategy: selectedStrategy,
                preferences: {
                    uiPreference,
                    additionalInstructions: additionalInstructions || undefined,
                },
                mode: fixMode,
                credentials: {},
            });
        } catch (error) {
            toast({
                title: 'Fix Failed',
                description: 'Failed to start fix process',
                variant: 'destructive',
            });
        }
    };

    // Handle SSE events
    const handleFixEvent = (event: any) => {
        switch (event.type) {
            case 'progress':
                setProgress(event.progress);
                setCurrentActivity(event.stage);
                break;
            case 'log':
                setLogs(prev => [...prev, event.message]);
                break;
            case 'file':
                setLogs(prev => [...prev, `${event.action}: ${event.path}`]);
                break;
            case 'complete':
                eventSourceRef.current?.close();
                setNotification(event.notification);
                setVerificationReport(event.report);
                setStep('complete');
                break;
            case 'error':
                eventSourceRef.current?.close();
                toast({
                    title: 'Fix Error',
                    description: event.message,
                    variant: 'destructive',
                });
                break;
        }
    };

    // Navigate to builder
    const goToBuilder = () => {
        if (session?.projectId) {
            navigate(`/builder/${session.projectId}`);
        }
    };

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFiles = e.target.files;
        if (!uploadedFiles) return;

        const newFiles: { path: string; content: string }[] = [];

        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const content = await file.text();
            newFiles.push({
                path: file.webkitRelativePath || file.name,
                content,
            });
        }

        setFiles(newFiles);
    };

    // Get step index
    const currentStepIndex = steps.findIndex(s => s.id === step);

    // Hide old UI when on source step (premium 3D UI takes over)
    const showOldUI = step !== 'source';

    return (
        <div
            className="min-h-screen"
            style={{
                background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)',
                color: '#1a1a1a',
                fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            }}
        >
            {/* Header - Premium Glass Style (hidden on source step) */}
            {showOldUI && (
            <header
                className="relative z-10 sticky top-0"
                style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.45) 100%)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.04), inset 0 1px 1px rgba(255,255,255,0.9)',
                }}
            >
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #c25a00 0%, #a04800 100%)',
                                boxShadow: '0 4px 16px rgba(194,90,0,0.3), inset 0 1px 2px rgba(255,255,255,0.2)',
                            }}
                        >
                            <SettingsIcon size={22} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Fix My App</h1>
                            <p className="text-xs" style={{ color: '#666' }}>Import & fix broken AI-built apps</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="glass-button px-4 py-2 rounded-xl text-sm font-medium"
                        style={{ color: '#1a1a1a' }}
                    >
                        Cancel
                    </button>
                </div>
            </header>
            )}

            {/* Progress Steps - Premium Style (hidden on source step) */}
            {showOldUI && (
            <div className="relative z-10 max-w-6xl mx-auto px-6 pt-6 pb-4">
                <div className="flex items-center justify-center gap-2 mb-12">
                    {steps.map((s, index) => {
                        const isActive = s.id === step;
                        const isComplete = index < currentStepIndex;
                        const Icon = s.icon;

                        return (
                            <div key={s.id} className="flex items-center">
                                <motion.div
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-full transition-all",
                                        isActive && "border",
                                        isComplete && "border",
                                        !isActive && !isComplete && "border"
                                    )}
                                    style={{
                                        background: isActive
                                            ? 'rgba(194,90,0,0.1)'
                                            : isComplete
                                                ? 'rgba(22,163,74,0.08)'
                                                : 'rgba(0,0,0,0.03)',
                                        borderColor: isActive
                                            ? 'rgba(194,90,0,0.3)'
                                            : isComplete
                                                ? 'rgba(22,163,74,0.25)'
                                                : 'rgba(0,0,0,0.06)',
                                    }}
                                    animate={{ scale: isActive ? 1.05 : 1 }}
                                >
                                    <Icon className={cn(
                                        "w-4 h-4",
                                        isActive && "text-amber-700",
                                        isComplete && "text-emerald-600",
                                        !isActive && !isComplete && "text-slate-500"
                                    ) as string} />
                                    <span className={cn(
                                        "text-sm font-medium hidden sm:block",
                                        isActive && "text-amber-700",
                                        isComplete && "text-emerald-600",
                                        !isActive && !isComplete && "text-slate-500"
                                    )}>
                                        {s.label}
                                    </span>
                                </motion.div>
                                {index < steps.length - 1 && (
                                    <div className={cn(
                                        "w-8 h-0.5 mx-2",
                                        isComplete ? "bg-emerald-500/40" : "bg-black/10"
                                    )} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            )}

            {/* Step Content - Premium Container */}
            <div className={showOldUI ? "relative z-10 max-w-4xl mx-auto px-6 pb-8" : ""}>
                {/* Step 1: Source Selection - Premium 3D Design (outside AnimatePresence to avoid double-animation flash) */}
                {step === 'source' && (
                    <div className="fixed inset-0 z-50">
                        <Suspense fallback={
                            <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
                                <div className="text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 border-4 border-amber-600/30 border-t-amber-600 rounded-full animate-spin" />
                                    <p style={{ color: '#666' }}>Loading premium experience...</p>
                                </div>
                            </div>
                        }>
                            <PremiumGlassSelection
                                selectedSource={source}
                                onSelectSource={(newSource) => {
                                    setSource(newSource);
                                    // Clear URL if switching to non-URL source
                                    const option = sourceOptions.find(s => s.id === newSource);
                                    if (option && !option.requiresUrl) {
                                        setGithubUrl('');
                                    }
                                }}
                                onContinue={initSession}
                                onCancel={() => navigate('/dashboard')}
                                isLoading={isLoading}
                                currentStep={0}
                            />
                        </Suspense>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className={showOldUI ? "max-w-3xl mx-auto" : ""}
                    >

                        {/* Step 2: Consent - URL Input and Authorization */}
                        {step === 'consent' && (
                            <Card className="p-8 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                <h2 className="text-2xl font-bold mb-2">Enter Your Project URL</h2>
                                <p className="text-slate-500 mb-8">
                                    We'll use our cloud browser to capture your entire conversation history automatically.
                                </p>

                                {/* Project URL Input - Required for AI Builders */}
                                {requiresBrowserLogin() && (
                                    <div className="mb-8 p-6 rounded-xl bg-white/30 border border-black/[0.06]">
                                        <label className="block text-sm font-medium text-slate-900 mb-2">
                                            Your Project URL in {sourceOptions.find(s => s.id === source)?.name}
                                        </label>
                                        <p className="text-sm text-slate-500 mb-4">
                                            Paste the URL of your project. This is the page where you can see your chat history and code.
                                        </p>
                                        <input
                                            type="url"
                                            value={projectUrl}
                                            onChange={(e) => setProjectUrl(e.target.value)}
                                            placeholder={
                                                source === 'bolt' ? 'https://bolt.new/~/your-project-id' :
                                                source === 'lovable' ? 'https://lovable.dev/projects/your-project-id' :
                                                source === 'v0' ? 'https://v0.dev/chat/your-chat-id' :
                                                source === 'create' ? 'https://create.xyz/your-project-id' :
                                                'https://...'
                                            }
                                            className="w-full px-4 py-3 rounded-lg bg-white/40 border border-black/[0.08] text-slate-900 placeholder-slate-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none transition-all"
                                        />
                                        {!projectUrl && (
                                            <p className="text-sm text-amber-700 mt-2">
                                                Required: Enter your project URL to continue
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Single consent checkbox - all or nothing */}
                                <div className="mb-8">
                                    <div
                                        className={cn(
                                            "p-6 rounded-xl border-2 cursor-pointer transition-all",
                                            consent.chatHistory && consent.buildLogs && consent.errorLogs && consent.versionHistory
                                                ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/50"
                                                : "bg-white/30/50 border-black/[0.08]/50 hover:border-black/[0.12]"
                                        )}
                                        onClick={() => {
                                            const allEnabled = consent.chatHistory && consent.buildLogs && consent.errorLogs && consent.versionHistory;
                                            const newValue = !allEnabled;
                                            setConsent({
                                                chatHistory: newValue,
                                                buildLogs: newValue,
                                                errorLogs: newValue,
                                                versionHistory: newValue,
                                            });
                                        }}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={cn(
                                                "w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all",
                                                consent.chatHistory && consent.buildLogs && consent.errorLogs && consent.versionHistory
                                                    ? "bg-emerald-500 border-emerald-500"
                                                    : "border-black/[0.12]"
                                            )}>
                                                {consent.chatHistory && consent.buildLogs && consent.errorLogs && consent.versionHistory && (
                                                    <CheckCircle2Icon size={16} className="text-white" />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-semibold text-slate-900 text-lg mb-2">
                                                    Grant Full Context Access
                                                </div>
                                                <p className="text-slate-500 text-sm mb-4">
                                                    Allow KripTik AI to capture all available data to understand your intent and fix your app:
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {[
                                                        'Chat/conversation history',
                                                        'Build & error logs',
                                                        'Runtime error logs',
                                                        'Version history'
                                                    ].map((item) => (
                                                        <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
                                                            <CheckCircle2Icon size={14} className={cn(
                                                                "flex-shrink-0",
                                                                consent.chatHistory ? "text-emerald-600" : "text-slate-600"
                                                            )} />
                                                            <span>{item}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 text-center">
                                        Click to {consent.chatHistory ? 'revoke' : 'grant'} access. Full context enables 95% fix success rate.
                                    </p>
                                </div>

                                {/* How it works info box */}
                                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-8">
                                    <div className="flex items-start gap-3">
                                        <BrainIcon size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm text-blue-700 font-medium mb-1">How Cloud Capture Works</p>
                                            <p className="text-sm text-slate-500">
                                                Our cloud browser will open your project. You'll log in once, and we'll capture your entire
                                                conversation automatically. No extension needed!
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep('source')}
                                        style={{...secondaryButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                        className="hover:bg-black/[0.04] hover:translate-y-[1px] active:translate-y-[3px]"
                                    >
                                        <ArrowLeftIcon size={16} /> Back
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (requiresBrowserLogin()) {
                                                // Start cloud capture with live login
                                                startCaptureWithLiveLogin();
                                            } else {
                                                // Non-browser sources go to upload step
                                                submitConsent();
                                            }
                                        }}
                                        disabled={isLoading || isStartingCapture || Boolean(requiresBrowserLogin() && !projectUrl)}
                                        style={{...primaryButtonStyles, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                        className="hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(0,0,0,0.3),0_4px_16px_rgba(251,146,60,0.5)] active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading || isStartingCapture ? (
                                            <><Loader2Icon size={16} className="animate-spin" /> Starting Cloud Browser...</>
                                        ) : requiresBrowserLogin() ? (
                                            <>Continue to Login <ArrowRightIcon size={16} /></>
                                        ) : (
                                            <>Grant Access & Continue <ArrowRightIcon size={16} /></>
                                        )}
                                    </button>
                                </div>
                            </Card>
                        )}

                        {/* Step 3: Login - HyperBrowser Live Login */}
                        {step === 'login' && (
                            <Card className="p-8 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                <h2 className="text-2xl font-bold mb-2">Log Into Your Account</h2>
                                <p className="text-slate-500 mb-6">
                                    A cloud browser has opened with your project. Please log in to {sourceOptions.find(s => s.id === source)?.name} to continue.
                                </p>

                                {/* Live URL Section */}
                                {liveLoginUrl && !useShareLinkFallback && (
                                    <div className="mb-8">
                                        <div className="p-6 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/30">
                                            <div className="flex items-start gap-4 mb-6">
                                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                                    <MonitorIcon size={24} className="text-blue-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Cloud Browser Ready</h3>
                                                    <p className="text-slate-500 text-sm">
                                                        Click the button below to open the cloud browser, then log into your {sourceOptions.find(s => s.id === source)?.name} account.
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => window.open(liveLoginUrl, '_blank', 'width=1280,height=800')}
                                                style={{...primaryButtonStyles, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                                className="hover:translate-y-[2px] mb-4"
                                            >
                                                <ExternalLinkIcon size={18} /> Open Cloud Browser & Login
                                            </button>

                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <Loader2Icon size={14} className="animate-spin text-blue-600" />
                                                <span>Waiting for you to log in... (auto-detecting)</span>
                                            </div>
                                        </div>

                                        {/* Instructions */}
                                        <ol className="mt-6 space-y-3">
                                            <li className="flex items-start gap-3">
                                                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">1</span>
                                                <span className="text-slate-700">Click "Open Cloud Browser" above</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">2</span>
                                                <span className="text-slate-700">Log into your {sourceOptions.find(s => s.id === source)?.name} account</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">3</span>
                                                <span className="text-slate-700">Once logged in, click "I've Logged In" below</span>
                                            </li>
                                        </ol>

                                        <div className="mt-6 flex gap-4">
                                            <button
                                                onClick={handleLoginComplete}
                                                disabled={isStartingCapture}
                                                style={{...primaryButtonStyles, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                                className="hover:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isStartingCapture ? (
                                                    <><Loader2Icon size={16} className="animate-spin" /> Verifying Login...</>
                                                ) : (
                                                    <><CheckCircle2Icon size={16} /> I've Logged In</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Fallback Option */}
                                {!useShareLinkFallback ? (
                                    <div className="mt-8 pt-6 border-t border-black/[0.08]">
                                        <button
                                            onClick={() => setUseShareLinkFallback(true)}
                                            className="text-sm text-slate-500 hover:text-slate-700 underline"
                                        >
                                            Can't log in? Use share link instead
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-6 rounded-xl bg-white/30 border border-black/[0.06]">
                                        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                            <LinkIcon size={18} className="text-amber-700" /> Share Link Fallback
                                        </h3>
                                        <p className="text-slate-500 text-sm mb-4">
                                            Share your project publicly in {sourceOptions.find(s => s.id === source)?.name}, then paste the share link below.
                                        </p>

                                        <ol className="space-y-2 mb-4 text-sm text-slate-700">
                                            <li>1. Go to your project in {sourceOptions.find(s => s.id === source)?.name}</li>
                                            <li>2. Click the "Share" button</li>
                                            <li>3. Copy the share link</li>
                                            <li>4. Paste it below</li>
                                        </ol>

                                        <input
                                            type="url"
                                            value={shareLink}
                                            onChange={(e) => setShareLink(e.target.value)}
                                            placeholder="Paste your share link here..."
                                            className="w-full px-4 py-3 rounded-lg bg-white/40 border border-black/[0.08] text-slate-900 placeholder-slate-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 outline-none transition-all mb-4"
                                        />

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setUseShareLinkFallback(false)}
                                                style={{...secondaryButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                                className="hover:bg-black/[0.04]"
                                            >
                                                <ArrowLeftIcon size={16} /> Back to Login
                                            </button>
                                            <button
                                                onClick={handleShareLinkCapture}
                                                disabled={!shareLink || isStartingCapture}
                                                style={{...primaryButtonStyles, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                                className="hover:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isStartingCapture ? (
                                                    <><Loader2Icon size={16} className="animate-spin" /> Processing...</>
                                                ) : (
                                                    <>Capture from Share Link <ArrowRightIcon size={16} /></>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Back button */}
                                <div className="mt-6">
                                    <button
                                        onClick={() => {
                                            // Clean up and go back
                                            if (loginCheckInterval) {
                                                clearInterval(loginCheckInterval);
                                                setLoginCheckInterval(null);
                                            }
                                            setLiveLoginUrl(null);
                                            setCaptureJobId(null);
                                            setUseShareLinkFallback(false);
                                            setStep('consent');
                                        }}
                                        style={{...ghostButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                        className="hover:bg-black/[0.04]"
                                    >
                                        <ArrowLeftIcon size={16} /> Change Project URL
                                    </button>
                                </div>
                            </Card>
                        )}

                        {/* Step 3: Upload - With Embedded Browser for AI Builders */}
                        {step === 'upload' && (
                            <Card className="p-8 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                <h2 className="text-2xl font-bold mb-2">Import Your Project</h2>
                                <p className="text-slate-500 mb-6">
                                    {requiresBrowserLogin()
                                        ? `Log in to ${sourceOptions.find(s => s.id === source)?.name} and navigate to your project.`
                                        : 'Upload your project files or paste your code.'}
                                </p>

                                {/* GitHub - Direct URL */}
                                {source === 'github' && (
                                    <div className="text-center py-8 mb-6">
                                        <GitHubIcon size={64} className="mx-auto mb-4 text-slate-500" />
                                        <p className="text-slate-700 mb-2">Repository: <code className="text-amber-700">{githubUrl}</code></p>
                                        <p className="text-sm text-slate-500">Click continue to clone this repository</p>
                                    </div>
                                )}

                                {/* AI Builders - Manual Upload Instructions */}
                                {requiresBrowserLogin() && (
                                    <div className="mb-6">
                                        {/* Instructions for manual export and upload */}
                                        <div className="p-6 border-2 border-dashed border-black/[0.08] rounded-xl mb-4">
                                            <div className="flex items-start gap-4 mb-6">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                                                    <DownloadIcon size={24} className="text-amber-700" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Export Your Project</h3>
                                                    <p className="text-slate-500 text-sm">
                                                        We've opened {sourceOptions.find(s => s.id === source)?.name} in a new tab.
                                                        Follow these steps:
                                                    </p>
                                                </div>
                                            </div>

                                            <ol className="space-y-3 mb-6">
                                                <li className="flex items-start gap-3">
                                                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">1</span>
                                                    <span className="text-slate-700">Log in to your account in the new tab</span>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">2</span>
                                                    <span className="text-slate-700">Navigate to the project you want to fix</span>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">3</span>
                                                    <span className="text-slate-700">Export/download your project as a ZIP file</span>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-700 text-sm font-semibold flex items-center justify-center flex-shrink-0">4</span>
                                                    <span className="text-slate-700">Upload the ZIP file below</span>
                                                </li>
                                            </ol>

                                            <button
                                                onClick={() => window.open(getPlatformUrl(), '_blank')}
                                                style={{...secondaryButtonStyles, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                                className="hover:bg-black/[0.04] hover:translate-y-[1px] active:translate-y-[3px]"
                                            >
                                                <MonitorIcon size={16} /> Open {sourceOptions.find(s => s.id === source)?.name} Again
                                            </button>
                                        </div>

                                        {/* Upload Section */}
                                        <div className="border-2 border-dashed border-black/[0.08] rounded-xl p-8 text-center">
                                            <UploadIcon size={48} className="mx-auto mb-4 text-slate-500" />
                                            <p className="text-slate-700 mb-4">Upload your exported project ZIP or folder</p>
                                            <input
                                                type="file"
                                                webkitdirectory=""
                                                multiple
                                                onChange={handleFileUpload}
                                                className="hidden"
                                                id="file-upload-ai-builder"
                                            />
                                            <label htmlFor="file-upload-ai-builder" className="cursor-pointer">
                                                <span style={{...secondaryButtonStyles, display: 'inline-block'}} className="hover:bg-black/[0.04]">Select Files</span>
                                            </label>

                                            {files.length > 0 && (
                                                <div className="mt-4 text-left">
                                                    <p className="text-sm text-emerald-600 mb-2">
                                                        ✓ {files.length} files selected
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ZIP Upload - Manual file upload */}
                                {source === 'zip' && (
                                    <div className="border-2 border-dashed border-black/[0.08] rounded-xl p-8 text-center mb-6">
                                        <PackageIcon size={48} className="mx-auto mb-4 text-slate-500" />
                                        <p className="text-slate-700 mb-4">Drag & drop your project ZIP or folder</p>
                                        <input
                                            type="file"
                                            webkitdirectory=""
                                            multiple
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            id="file-upload"
                                        />
                                        <label htmlFor="file-upload" className="cursor-pointer">
                                            <span style={{...secondaryButtonStyles, display: 'inline-block'}} className="hover:bg-black/[0.04]">Select Files</span>
                                        </label>

                                        {files.length > 0 && (
                                            <div className="mt-4 text-left">
                                                <p className="text-sm text-emerald-600 mb-2">
                                                    ✓ {files.length} files selected
                                                </p>
                                                <div className="max-h-32 overflow-y-auto text-xs text-slate-500">
                                                    {files.slice(0, 10).map(f => (
                                                        <div key={f.path}>{f.path}</div>
                                                    ))}
                                                    {files.length > 10 && <div>... and {files.length - 10} more</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Footer Buttons */}
                                {(
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setStep('consent')}
                                            style={{...secondaryButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                            className="hover:bg-black/[0.04] hover:translate-y-[1px] active:translate-y-[3px]"
                                        >
                                            <ArrowLeftIcon size={16} /> Back
                                        </button>
                                        <button
                                            onClick={uploadFiles}
                                            disabled={isLoading || (source !== 'github' && files.length === 0)}
                                            style={{...primaryButtonStyles, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                            className="hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(0,0,0,0.3),0_4px_16px_rgba(251,146,60,0.5)] active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isLoading ? (
                                                <><Loader2Icon size={16} className="animate-spin" /> {currentActivity}</>
                                            ) : (
                                                <>Import Files <ArrowRightIcon size={16} /></>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* Step 4: Context (Chat History) */}
                        {step === 'context' && (
                            <Card className="p-8 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="text-3xl">
                                        {typeof sourceOptions.find(s => s.id === source)?.icon === 'string'
                                            ? sourceOptions.find(s => s.id === source)?.icon
                                            : sourceOptions.find(s => s.id === source)?.icon}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">Paste Your Chat History</h2>
                                        <p className="text-slate-500 text-sm">
                                            from {sourceOptions.find(s => s.id === source)?.name}
                                        </p>
                                    </div>
                                </div>

                                <p className="text-slate-500 mb-6">
                                    This conversation history is the <strong className="text-amber-700">secret weapon</strong> that boosts fix success from 60% to 95%.
                                </p>

                                <div className="mb-6">
                                    {/* Source-specific instructions */}
                                    <div className="p-4 rounded-lg bg-white/30 border border-black/[0.06] mb-4">
                                        <h3 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                                            <MessageSquareIcon size={16} className="text-amber-500" />
                                            How to get your chat history from {sourceOptions.find(s => s.id === source)?.name}:
                                        </h3>
                                        <ol className="text-sm text-slate-500 list-decimal list-inside space-y-1">
                                            {(sourceOptions.find(s => s.id === source)?.chatInstructions || [
                                                `Open your ${sourceOptions.find(s => s.id === source)?.name} project`,
                                                'Scroll to the top of the chat/conversation',
                                                'Select all messages (Cmd/Ctrl + A)',
                                                'Copy (Cmd/Ctrl + C) and paste below',
                                            ]).map((instruction, i) => (
                                                <li key={i}>{instruction}</li>
                                            ))}
                                        </ol>
                                    </div>

                                    {/* What to include tips */}
                                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 mb-4">
                                        <p className="text-sm text-emerald-600">
                                            💡 <strong>Include everything:</strong> Your requests, AI responses, error messages, and any code snippets.
                                            The more context, the better the fix!
                                        </p>
                                    </div>

                                    <Textarea
                                        value={chatHistory}
                                        onChange={(e) => setChatHistory(e.target.value)}
                                        placeholder={`Paste your ${sourceOptions.find(s => s.id === source)?.name} conversation here...\n\nExample:\nUser: Build me a todo app with dark mode\nAssistant: I'll create a todo app with...\n...`}
                                        className="min-h-[300px] bg-white/30 border-black/[0.08] font-mono text-sm"
                                    />

                                    {/* Character count */}
                                    {chatHistory && (
                                        <div className="mt-2 text-xs text-slate-500">
                                            {chatHistory.length.toLocaleString()} characters • ~{Math.ceil(chatHistory.split(/\s+/).length / 100)} messages detected
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep('upload')}
                                        style={{...secondaryButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                        className="hover:bg-black/[0.04] hover:translate-y-[1px] active:translate-y-[3px]"
                                    >
                                        <ArrowLeftIcon size={16} /> Back
                                    </button>
                                    <button
                                        onClick={runAnalysis}
                                        style={{...ghostButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                        className="hover:bg-black/[0.04] hover:text-slate-900"
                                    >
                                        Skip Context
                                        <span className="text-xs opacity-60">(~60%)</span>
                                    </button>
                                    <button
                                        onClick={submitContext}
                                        disabled={isLoading || !chatHistory.trim()}
                                        style={{...primaryButtonStyles, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                        className="hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(0,0,0,0.3),0_4px_16px_rgba(251,146,60,0.5)] active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? (
                                            <><Loader2Icon size={16} className="animate-spin" /> {currentActivity}</>
                                        ) : (
                                            <>Analyze Context <ArrowRightIcon size={16} /></>
                                        )}
                                    </button>
                                </div>
                            </Card>
                        )}

                        {/* Step 5: Analysis Results */}
                        {step === 'analysis' && (
                            <Card className="p-8 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                <div className="flex flex-col items-center justify-center py-12">
                                    <BrainIcon size={64} className="text-amber-500 animate-pulse mb-6" />
                                    <h2 className="text-2xl font-bold mb-2">Analyzing Your Project</h2>
                                    <p className="text-slate-500 mb-8">{currentActivity || 'Extracting intent and building error timeline...'}</p>
                                    <Progress value={progress} className="w-full max-w-md" />
                                </div>
                            </Card>
                        )}

                        {/* Step 5.5: UI Preferences */}
                        {step === 'preferences' && intentSummary && (
                            <Card className="p-8 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                <h2 className="text-2xl font-bold mb-2">How Should We Handle Your UI?</h2>
                                <p className="text-slate-500 mb-8">
                                    We found your existing design. Do you want to keep it or start fresh?
                                </p>

                                <div className="space-y-4 mb-8">
                                    {/* Keep UI Option */}
                                    <button
                                        onClick={() => setUiPreference('keep_ui')}
                                        className={cn(
                                            "w-full p-6 rounded-xl border-2 text-left transition-all",
                                            uiPreference === 'keep_ui'
                                                ? "border-emerald-500 bg-emerald-500/10"
                                                : "border-black/[0.08] hover:border-black/[0.12]"
                                        )}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={cn(
                                                "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                                                uiPreference === 'keep_ui' ? "bg-emerald-500/20" : "bg-white/30"
                                            )}>
                                                🎨
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-semibold text-slate-900 mb-1">Keep My UI</div>
                                                <p className="text-sm text-slate-500">
                                                    Preserve your existing design exactly. We'll clone your UI components and only fix the broken functions/logic underneath.
                                                </p>
                                                <div className="mt-2 text-xs text-emerald-600">
                                                    Best for: "I love my design, just make it work"
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Improve UI Option */}
                                    <button
                                        onClick={() => setUiPreference('improve_ui')}
                                        className={cn(
                                            "w-full p-6 rounded-xl border-2 text-left transition-all",
                                            uiPreference === 'improve_ui'
                                                ? "border-amber-500 bg-amber-500/10"
                                                : "border-black/[0.08] hover:border-black/[0.12]"
                                        )}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={cn(
                                                "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                                                uiPreference === 'improve_ui' ? "bg-amber-500/20" : "bg-white/30"
                                            )}>
                                                ✨
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-semibold text-slate-900 mb-1">Improve If Needed</div>
                                                <p className="text-sm text-slate-500">
                                                    Keep your general design direction and colors, but allow improvements to component structure for better UX.
                                                </p>
                                                <div className="mt-2 text-xs text-amber-700">
                                                    Best for: "Make it work, and make it better"
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Rebuild UI Option */}
                                    <button
                                        onClick={() => setUiPreference('rebuild_ui')}
                                        className={cn(
                                            "w-full p-6 rounded-xl border-2 text-left transition-all",
                                            uiPreference === 'rebuild_ui'
                                                ? "border-blue-500 bg-blue-500/10"
                                                : "border-black/[0.08] hover:border-black/[0.12]"
                                        )}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={cn(
                                                "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                                                uiPreference === 'rebuild_ui' ? "bg-blue-500/20" : "bg-white/30"
                                            )}>
                                                🚀
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-semibold text-slate-900 mb-1">Rebuild From Scratch</div>
                                                <p className="text-sm text-slate-500">
                                                    Don't worry about the existing UI. Build a fresh, premium design based on your original requirements.
                                                </p>
                                                <div className="mt-2 text-xs text-blue-600">
                                                    Best for: "Start over with a better design"
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {/* Additional instructions */}
                                <div className="mb-8">
                                    <Label className="text-slate-700 mb-2 block">
                                        Any specific instructions? (optional)
                                    </Label>
                                    <Textarea
                                        value={additionalInstructions}
                                        onChange={(e) => setAdditionalInstructions(e.target.value)}
                                        placeholder="e.g., 'Keep the dark theme but improve the button animations' or 'Make sure the sidebar navigation works exactly as I designed it'"
                                        className="bg-white/30 border-black/[0.08] min-h-[100px]"
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setStep('analysis')}
                                        style={{...secondaryButtonStyles, display: 'flex', alignItems: 'center', gap: '8px'}}
                                        className="hover:bg-black/[0.04] hover:translate-y-[1px] active:translate-y-[3px]"
                                    >
                                        <ArrowLeftIcon size={16} /> Back
                                    </button>
                                    <button
                                        onClick={submitPreferences}
                                        disabled={isLoading}
                                        style={{...primaryButtonStyles, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                                        className="hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(0,0,0,0.3),0_4px_16px_rgba(251,146,60,0.5)] active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? (
                                            <><Loader2Icon size={16} className="animate-spin" /> Saving...</>
                                        ) : (
                                            <>Continue to Strategy <ArrowRightIcon size={16} /></>
                                        )}
                                    </button>
                                </div>
                            </Card>
                        )}

                        {/* Step 6: Strategy Selection */}
                        {step === 'strategy' && intentSummary && (
                            <div className="space-y-6">
                                {/* Intent Summary */}
                                <Card className="p-6 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <TargetIcon size={20} className="text-amber-500" />
                                        What You Wanted to Build
                                    </h3>
                                    <p className="text-slate-700 mb-4">{intentSummary.corePurpose}</p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <h4 className="text-sm font-medium text-slate-500 mb-2">Primary Features</h4>
                                            <div className="space-y-2">
                                                {intentSummary.primaryFeatures.map(f => (
                                                    <div key={f.id} className="flex items-center gap-2">
                                                        {f.status === 'implemented' && <CheckCircle2Icon size={16} className="text-emerald-500" />}
                                                        {f.status === 'partial' && <AlertCircleIcon size={16} className="text-amber-500" />}
                                                        {f.status === 'missing' && <AlertCircleIcon size={16} className="text-red-500" />}
                                                        {f.status === 'broken' && <AlertCircleIcon size={16} className="text-red-500" />}
                                                        <span className="text-sm text-slate-900">{f.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-slate-500 mb-2">Secondary Features</h4>
                                            <div className="space-y-2">
                                                {intentSummary.secondaryFeatures.map(f => (
                                                    <div key={f.id} className="flex items-center gap-2">
                                                        {f.status === 'implemented' && <CheckCircle2Icon size={16} className="text-emerald-500" />}
                                                        {f.status === 'partial' && <AlertCircleIcon size={16} className="text-amber-500" />}
                                                        {f.status === 'missing' && <AlertCircleIcon size={16} className="text-red-500" />}
                                                        {f.status === 'broken' && <AlertCircleIcon size={16} className="text-red-500" />}
                                                        <span className="text-sm text-slate-900">{f.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                {/* Error Timeline */}
                                {errorTimeline && errorTimeline.errorCount > 0 && (
                                    <Card className="p-6 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                            <AlertCircleIcon size={20} className="text-red-500" />
                                            Error Archaeology
                                        </h3>
                                        <div className="space-y-3">
                                            {errorTimeline.firstError && (
                                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                                    <div className="text-sm font-medium text-red-600">
                                                        First Error (Message #{errorTimeline.firstError.messageNumber})
                                                    </div>
                                                    <div className="text-sm text-slate-700">{errorTimeline.firstError.description}</div>
                                                </div>
                                            )}
                                            <div className="text-sm text-slate-500">
                                                <strong>Root Cause:</strong> {errorTimeline.rootCause}
                                            </div>
                                            {errorTimeline.cascadingFailures && (
                                                <Badge variant="destructive">Cascading Failures Detected</Badge>
                                            )}
                                        </div>
                                    </Card>
                                )}

                                {/* Strategy Selection */}
                                <Card className="p-6 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <SparklesIcon size={20} className="text-amber-500" />
                                        Recommended Fix Strategy
                                    </h3>

                                    {recommendedStrategy && (
                                        <div className="space-y-4">
                                            <button
                                                onClick={() => setSelectedStrategy(recommendedStrategy)}
                                                className={cn(
                                                    "w-full p-4 rounded-xl border-2 text-left transition-all",
                                                    selectedStrategy === recommendedStrategy
                                                        ? "border-amber-500 bg-amber-500/10"
                                                        : "border-black/[0.08] hover:border-black/[0.12]"
                                                )}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <Badge className="bg-amber-500/20 text-amber-700">Recommended</Badge>
                                                    <span className="text-2xl font-bold text-emerald-600">
                                                        {Math.round(recommendedStrategy.confidence * 100)}% confidence
                                                    </span>
                                                </div>
                                                <div className="font-semibold text-slate-900 capitalize mb-2">
                                                    {recommendedStrategy.approach.replace('_', ' ')}
                                                </div>
                                                <p className="text-sm text-slate-500 mb-3">{recommendedStrategy.reasoning}</p>
                                                <div className="flex gap-4 text-sm">
                                                    <span className="text-slate-500">
                                                        ⏱️ ~{recommendedStrategy.estimatedTimeMinutes} min
                                                    </span>
                                                    <span className="text-slate-500">
                                                        💰 ~${recommendedStrategy.estimatedCost.toFixed(2)}
                                                    </span>
                                                </div>
                                            </button>

                                            {alternativeStrategies.length > 0 && (
                                                <>
                                                    <Separator className="bg-black/[0.08]" />
                                                    <div className="text-sm text-slate-500 mb-2">Alternative Strategies:</div>
                                                    {alternativeStrategies.map((strategy, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setSelectedStrategy(strategy)}
                                                            className={cn(
                                                                "w-full p-4 rounded-xl border-2 text-left transition-all",
                                                                selectedStrategy === strategy
                                                                    ? "border-amber-500 bg-amber-500/10"
                                                                    : "border-black/[0.08] hover:border-black/[0.12]"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="font-medium text-slate-900 capitalize">
                                                                    {strategy.approach.replace('_', ' ')}
                                                                </span>
                                                                <span className="text-slate-500">
                                                                    {Math.round(strategy.confidence * 100)}% confidence
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-slate-500">{strategy.reasoning}</p>
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Fix Mode Selector */}
                                    <div className="mt-6 p-4 bg-white/20 rounded-xl">
                                        <h4 className="text-sm font-medium text-slate-500 mb-3">Fix Mode</h4>
                                        <SpeedDialSelector
                                            selectedMode={fixMode}
                                            onModeChange={setFixMode}
                                        />
                                    </div>

                                    <button
                                        onClick={startFix}
                                        disabled={!selectedStrategy}
                                        style={{...ctaButtonStyles, width: '100%', marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px'}}
                                        className="hover:translate-y-[3px] hover:shadow-[0_3px_0_rgba(0,0,0,0.3),0_8px_24px_rgba(251,146,60,0.55)] active:translate-y-[6px] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                    >
                                        <RocketIcon size={20} />
                                    </button>
                                </Card>
                            </div>
                        )}

                        {/* Step 7: Fix Progress - Enhanced with Ultimate Builder Components */}
                        {step === 'fix' && (
                            <div className="space-y-4">
                                <Card className="p-6 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                            <SettingsIcon size={20} className="text-amber-500 animate-pulse" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold">Fixing Your App</h2>
                                            <p className="text-sm text-slate-500">{currentActivity}</p>
                                        </div>
                                    </div>

                                    {/* Build Phase Indicator */}
                                    <div className="mb-4 p-3 bg-white/20 rounded-xl">
                                    </div>

                                    <Progress value={progress} className="h-2 mb-4" />

                                    {/* Fix Mode Badge */}
                                    <div className="flex items-center gap-2 mb-4">
                                        <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-700">
                                            {fixMode === 'standard' ? 'Standard' : 'Production'}
                                        </Badge>
                                        <span className="text-xs text-slate-500">
                                            {selectedStrategy?.approach === 'repair' ? 'Repairing' :
                                             selectedStrategy?.approach === 'rebuild_partial' ? 'Partial Rebuild' : 'Full Rebuild'}
                                        </span>
                                    </div>

                                    {/* Logs */}
                                    <div className="bg-white/30/50 rounded-xl p-3 font-mono text-xs h-40 overflow-y-auto">
                                        {logs.map((log, i) => (
                                            <div key={i} className="text-slate-700">
                                                <span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> {log}
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                {/* premium glass Status */}
                                <Card className="p-4 border-0" style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.4) 50%, rgba(248,248,250,0.45) 100%)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.5)', borderRadius: 20 }}>
                                </Card>
                            </div>
                        )}

                        {/* Step 8: Complete */}
                        {step === 'complete' && notification && (
                            <Card className="p-8 border-0 text-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', bounce: 0.5 }}
                                    className="mb-6"
                                >
                                    <div className="text-6xl mb-4">{notification.emoji}</div>
                                    <h2 className="text-2xl font-bold text-slate-900 mb-2">{notification.title}</h2>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-lg text-slate-700 mb-4"
                                >
                                    {notification.message}
                                </motion.p>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.6 }}
                                    className="text-amber-700 font-medium mb-8"
                                >
                                    {notification.subtext}
                                </motion.p>

                                {notification.celebrationGif && (
                                    <motion.img
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.9 }}
                                        src={notification.celebrationGif}
                                        alt="Celebration"
                                        className="mx-auto rounded-xl mb-8 max-w-xs"
                                    />
                                )}

                                {verificationReport && (
                                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 mb-8 text-left">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle2Icon size={20} className="text-emerald-600" />
                                            <span className="font-medium text-emerald-600">Verification Passed</span>
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            {verificationReport.featureVerifications?.filter((f: any) => f.working).length || 0} /
                                            {verificationReport.featureVerifications?.length || 0} features working
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={goToBuilder}
                                    style={{...ctaButtonStyles, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px'}}
                                    className="hover:translate-y-[3px] hover:shadow-[0_3px_0_rgba(0,0,0,0.3),0_8px_24px_rgba(251,146,60,0.55)] active:translate-y-[6px]"
                                >
                                    <RocketIcon size={20} />
                                    Open in Builder
                                </button>
                            </Card>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Notification Preferences Modal - Shows when capture starts */}
            <NotificationPreferencesModal
                isOpen={showNotificationModal}
                onClose={() => {
                    setShowNotificationModal(false);
                    // If no live URL was provided, redirect to dashboard now
                    if (!liveLoginUrl && pendingProjectId) {
                        navigate(`/dashboard?capturingProject=${pendingProjectId}`);
                    }
                }}
                onSave={() => {
                    setShowNotificationModal(false);
                    // If no live URL was provided, redirect to dashboard now
                    if (!liveLoginUrl && pendingProjectId) {
                        navigate(`/dashboard?capturingProject=${pendingProjectId}`);
                    }
                }}
                projectId={pendingProjectId || undefined}
            />
        </div>
    );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================


// Declare webkitdirectory for TypeScript
declare module 'react' {
    interface InputHTMLAttributes<T> extends React.HTMLAttributes<T> {
        webkitdirectory?: string;
    }
}

