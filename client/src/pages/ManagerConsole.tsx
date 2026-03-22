/**
 * Manager Console - Premium Admin Dashboard
 *
 * Admin-only dashboard for learning evidence, patterns, and A/B testing.
 * Protected: Only accessible by admin users (role='admin' or bootstrap email).
 * Investor-presentation quality: 3D glass background, premium glassmorphism, amber accents.
 */

import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useUserStore } from '../store/useUserStore';
import { authenticatedFetch, API_URL } from '@/lib/api-config';
import { HoverSidebar } from '../components/navigation/HoverSidebar';
import { GlitchText } from '../components/ui/GlitchText';
import '../styles/manager-console.css';

const Console3DScene = lazy(() => import('../components/manager/Console3DScene'));
import { IssuesTab } from '../components/manager/IssuesTab';
import { LearningTab } from '../components/manager/LearningTab';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverviewData {
    metrics: {
        totalPatterns: number;
        totalUsers: number;
        totalBuilds: number;
        evolutionCycles: number;
        totalDecisions: number;
        totalStrategies: number;
        knowledgeLinks: number;
        improvementPct: number;
    };
    recentActivity: Array<{
        type: string;
        label: string;
        detail: string;
        timestamp: string;
    }>;
}

interface EvidenceData {
    decisionOutcomes: Array<{ outcome: string; count: number }>;
    evolutionCycles: Array<{
        cycleNumber: number;
        startMetrics: any;
        endMetrics: any;
        patternsExtracted: number;
        judgmentsRun: number;
        createdAt: string;
    }>;
    patternCategories: Array<{ category: string; avgSuccessRate: number; count: number }>;
    errorRecovery: { successRate: number; total: number };
    knowledgeTransfer: { totalLinks: number; avgSimilarity: number };
    judgments: { avgQuality: number; total: number };
    topDecisions: Array<{
        id: string;
        phase: string;
        decision: string;
        confidence: number;
        outcome: string;
        timestamp: string;
    }>;
}

interface TimelineData {
    patterns: Array<{ day: string; count: number }>;
    decisions: Array<{ day: string; count: number; successCount: number }>;
    recoveries: Array<{ day: string; count: number; successCount: number }>;
}

interface PatternItem {
    id: string;
    patternId: string;
    category: string;
    name: string;
    problem: string;
    solutionTemplate: string;
    codeTemplate: string | null;
    conditions: string[] | null;
    antiConditions: string[] | null;
    usageCount: number;
    successRate: number;
    sourceTraceId: string | null;
    createdAt: string;
    updatedAt: string;
    originUserId: string | null;
    originUserName: string | null;
    originUserEmail: string | null;
}

interface ABTest {
    id: string;
    name: string;
    description: string | null;
    status: string;
    targetMetric: string;
    minSampleSize: number;
    pValue: number | null;
    significant: boolean | null;
    winner: string | null;
    createdAt: string;
    completedAt: string | null;
    resultsSummary?: {
        controlCount: number;
        treatmentCount: number;
        avgControlQuality: number;
        avgTreatmentQuality: number;
    };
}

interface UserItem {
    id: string;
    name: string;
    email: string;
    role: string;
    tier: string;
    credits: number;
    createdAt: string;
    builds: number;
    decisionsContributed: number;
    patternsReceived: number;
}

type TabId = 'overview' | 'issues' | 'evidence' | 'patterns' | 'ab-testing' | 'users' | 'learning';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
    { id: 'issues', label: 'Issues', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
    { id: 'evidence', label: 'Evidence', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'patterns', label: 'Patterns', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
    { id: 'ab-testing', label: 'A/B Testing', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { id: 'users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'learning', label: 'Learning Engine', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
];

// ─── Premium SVG Chart Components ────────────────────────────────────────────

function MiniLineChart({ data, width = 200, height = 60, color = '#fbbf24' }: {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
}) {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const points = data.map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = height - ((v - min) / range) * (height - 12) - 6;
        return `${x},${y}`;
    });
    const pathD = `M${points.join(' L')}`;
    const areaD = `${pathD} L${width},${height} L0,${height} Z`;
    const gradId = `lg-${color.replace('#', '')}`;
    const glowId = `glow-${color.replace('#', '')}`;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
                <filter id={glowId}>
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            {/* Subtle grid lines */}
            {[0.25, 0.5, 0.75].map((pct) => (
                <line
                    key={pct}
                    x1={0} y1={height * pct} x2={width} y2={height * pct}
                    stroke="rgba(255,255,255,0.04)" strokeWidth="1"
                />
            ))}
            <path d={areaD} fill={`url(#${gradId})`} />
            <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${glowId})`}
            />
            {/* End dot */}
            {points.length > 0 && (
                <circle
                    cx={parseFloat(points[points.length - 1].split(',')[0])}
                    cy={parseFloat(points[points.length - 1].split(',')[1])}
                    r="4"
                    fill={color}
                    stroke="#0a0a0f"
                    strokeWidth="2"
                />
            )}
        </svg>
    );
}

function DonutChart({ segments, size = 140 }: {
    segments: Array<{ value: number; color: string; label: string }>;
    size?: number;
}) {
    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
    const r = (size - 12) / 2;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    const glowId = `donut-glow-${size}`;

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    <filter id={glowId}>
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {/* Background ring */}
                <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8"
                />
                {segments.map((seg, i) => {
                    const pct = seg.value / total;
                    const dashArray = `${pct * circumference} ${circumference}`;
                    const rotation = (offset / total) * 360 - 90;
                    offset += seg.value;
                    return (
                        <circle
                            key={i}
                            cx={size / 2}
                            cy={size / 2}
                            r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="8"
                            strokeDasharray={dashArray}
                            strokeLinecap="round"
                            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
                            filter={`url(#${glowId})`}
                        />
                    );
                })}
            </svg>
            <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <span style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#fbbf24',
                    fontFamily: "'Clash Display', sans-serif",
                    textShadow: '0 0 20px rgba(245,158,11,0.3)',
                }}>
                    {total}
                </span>
                <span style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontFamily: "'Cabinet Grotesk', sans-serif",
                }}>
                    Total
                </span>
            </div>
        </div>
    );
}

function SuccessRing({ rate, size = 44 }: { rate: number; size?: number }) {
    const r = (size - 8) / 2;
    const circumference = 2 * Math.PI * r;
    const dashArray = `${(rate / 100) * circumference} ${circumference}`;
    const color = rate >= 70 ? '#4ade80' : rate >= 40 ? '#fbbf24' : '#f87171';
    const glowId = `ring-${rate}-${size}`;

    return (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    <filter id={glowId}>
                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3"
                    strokeDasharray={dashArray} strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    filter={`url(#${glowId})`}
                />
            </svg>
            <span style={{
                position: 'absolute',
                fontSize: size < 38 ? 9 : 11,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.9)',
            }}>
                {rate}%
            </span>
        </div>
    );
}

function BarChart({ data, width = 400, height = 140 }: {
    data: Array<{ label: string; value: number; color?: string }>;
    width?: number;
    height?: number;
}) {
    if (!data.length) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    const barW = Math.min(28, (width - data.length * 6) / data.length);
    const gap = 6;
    const chartH = height - 28;
    const glowId = 'bar-glow';

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <defs>
                <filter id={glowId}>
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
            </defs>
            {/* Horizontal grid */}
            {[0.25, 0.5, 0.75].map((pct) => (
                <line
                    key={pct}
                    x1={0} y1={chartH * (1 - pct)} x2={width} y2={chartH * (1 - pct)}
                    stroke="rgba(255,255,255,0.04)" strokeWidth="1"
                />
            ))}
            {data.map((d, i) => {
                const barH = Math.max(2, (d.value / max) * (chartH - 8));
                const x = i * (barW + gap) + gap;
                const y = chartH - barH;
                return (
                    <g key={i}>
                        <rect
                            x={x} y={y} width={barW} height={barH} rx={4}
                            fill={d.color || 'url(#barGrad)'}
                            opacity={0.9}
                            filter={`url(#${glowId})`}
                        />
                        {/* Value label on top */}
                        <text
                            x={x + barW / 2} y={y - 6}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.5)"
                            fontSize="9"
                            fontFamily="'Clash Display', sans-serif"
                            fontWeight="600"
                        >
                            {d.value}
                        </text>
                        {/* X-axis label */}
                        <text
                            x={x + barW / 2} y={chartH + 16}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.3)"
                            fontSize="9"
                            fontFamily="'Satoshi', sans-serif"
                        >
                            {d.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─── AnimatedNumber ──────────────────────────────────────────────────────────

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const end = value;
        const duration = 800;
        const startTime = Date.now();
        const tick = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(end * eased));
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [value]);
    return <>{display.toLocaleString()}{suffix}</>;
}

// ─── Glass Card Wrapper ─────────────────────────────────────────────────────

const GLASS_CARD: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(245,158,11,0.02) 100%)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 28,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    boxShadow: `
        0 2px 0 rgba(255,255,255,0.03),
        0 4px 0 rgba(0,0,0,0.12),
        0 8px 24px rgba(0,0,0,0.25),
        0 24px 48px rgba(0,0,0,0.12),
        inset 0 1px 0 rgba(255,255,255,0.06),
        inset 0 -1px 0 rgba(0,0,0,0.12)
    `,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
};

const GLASS_HIGHLIGHT: React.CSSProperties = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: 'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.12) 70%, transparent 90%)',
    pointerEvents: 'none' as const,
};

function GlassCard({ children, style, className }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}) {
    return (
        <div className={`mc-glass-card ${className || ''}`} style={{ ...GLASS_CARD, ...style }}>
            <div style={GLASS_HIGHLIGHT} />
            {children}
        </div>
    );
}

// ─── Metric Card ────────────────────────────────────────────────────────────

function MetricCard({ label, value, suffix, subtitle, accentColor }: {
    label: string;
    value: number;
    suffix?: string;
    subtitle: string;
    accentColor?: string;
}) {
    const color = accentColor || '#fbbf24';
    return (
        <div className="mc-metric-card">
            <div style={GLASS_HIGHLIGHT} />
            <div className="mc-metric-card__edge" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
            <div className="mc-metric-card__glow" style={{ background: `radial-gradient(circle at 50% 0%, ${color}08, transparent 70%)` }} />
            <span className="mc-metric-card__label">{label}</span>
            <span className="mc-metric-card__value" style={{ color, textShadow: `0 0 24px ${color}40` }}>
                <AnimatedNumber value={value} suffix={suffix} />
            </span>
            <span className="mc-metric-card__sub">{subtitle}</span>
        </div>
    );
}

// ─── Section Label ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
    return (
        <div style={{
            fontSize: 11,
            fontFamily: "'Cabinet Grotesk', sans-serif",
            fontWeight: 700,
            color: 'rgba(255,255,255,0.35)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.12em',
            marginBottom: 16,
        }}>
            {children}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ManagerConsole() {
    const navigate = useNavigate();
    const { user, isAuthenticated, isLoading: authLoading } = useUserStore();
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [loading, setLoading] = useState(true);

    // GSAP refs
    const headerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Data state
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [evidence, setEvidence] = useState<EvidenceData | null>(null);
    const [timeline, setTimeline] = useState<TimelineData | null>(null);
    const [patterns, setPatterns] = useState<PatternItem[]>([]);
    const [patternTotal, setPatternTotal] = useState(0);
    const [patternCategories, setPatternCategories] = useState<Array<{ category: string; count: number }>>([]);
    const [abTests, setAbTests] = useState<ABTest[]>([]);
    const [usersList, setUsersList] = useState<UserItem[]>([]);

    // Pattern selection for distribution
    const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
    const [showDistributeModal, setShowDistributeModal] = useState(false);
    const [distributeNotes, setDistributeNotes] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    // Filters
    const [patternSearch, setPatternSearch] = useState('');
    const [patternCategory, setPatternCategory] = useState('');

    // A/B Test creation
    const [showCreateTest, setShowCreateTest] = useState(false);
    const [newTestName, setNewTestName] = useState('');
    const [newTestDesc, setNewTestDesc] = useState('');

    // Auth guard
    const isAdmin = useMemo(() => {
        if (!user) return false;
        return (user as any).role === 'admin' || user.email === 'logantbaird@gmail.com';
    }, [user]);

    useEffect(() => {
        if (!authLoading && (!isAuthenticated || !isAdmin)) {
            navigate('/dashboard');
        }
    }, [authLoading, isAuthenticated, isAdmin, navigate]);

    // GSAP entrance animation
    useEffect(() => {
        if (authLoading || !isAdmin) return;
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        if (headerRef.current) {
            tl.fromTo(headerRef.current,
                { opacity: 0, y: -20 },
                { opacity: 1, y: 0, duration: 0.6 }
            );
        }
        if (contentRef.current) {
            tl.fromTo(contentRef.current,
                { opacity: 0, y: 30 },
                { opacity: 1, y: 0, duration: 0.7 },
                '-=0.35'
            );
        }
    }, [authLoading, isAdmin]);

    // Fetchers
    const fetchOverview = useCallback(async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/overview`);
            if (res.ok) setOverview(await res.json());
        } catch (e) { console.error('[MC] Overview fetch:', e); }
    }, []);

    const fetchEvidence = useCallback(async () => {
        try {
            const [evRes, tlRes] = await Promise.all([
                authenticatedFetch(`${API_URL}/api/manager/evidence`),
                authenticatedFetch(`${API_URL}/api/manager/evidence/timeline?days=30`),
            ]);
            if (evRes.ok) setEvidence(await evRes.json());
            if (tlRes.ok) setTimeline(await tlRes.json());
        } catch (e) { console.error('[MC] Evidence fetch:', e); }
    }, []);

    const fetchPatterns = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (patternSearch) params.set('search', patternSearch);
            if (patternCategory) params.set('category', patternCategory);
            params.set('limit', '50');
            const res = await authenticatedFetch(`${API_URL}/api/manager/patterns?${params}`);
            if (res.ok) {
                const data = await res.json();
                setPatterns(data.patterns);
                setPatternTotal(data.total);
                setPatternCategories(data.categories);
            }
        } catch (e) { console.error('[MC] Patterns fetch:', e); }
    }, [patternSearch, patternCategory]);

    const fetchAbTests = useCallback(async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/ab-tests`);
            if (res.ok) {
                const data = await res.json();
                setAbTests(data.tests);
            }
        } catch (e) { console.error('[MC] AB tests fetch:', e); }
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/users`);
            if (res.ok) {
                const data = await res.json();
                setUsersList(data.users);
            }
        } catch (e) { console.error('[MC] Users fetch:', e); }
    }, []);

    // Load data based on active tab
    useEffect(() => {
        if (!isAdmin) return;
        setLoading(true);
        const load = async () => {
            switch (activeTab) {
                case 'overview': await fetchOverview(); break;
                case 'evidence': await fetchEvidence(); break;
                case 'patterns': await fetchPatterns(); break;
                case 'ab-testing': await fetchAbTests(); break;
                case 'users': await fetchUsers(); break;
            }
            setLoading(false);
        };
        load();
    }, [activeTab, isAdmin, fetchOverview, fetchEvidence, fetchPatterns, fetchAbTests, fetchUsers]);

    // Refetch patterns on filter change
    useEffect(() => {
        if (activeTab === 'patterns') fetchPatterns();
    }, [patternSearch, patternCategory, activeTab, fetchPatterns]);

    // Distribution handler
    const handleDistribute = async () => {
        if (!selectedPatterns.size || !selectedUsers.size) return;
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/patterns/distribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patternIds: [...selectedPatterns],
                    userIds: [...selectedUsers],
                    notes: distributeNotes || undefined,
                }),
            });
            if (res.ok) {
                setShowDistributeModal(false);
                setSelectedPatterns(new Set());
                setSelectedUsers(new Set());
                setDistributeNotes('');
            }
        } catch (e) { console.error('[MC] Distribute:', e); }
    };

    // Create A/B test handler
    const handleCreateTest = async () => {
        if (!newTestName.trim()) return;
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/ab-tests/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTestName,
                    description: newTestDesc || undefined,
                    controlConfig: { learningEnabled: false, description: 'No learned patterns injected' },
                    treatmentConfig: { learningEnabled: true, description: 'Full learning context injected' },
                }),
            });
            if (res.ok) {
                setShowCreateTest(false);
                setNewTestName('');
                setNewTestDesc('');
                fetchAbTests();
            }
        } catch (e) { console.error('[MC] Create test:', e); }
    };

    const togglePatternSelection = (id: string) => {
        setSelectedPatterns(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleUserSelection = (id: string) => {
        setSelectedUsers(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (authLoading) {
        return (
            <div className="mc-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="mc-spinner" />
            </div>
        );
    }

    // ─── RENDER ──────────────────────────────────────────────────────────────

    return (
        <div className="mc-page">
            <HoverSidebar />

            {/* 3D Background */}
            <Suspense fallback={null}>
                <Console3DScene />
            </Suspense>

            {/* Header */}
            <header ref={headerRef} className="mc-header">
                <div className="mc-header__inner">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <GlitchText
                                text="KripTik AI"
                                color="#fbbf24"
                                className="mc-header-brand text-2xl"
                            />
                            <div className="mc-header-divider" />
                            <h1 className="mc-header-title">
                                Manager's Console
                            </h1>
                        </div>
                        <p className="mc-header-subtitle">
                            Learning Intelligence & Evidence Dashboard
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="mc-health mc-health--healthy">
                            <div className="mc-health-dot" />
                            System Active
                        </div>
                        <button className="mc-btn mc-btn--glass" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </header>

            <div ref={contentRef} className="mc-layout" style={{ paddingTop: 24 }}>
                {/* Mobile Tab Selector */}
                <select
                    className="mc-mobile-select"
                    value={activeTab}
                    onChange={e => setActiveTab(e.target.value as TabId)}
                >
                    {TABS.map(tab => (
                        <option key={tab.id} value={tab.id}>{tab.label}</option>
                    ))}
                </select>

                {/* Sidebar Tabs */}
                <nav className="mc-sidebar">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`mc-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d={tab.icon} />
                            </svg>
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <div style={{ minWidth: 0 }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        >
                            {activeTab === 'overview' && <OverviewTab data={overview} loading={loading} />}
                            {activeTab === 'issues' && <IssuesTab />}
                            {activeTab === 'evidence' && <EvidenceTab data={evidence} timeline={timeline} loading={loading} />}
                            {activeTab === 'patterns' && (
                                <PatternsTab
                                    patterns={patterns}
                                    total={patternTotal}
                                    categories={patternCategories}
                                    selected={selectedPatterns}
                                    onToggle={togglePatternSelection}
                                    onDistribute={() => {
                                        fetchUsers();
                                        setShowDistributeModal(true);
                                    }}
                                    search={patternSearch}
                                    onSearchChange={setPatternSearch}
                                    category={patternCategory}
                                    onCategoryChange={setPatternCategory}
                                    loading={loading}
                                />
                            )}
                            {activeTab === 'ab-testing' && (
                                <ABTestingTab
                                    tests={abTests}
                                    loading={loading}
                                    onCreateNew={() => setShowCreateTest(true)}
                                />
                            )}
                            {activeTab === 'users' && <UsersTab users={usersList} loading={loading} />}
                            {activeTab === 'learning' && <LearningTab />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Distribution Modal */}
            <AnimatePresence>
                {showDistributeModal && (
                    <motion.div
                        className="mc-modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowDistributeModal(false)}
                    >
                        <motion.div
                            className="mc-modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={GLASS_HIGHLIGHT} />
                            <h2 className="mc-modal-title">
                                Distribute {selectedPatterns.size} Pattern{selectedPatterns.size !== 1 ? 's' : ''}
                            </h2>
                            <SectionLabel>Select recipients</SectionLabel>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
                                {usersList.map(u => (
                                    <div
                                        key={u.id}
                                        className={`mc-select-row ${selectedUsers.has(u.id) ? 'active' : ''}`}
                                        onClick={() => toggleUserSelection(u.id)}
                                    >
                                        <div className={`mc-checkbox ${selectedUsers.has(u.id) ? 'checked' : ''}`}>
                                            {selectedUsers.has(u.id) && (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)' }}>{u.name}</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{u.email}</div>
                                        </div>
                                        <span className={`mc-badge mc-badge--${u.role}`}>{u.role}</span>
                                    </div>
                                ))}
                            </div>
                            <textarea
                                className="mc-textarea"
                                placeholder="Optional notes about this distribution..."
                                value={distributeNotes}
                                onChange={e => setDistributeNotes(e.target.value)}
                                style={{ marginBottom: 16 }}
                            />
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                <button className="mc-btn mc-btn--glass" onClick={() => setShowDistributeModal(false)}>Cancel</button>
                                <button className="mc-btn mc-btn--primary" onClick={handleDistribute}
                                    style={{ opacity: selectedUsers.size ? 1 : 0.4 }}>
                                    Distribute to {selectedUsers.size} User{selectedUsers.size !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create A/B Test Modal */}
            <AnimatePresence>
                {showCreateTest && (
                    <motion.div
                        className="mc-modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowCreateTest(false)}
                    >
                        <motion.div
                            className="mc-modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={GLASS_HIGHLIGHT} />
                            <h2 className="mc-modal-title">Create A/B Test</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <SectionLabel>Test Name</SectionLabel>
                                    <input className="mc-input" placeholder="e.g., Pattern Injection Effectiveness" value={newTestName} onChange={e => setNewTestName(e.target.value)} />
                                </div>
                                <div>
                                    <SectionLabel>Description</SectionLabel>
                                    <textarea className="mc-textarea" placeholder="What are you testing?" value={newTestDesc} onChange={e => setNewTestDesc(e.target.value)} />
                                </div>
                                <GlassCard style={{ padding: 20 }}>
                                    <SectionLabel>Test Configuration</SectionLabel>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                        <div className="mc-config-panel">
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>Control</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No learned patterns injected into build context</div>
                                        </div>
                                        <div className="mc-config-panel mc-config-panel--treatment">
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 6 }}>Treatment</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Full learning context injected (patterns, strategies, decisions)</div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </div>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
                                <button className="mc-btn mc-btn--glass" onClick={() => setShowCreateTest(false)}>Cancel</button>
                                <button className="mc-btn mc-btn--primary" onClick={handleCreateTest}
                                    style={{ opacity: newTestName.trim() ? 1 : 0.4 }}>
                                    Start Test
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Tab Components ──────────────────────────────────────────────────────────

function OverviewTab({ data, loading }: { data: OverviewData | null; loading: boolean }) {
    if (loading || !data) return <LoadingSkeleton />;
    const m = data.metrics;

    return (
        <div className="mc-stagger">
            {/* Hero Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginBottom: 32 }}>
                <MetricCard label="Total Patterns" value={m.totalPatterns} subtitle="Reusable solutions extracted" />
                <MetricCard label="Builds Analyzed" value={m.totalBuilds} subtitle="Across all users" />
                <MetricCard label="Evolution Cycles" value={m.evolutionCycles} subtitle="Meta-learning iterations" accentColor="#60a5fa" />
                <MetricCard label="Improvement" value={m.improvementPct} suffix="%" subtitle="Cycle-over-cycle" accentColor={m.improvementPct >= 0 ? '#4ade80' : '#f87171'} />
            </div>

            {/* Secondary Metrics */}
            <SectionLabel>System Depth</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
                {[
                    { label: 'Decisions', value: m.totalDecisions },
                    { label: 'Strategies', value: m.totalStrategies },
                    { label: 'Knowledge Links', value: m.knowledgeLinks },
                    { label: 'Active Users', value: m.totalUsers },
                ].map((item) => (
                    <GlassCard key={item.label} style={{ padding: 20 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 600 }}>
                            {item.label}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#e5e5e5', fontFamily: "'Clash Display', sans-serif", marginTop: 8 }}>
                            <AnimatedNumber value={item.value} />
                        </div>
                    </GlassCard>
                ))}
            </div>

            {/* Recent Activity */}
            <SectionLabel>Recent Learning Activity</SectionLabel>
            <GlassCard>
                {data.recentActivity.length === 0 ? (
                    <div className="mc-empty">No learning activity yet. Run some builds to start collecting data.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {data.recentActivity.map((a, i) => (
                            <div key={i} className="mc-activity-row">
                                <div className="mc-activity-dot" style={{
                                    background: a.type === 'pattern' ? '#fbbf24' : a.type === 'cycle' ? '#4ade80' : '#60a5fa',
                                    boxShadow: `0 0 8px ${a.type === 'pattern' ? '#fbbf24' : a.type === 'cycle' ? '#4ade80' : '#60a5fa'}50`,
                                }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{a.label}</span>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 10 }}>{a.detail}</span>
                                </div>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: "'Satoshi', sans-serif" }}>
                                    {new Date(a.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </GlassCard>
        </div>
    );
}

function EvidenceTab({ data, timeline, loading }: { data: EvidenceData | null; timeline: TimelineData | null; loading: boolean }) {
    if (loading || !data) return <LoadingSkeleton />;

    const outcomeColors: Record<string, string> = {
        success: '#4ade80',
        partial_success: '#fbbf24',
        failure: '#f87171',
        unknown: 'rgba(255,255,255,0.3)',
    };

    const donutSegments = data.decisionOutcomes.map(o => ({
        value: o.count,
        color: outcomeColors[o.outcome] || outcomeColors.unknown,
        label: o.outcome,
    }));

    return (
        <div className="mc-stagger">
            {/* Learning Proof */}
            <SectionLabel>Learning Proof</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginBottom: 32 }}>
                <GlassCard>
                    <div className="mc-proof-label">Error Recovery Rate</div>
                    <div className="mc-proof-value" style={{
                        color: data.errorRecovery.successRate >= 50 ? '#4ade80' : '#f87171',
                        textShadow: `0 0 24px ${data.errorRecovery.successRate >= 50 ? '#4ade80' : '#f87171'}30`,
                    }}>
                        {data.errorRecovery.successRate}%
                    </div>
                    <div className="mc-proof-detail">of {data.errorRecovery.total} errors auto-recovered</div>
                    <div className="mc-proof-bar">
                        <div className="mc-proof-bar__fill" style={{
                            width: `${Math.min(data.errorRecovery.successRate, 100)}%`,
                            background: data.errorRecovery.successRate >= 50 ? 'linear-gradient(90deg, #4ade80, #22c55e)' : 'linear-gradient(90deg, #f87171, #ef4444)',
                        }} />
                    </div>
                </GlassCard>
                <GlassCard>
                    <div className="mc-proof-label">AI Judgment Quality</div>
                    <div className="mc-proof-value" style={{ color: '#fbbf24', textShadow: '0 0 24px rgba(245,158,11,0.3)' }}>
                        {data.judgments.avgQuality.toFixed(1)}
                    </div>
                    <div className="mc-proof-detail">avg score across {data.judgments.total} judgments</div>
                    <div className="mc-proof-bar">
                        <div className="mc-proof-bar__fill" style={{
                            width: `${Math.min(data.judgments.avgQuality, 100)}%`,
                            background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                        }} />
                    </div>
                </GlassCard>
                <GlassCard>
                    <div className="mc-proof-label">Knowledge Transfer</div>
                    <div className="mc-proof-value" style={{ color: '#60a5fa', textShadow: '0 0 24px rgba(96,165,250,0.3)' }}>
                        {data.knowledgeTransfer.totalLinks}
                    </div>
                    <div className="mc-proof-detail">{data.knowledgeTransfer.avgSimilarity}% avg similarity</div>
                    <div className="mc-proof-bar">
                        <div className="mc-proof-bar__fill" style={{
                            width: `${Math.min(data.knowledgeTransfer.avgSimilarity, 100)}%`,
                            background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                        }} />
                    </div>
                </GlassCard>
            </div>

            {/* Pattern Growth Timeline */}
            {timeline && timeline.patterns.length > 0 && (
                <>
                    <SectionLabel>Pattern Growth (30 days)</SectionLabel>
                    <GlassCard style={{ marginBottom: 28 }}>
                        <MiniLineChart data={timeline.patterns.map(p => p.count)} width={680} height={100} />
                    </GlassCard>
                </>
            )}

            {/* Decision Outcomes + Categories */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 28 }}>
                <div>
                    <SectionLabel>Decision Outcomes</SectionLabel>
                    <GlassCard>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
                            <DonutChart segments={donutSegments} size={140} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {data.decisionOutcomes.map(o => (
                                    <div key={o.outcome} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 10, height: 10, borderRadius: 3,
                                            background: outcomeColors[o.outcome] || outcomeColors.unknown,
                                            boxShadow: `0 0 6px ${outcomeColors[o.outcome] || outcomeColors.unknown}40`,
                                        }} />
                                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>
                                            {o.outcome.replace('_', ' ')}
                                        </span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: "'Clash Display', sans-serif" }}>
                                            {o.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </GlassCard>
                </div>
                <div>
                    <SectionLabel>Patterns by Category</SectionLabel>
                    <GlassCard>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {data.patternCategories.map(pc => (
                                <div key={pc.category} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span className={`mc-badge mc-badge--${pc.category}`}>{pc.category}</span>
                                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                                        <div style={{
                                            height: '100%', borderRadius: 3,
                                            width: `${Math.min(pc.avgSuccessRate, 100)}%`,
                                            background: pc.avgSuccessRate >= 70
                                                ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                                                : pc.avgSuccessRate >= 40
                                                    ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                                                    : 'linear-gradient(90deg, #f87171, #ef4444)',
                                            boxShadow: `0 0 8px ${pc.avgSuccessRate >= 70 ? '#4ade80' : pc.avgSuccessRate >= 40 ? '#fbbf24' : '#f87171'}30`,
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', minWidth: 36, textAlign: 'right', fontWeight: 600 }}>{pc.avgSuccessRate}%</span>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', minWidth: 28 }}>({pc.count})</span>
                                </div>
                            ))}
                            {data.patternCategories.length === 0 && (
                                <div className="mc-empty" style={{ padding: 24 }}>No pattern categories yet</div>
                            )}
                        </div>
                    </GlassCard>
                </div>
            </div>

            {/* Evolution Cycle History */}
            {data.evolutionCycles.length > 0 && (
                <>
                    <SectionLabel>Evolution Cycle Progression</SectionLabel>
                    <GlassCard style={{ marginBottom: 28 }}>
                        <BarChart
                            data={data.evolutionCycles.map(c => ({
                                label: `#${c.cycleNumber}`,
                                value: c.patternsExtracted || 0,
                            }))}
                            width={Math.min(680, data.evolutionCycles.length * 40)}
                            height={140}
                        />
                    </GlassCard>
                </>
            )}

            {/* Top Decisions */}
            {data.topDecisions.length > 0 && (
                <>
                    <SectionLabel>Top 10 Successful Decisions</SectionLabel>
                    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
                        <table className="mc-table">
                            <thead>
                                <tr>
                                    <th>Phase</th>
                                    <th>Decision</th>
                                    <th>Confidence</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.topDecisions.map(d => (
                                    <tr key={d.id}>
                                        <td><span className="mc-badge mc-badge--running">{d.phase}</span></td>
                                        <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.decision}</td>
                                        <td>
                                            <span style={{ color: '#4ade80', fontWeight: 600, textShadow: '0 0 8px rgba(74,222,128,0.3)' }}>
                                                {(d.confidence * 100).toFixed(0)}%
                                            </span>
                                        </td>
                                        <td>{new Date(d.timestamp).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </>
            )}
        </div>
    );
}

function PatternsTab({ patterns, total, categories, selected, onToggle, onDistribute, search, onSearchChange, category, onCategoryChange, loading }: {
    patterns: PatternItem[];
    total: number;
    categories: Array<{ category: string; count: number }>;
    selected: Set<string>;
    onToggle: (id: string) => void;
    onDistribute: () => void;
    search: string;
    onSearchChange: (v: string) => void;
    category: string;
    onCategoryChange: (v: string) => void;
    loading: boolean;
}) {
    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <input
                    className="mc-input"
                    style={{ maxWidth: 300 }}
                    placeholder="Search patterns..."
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                />
                <select
                    className="mc-input"
                    style={{ maxWidth: 200 }}
                    value={category}
                    onChange={e => onCategoryChange(e.target.value)}
                >
                    <option value="">All Categories</option>
                    {categories.map(c => (
                        <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
                    ))}
                </select>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: "'Satoshi', sans-serif" }}>
                    {total} pattern{total !== 1 ? 's' : ''}
                </span>
                {selected.size > 0 && (
                    <button className="mc-btn mc-btn--primary" onClick={onDistribute}>
                        Distribute {selected.size} Pattern{selected.size !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* Pattern Grid */}
            {loading ? <LoadingSkeleton /> : patterns.length === 0 ? (
                <GlassCard>
                    <div className="mc-empty">No patterns found. Patterns are extracted from builds as the learning engine runs.</div>
                </GlassCard>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }} className="mc-stagger">
                    {patterns.map(p => (
                        <div
                            key={p.id}
                            className={`mc-pattern-card ${selected.has(p.id) ? 'selected' : ''}`}
                            onClick={() => onToggle(p.id)}
                        >
                            <div style={GLASS_HIGHLIGHT} />
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <div className={`mc-checkbox ${selected.has(p.id) ? 'checked' : ''}`} style={{ marginTop: 2 }}>
                                    {selected.has(p.id) && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{p.name}</span>
                                        <span className={`mc-badge mc-badge--${p.category}`}>{p.category}</span>
                                    </div>
                                    <p style={{
                                        fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12,
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                                    }}>
                                        {p.problem}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <SuccessRing rate={p.successRate ?? 0} size={40} />
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                                            {p.usageCount || 0} uses
                                        </div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
                                            {p.originUserName ? `by ${p.originUserName}` : 'System'}
                                        </div>
                                    </div>
                                    {(p.successRate ?? 100) < 30 && (
                                        <span className="mc-badge mc-badge--quarantined" style={{ marginTop: 10, display: 'inline-flex' }}>Quarantined</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ABTestingTab({ tests, loading, onCreateNew }: { tests: ABTest[]; loading: boolean; onCreateNew: () => void }) {
    if (loading) return <LoadingSkeleton />;

    const running = tests.filter(t => t.status === 'running');
    const completed = tests.filter(t => t.status !== 'running');

    return (
        <div className="mc-stagger">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <h3 style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
                    A/B Testing Framework
                </h3>
                <button className="mc-btn mc-btn--primary" onClick={onCreateNew}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Test
                </button>
            </div>

            {tests.length === 0 ? (
                <GlassCard>
                    <div className="mc-empty">
                        No A/B tests created yet. Create a test to compare builds with and without learned patterns.
                    </div>
                </GlassCard>
            ) : (
                <>
                    {running.length > 0 && (
                        <>
                            <SectionLabel>Active Tests</SectionLabel>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
                                {running.map(t => <ABTestCard key={t.id} test={t} />)}
                            </div>
                        </>
                    )}

                    {completed.length > 0 && (
                        <>
                            <SectionLabel>Completed Tests</SectionLabel>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {completed.map(t => <ABTestCard key={t.id} test={t} />)}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function ABTestCard({ test }: { test: ABTest }) {
    const rs = test.resultsSummary;
    return (
        <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.92)', flex: 1, fontFamily: "'Clash Display', sans-serif" }}>
                    {test.name}
                </span>
                <span className={`mc-badge mc-badge--${test.status}`}>{test.status}</span>
                {test.winner && (
                    <span className="mc-badge mc-badge--active" style={{ fontWeight: 700 }}>
                        Winner: {test.winner}
                    </span>
                )}
            </div>
            {test.description && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>{test.description}</p>
            )}
            {rs && (rs.controlCount > 0 || rs.treatmentCount > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="mc-config-panel">
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: "'Cabinet Grotesk', sans-serif" }}>Control</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#e5e5e5', fontFamily: "'Clash Display', sans-serif" }}>
                            {rs.avgControlQuality?.toFixed(1) || '\u2014'}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{rs.controlCount || 0} samples</div>
                    </div>
                    <div className="mc-config-panel mc-config-panel--treatment">
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: "'Cabinet Grotesk', sans-serif" }}>Treatment</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', fontFamily: "'Clash Display', sans-serif", textShadow: '0 0 16px rgba(245,158,11,0.25)' }}>
                            {rs.avgTreatmentQuality?.toFixed(1) || '\u2014'}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{rs.treatmentCount || 0} samples</div>
                    </div>
                </div>
            )}
            {test.pValue != null && (
                <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    p-value: <span style={{
                        color: test.significant ? '#4ade80' : 'rgba(255,255,255,0.6)',
                        fontWeight: 600,
                        textShadow: test.significant ? '0 0 8px rgba(74,222,128,0.3)' : 'none',
                    }}>
                        {test.pValue.toFixed(4)}
                    </span>
                    {test.significant && <span style={{ color: '#4ade80', marginLeft: 8 }}>Statistically Significant</span>}
                </div>
            )}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 10 }}>
                Created {new Date(test.createdAt).toLocaleDateString()} | Target: {test.targetMetric} | Min samples: {test.minSampleSize}
            </div>
        </GlassCard>
    );
}

function UsersTab({ users, loading }: { users: UserItem[]; loading: boolean }) {
    if (loading) return <LoadingSkeleton />;

    return (
        <div className="mc-stagger">
            <h3 style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>
                User Management
            </h3>
            {users.length === 0 ? (
                <GlassCard>
                    <div className="mc-empty">No users found.</div>
                </GlassCard>
            ) : (
                <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
                    <table className="mc-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Tier</th>
                                <th>Builds</th>
                                <th>Decisions</th>
                                <th>Patterns Received</th>
                                <th>Joined</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td>
                                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>{u.name}</div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{u.email}</div>
                                    </td>
                                    <td><span className={`mc-badge mc-badge--${u.role}`}>{u.role}</span></td>
                                    <td><span className="mc-badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>{u.tier}</span></td>
                                    <td style={{ fontWeight: 600 }}>{u.builds}</td>
                                    <td style={{ fontWeight: 600 }}>{u.decisionsContributed}</td>
                                    <td style={{ fontWeight: 600 }}>{u.patternsReceived}</td>
                                    <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </GlassCard>
            )}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="mc-skeleton" />
            ))}
        </div>
    );
}
