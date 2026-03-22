/**
 * Issues Tab - Manager Console
 *
 * Three views:
 * 1. Summary bar (severity + status counts)
 * 2. Issue list with filters (IssueCard rows)
 * 3. Issue detail view (full context, analysis, conversation)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authenticatedFetch, API_URL } from '@/lib/api-config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IssueSummary {
    total: number;
    open: number;
    analyzing: number;
    diagnosed: number;
    fixing: number;
    testing: number;
    resolved: number;
    dismissed: number;
    critical: number;
    error: number;
    warning: number;
}

interface ProductionIssue {
    id: string;
    title: string;
    severity: 'critical' | 'error' | 'warning';
    status: string;
    source: string;
    errorMessage: string;
    errorStack: string | null;
    requestPath: string | null;
    requestMethod: string | null;
    responseStatusCode: number | null;
    deploymentId: string | null;
    projectName: string | null;
    occurrenceCount: number;
    lastOccurredAt: string | null;
    analysisId: string | null;
    fixId: string | null;
    resolvedAt: string | null;
    dismissedAt: string | null;
    autoAnalyzeTriggered: boolean | null;
    createdAt: string;
    updatedAt: string;
}

interface IssueAnalysis {
    id: string;
    issueId: string;
    status: string;
    agentModel: string | null;
    diagnosis: string | null;
    rootCause: string | null;
    proposedFix: { files: Array<{ path: string; oldContent: string; newContent: string }>; explanation: string } | null;
    fitAnalysis: string | null;
    thinkingContent: string | null;
    tokensUsed: number | null;
    durationMs: number | null;
    createdAt: string;
    completedAt: string | null;
}

interface IssueFix {
    id: string;
    issueId: string;
    analysisId: string;
    status: string;
    branchName: string | null;
    commitSha: string | null;
    prNumber: number | null;
    sandboxUrl: string | null;
    testResults: Array<{ attempt: number; reproduced: boolean; details: string; timestamp: string }> | null;
    testAttempts: number | null;
    mergedAt: string | null;
    createdAt: string;
}

interface IssueConversation {
    id: string;
    issueId: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

interface IssueDetail {
    issue: ProductionIssue;
    analyses: IssueAnalysis[];
    fixes: IssueFix[];
    conversations: IssueConversation[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
    critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', label: 'CRITICAL' },
    error: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', label: 'ERROR' },
    warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', label: 'WARNING' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    open: { color: '#ef4444', label: 'Open' },
    analyzing: { color: '#60a5fa', label: 'Analyzing' },
    diagnosed: { color: '#a78bfa', label: 'Diagnosed' },
    fixing: { color: '#fbbf24', label: 'Fixing' },
    testing: { color: '#34d399', label: 'Testing' },
    resolved: { color: '#22c55e', label: 'Resolved' },
    dismissed: { color: '#6b7280', label: 'Dismissed' },
};

type FilterStatus = 'all' | 'active' | 'open' | 'analyzing' | 'diagnosed' | 'fixing' | 'testing' | 'resolved' | 'dismissed';

// ─── Main Component ──────────────────────────────────────────────────────────

export function IssuesTab() {
    const [summary, setSummary] = useState<IssueSummary | null>(null);
    const [issues, setIssues] = useState<ProductionIssue[]>([]);
    const [totalIssues, setTotalIssues] = useState(0);
    const [selectedIssue, setSelectedIssue] = useState<IssueDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('active');
    const [filterSeverity] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [polling, setPolling] = useState(false);
    const [conversationInput, setConversationInput] = useState('');
    const [conversing, setConversing] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const conversationEndRef = useRef<HTMLDivElement>(null);

    // ─── Data Fetching ────────────────────────────────────────────────────

    const fetchSummary = useCallback(async () => {
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/issues/summary`);
            if (res.ok) {
                setSummary(await res.json());
            }
        } catch (err) {
            console.error('[Issues] Summary fetch error:', err);
        }
    }, []);

    const fetchIssues = useCallback(async () => {
        try {
            const params = new URLSearchParams();

            if (filterStatus === 'active') {
                params.set('status', 'open,analyzing,diagnosed,fixing,testing');
            } else if (filterStatus !== 'all') {
                params.set('status', filterStatus);
            }

            if (filterSeverity) params.set('severity', filterSeverity);
            if (searchQuery) params.set('search', searchQuery);
            params.set('limit', '100');

            const res = await authenticatedFetch(`${API_URL}/api/manager/issues?${params}`);
            if (res.ok) {
                const data = await res.json();
                setIssues(data.issues);
                setTotalIssues(data.total);
            }
        } catch (err) {
            console.error('[Issues] List fetch error:', err);
        }
    }, [filterStatus, filterSeverity, searchQuery]);

    const fetchIssueDetail = useCallback(async (issueId: string) => {
        setDetailLoading(true);
        try {
            const res = await authenticatedFetch(`${API_URL}/api/manager/issues/${issueId}`);
            if (res.ok) {
                setSelectedIssue(await res.json());
            }
        } catch (err) {
            console.error('[Issues] Detail fetch error:', err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        Promise.all([fetchSummary(), fetchIssues()]).finally(() => setLoading(false));
    }, [fetchSummary, fetchIssues]);

    // Auto-scroll conversation
    useEffect(() => {
        conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [selectedIssue?.conversations]);

    // ─── Actions ──────────────────────────────────────────────────────────

    const handlePollLogs = async () => {
        setPolling(true);
        try {
            await authenticatedFetch(`${API_URL}/api/manager/issues/poll-logs`, { method: 'POST' });
            await Promise.all([fetchSummary(), fetchIssues()]);
        } catch (err) {
            console.error('[Issues] Poll error:', err);
        } finally {
            setPolling(false);
        }
    };

    const handleAnalyze = async (issueId: string, userMessage?: string) => {
        setAnalyzing(true);
        try {
            await authenticatedFetch(`${API_URL}/api/manager/issues/${issueId}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userMessage }),
            });
            // Refresh detail after a short delay to pick up the analysis
            setTimeout(() => {
                fetchIssueDetail(issueId);
                fetchSummary();
            }, 2000);
        } catch (err) {
            console.error('[Issues] Analyze error:', err);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleConverse = async () => {
        if (!conversationInput.trim() || !selectedIssue) return;
        const message = conversationInput;
        setConversationInput('');
        setConversing(true);
        try {
            // Optimistically add user message
            setSelectedIssue(prev => prev ? {
                ...prev,
                conversations: [...prev.conversations, {
                    id: `temp-${Date.now()}`,
                    issueId: prev.issue.id,
                    role: 'user' as const,
                    content: message,
                    metadata: null,
                    createdAt: new Date().toISOString(),
                }],
            } : null);

            const res = await authenticatedFetch(`${API_URL}/api/manager/issues/${selectedIssue.issue.id}/converse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });

            if (res.ok) {
                // Refresh to get the agent response
                await fetchIssueDetail(selectedIssue.issue.id);
            }
        } catch (err) {
            console.error('[Issues] Converse error:', err);
        } finally {
            setConversing(false);
        }
    };

    const handleDismiss = async (issueId: string) => {
        try {
            await authenticatedFetch(`${API_URL}/api/manager/issues/${issueId}/dismiss`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Dismissed by admin' }),
            });
            if (selectedIssue?.issue.id === issueId) {
                setSelectedIssue(null);
            }
            await Promise.all([fetchSummary(), fetchIssues()]);
        } catch (err) {
            console.error('[Issues] Dismiss error:', err);
        }
    };

    const handleResolve = async (issueId: string) => {
        try {
            await authenticatedFetch(`${API_URL}/api/manager/issues/${issueId}/resolve`, { method: 'POST' });
            if (selectedIssue?.issue.id === issueId) {
                setSelectedIssue(null);
            }
            await Promise.all([fetchSummary(), fetchIssues()]);
        } catch (err) {
            console.error('[Issues] Resolve error:', err);
        }
    };

    // ─── Loading State ────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="mc-issues-loading">
                <div className="mc-issues-skeleton" />
                <div className="mc-issues-skeleton" />
                <div className="mc-issues-skeleton" />
            </div>
        );
    }

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="mc-issues">
            {/* Summary Bar */}
            {summary && (
                <div className="mc-issues-summary">
                    <div className="mc-issues-summary__metrics">
                        <SummaryPill label="Total" value={summary.total} color="#e5e5e5" />
                        <SummaryPill label="Open" value={summary.open} color="#ef4444" />
                        <SummaryPill label="Analyzing" value={summary.analyzing} color="#60a5fa" />
                        <SummaryPill label="Diagnosed" value={summary.diagnosed} color="#a78bfa" />
                        <SummaryPill label="Fixing" value={summary.fixing} color="#fbbf24" />
                        <SummaryPill label="Resolved" value={summary.resolved} color="#22c55e" />
                    </div>
                    <div className="mc-issues-summary__severity">
                        <SeverityDot severity="critical" count={summary.critical} />
                        <SeverityDot severity="error" count={summary.error} />
                        <SeverityDot severity="warning" count={summary.warning} />
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="mc-issues-toolbar">
                <div className="mc-issues-toolbar__filters">
                    {(['active', 'all', 'open', 'analyzing', 'diagnosed', 'resolved', 'dismissed'] as FilterStatus[]).map(f => (
                        <button
                            key={f}
                            className={`mc-issues-filter-btn ${filterStatus === f ? 'active' : ''}`}
                            onClick={() => setFilterStatus(f)}
                        >
                            {f === 'active' ? 'Active' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="mc-issues-toolbar__actions">
                    <input
                        className="mc-issues-search"
                        placeholder="Search issues..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <button
                        className="mc-issues-poll-btn"
                        onClick={handlePollLogs}
                        disabled={polling}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                        </svg>
                        {polling ? 'Polling...' : 'Poll Logs'}
                    </button>
                </div>
            </div>

            {/* Content: List + Detail */}
            <div className="mc-issues-content">
                {/* Issue List */}
                <div className={`mc-issues-list ${selectedIssue ? 'has-detail' : ''}`}>
                    {issues.length === 0 ? (
                        <div className="mc-issues-empty">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                                No issues found. Click "Poll Logs" to check for runtime errors.
                            </div>
                        </div>
                    ) : (
                        <div className="mc-issues-list__items">
                            {issues.map((issue, i) => (
                                <IssueCard
                                    key={issue.id}
                                    issue={issue}
                                    index={i}
                                    isSelected={selectedIssue?.issue.id === issue.id}
                                    onSelect={() => fetchIssueDetail(issue.id)}
                                    onDismiss={() => handleDismiss(issue.id)}
                                    onResolve={() => handleResolve(issue.id)}
                                />
                            ))}
                        </div>
                    )}
                    <div className="mc-issues-list__footer">
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                            {totalIssues} issue{totalIssues !== 1 ? 's' : ''} total
                        </span>
                    </div>
                </div>

                {/* Issue Detail Panel */}
                <AnimatePresence>
                    {selectedIssue && (
                        <motion.div
                            className="mc-issues-detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                        >
                            <IssueDetailView
                                detail={selectedIssue}
                                loading={detailLoading}
                                analyzing={analyzing}
                                conversing={conversing}
                                conversationInput={conversationInput}
                                onConversationInputChange={setConversationInput}
                                onAnalyze={(msg) => handleAnalyze(selectedIssue.issue.id, msg)}
                                onConverse={handleConverse}
                                onDismiss={() => handleDismiss(selectedIssue.issue.id)}
                                onResolve={() => handleResolve(selectedIssue.issue.id)}
                                onClose={() => setSelectedIssue(null)}
                                conversationEndRef={conversationEndRef}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Issue Card ──────────────────────────────────────────────────────────────

function IssueCard({ issue, index, isSelected, onSelect, onDismiss, onResolve }: {
    issue: ProductionIssue;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onDismiss: () => void;
    onResolve: () => void;
}) {
    const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.error;
    const statusCfg = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;

    return (
        <motion.div
            className={`mc-issue-card ${isSelected ? 'selected' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.2 }}
            onClick={onSelect}
        >
            {/* Severity indicator */}
            <div className="mc-issue-card__severity" style={{ background: sev.color, boxShadow: `0 0 8px ${sev.color}50` }} />

            <div className="mc-issue-card__body">
                <div className="mc-issue-card__header">
                    <span
                        className="mc-issue-card__badge"
                        style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color }}
                    >
                        {sev.label}
                    </span>
                    <span
                        className="mc-issue-card__status"
                        style={{ color: statusCfg.color }}
                    >
                        {statusCfg.label}
                    </span>
                    {issue.occurrenceCount > 1 && (
                        <span className="mc-issue-card__count">
                            x{issue.occurrenceCount}
                        </span>
                    )}
                </div>

                <div className="mc-issue-card__title">{issue.title}</div>

                <div className="mc-issue-card__meta">
                    {issue.projectName && (
                        <span className="mc-issue-card__project">
                            {issue.projectName.replace('kriptik-ai-opus-build-', '').replace('kriptik-ai-opus-build', 'frontend')}
                        </span>
                    )}
                    {issue.source && (
                        <span className="mc-issue-card__source">{issue.source}</span>
                    )}
                    {issue.requestPath && (
                        <span className="mc-issue-card__path">{issue.requestPath}</span>
                    )}
                    <span className="mc-issue-card__time">
                        {formatRelativeTime(issue.lastOccurredAt || issue.createdAt)}
                    </span>
                </div>
            </div>

            <div className="mc-issue-card__actions" onClick={e => e.stopPropagation()}>
                {issue.status !== 'resolved' && issue.status !== 'dismissed' && (
                    <>
                        <button className="mc-issue-action-btn resolve" onClick={onResolve} title="Resolve">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                        <button className="mc-issue-action-btn dismiss" onClick={onDismiss} title="Dismiss">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </>
                )}
            </div>
        </motion.div>
    );
}

// ─── Issue Detail View ───────────────────────────────────────────────────────

function IssueDetailView({ detail, loading, analyzing, conversing, conversationInput, onConversationInputChange, onAnalyze, onConverse, onDismiss, onResolve, onClose, conversationEndRef }: {
    detail: IssueDetail;
    loading: boolean;
    analyzing: boolean;
    conversing: boolean;
    conversationInput: string;
    onConversationInputChange: (v: string) => void;
    onAnalyze: (msg?: string) => void;
    onConverse: () => void;
    onDismiss: () => void;
    onResolve: () => void;
    onClose: () => void;
    conversationEndRef: React.RefObject<HTMLDivElement>;
}) {
    const { issue, analyses, conversations } = detail;
    const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.error;
    const statusCfg = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;
    const latestAnalysis = analyses.find(a => a.status === 'completed');

    if (loading) {
        return (
            <div className="mc-issues-detail__loading">
                <div className="mc-issues-skeleton" style={{ height: 200 }} />
            </div>
        );
    }

    return (
        <div className="mc-issue-detail">
            {/* Header */}
            <div className="mc-issue-detail__header">
                <button className="mc-issue-detail__back" onClick={onClose}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="mc-issue-detail__header-info">
                    <span
                        className="mc-issue-card__badge"
                        style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color }}
                    >
                        {sev.label}
                    </span>
                    <span className="mc-issue-detail__status" style={{ color: statusCfg.color }}>
                        {statusCfg.label}
                    </span>
                </div>
                <div className="mc-issue-detail__header-actions">
                    {issue.status !== 'resolved' && issue.status !== 'dismissed' && (
                        <>
                            <button className="mc-issues-action-sm resolve" onClick={onResolve}>Resolve</button>
                            <button className="mc-issues-action-sm dismiss" onClick={onDismiss}>Dismiss</button>
                        </>
                    )}
                </div>
            </div>

            {/* Title + Error */}
            <h3 className="mc-issue-detail__title">{issue.title}</h3>
            <div className="mc-issue-detail__error-box">
                <pre className="mc-issue-detail__error-text">{issue.errorMessage}</pre>
                {issue.errorStack && (
                    <details className="mc-issue-detail__stack">
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Stack Trace</summary>
                        <pre className="mc-issue-detail__stack-text">{issue.errorStack}</pre>
                    </details>
                )}
            </div>

            {/* Metadata */}
            <div className="mc-issue-detail__meta-grid">
                {issue.requestPath && (
                    <MetaItem label="Path" value={`${issue.requestMethod || 'GET'} ${issue.requestPath}`} />
                )}
                {issue.responseStatusCode && (
                    <MetaItem label="Status" value={String(issue.responseStatusCode)} />
                )}
                {issue.projectName && (
                    <MetaItem label="Project" value={issue.projectName} />
                )}
                <MetaItem label="Source" value={issue.source} />
                <MetaItem label="Occurrences" value={String(issue.occurrenceCount)} />
                <MetaItem label="First Seen" value={new Date(issue.createdAt).toLocaleString()} />
                {issue.lastOccurredAt && (
                    <MetaItem label="Last Seen" value={formatRelativeTime(issue.lastOccurredAt)} />
                )}
            </div>

            {/* Analysis Section */}
            <div className="mc-issue-detail__section">
                <div className="mc-issue-detail__section-header">
                    <h4 className="mc-issue-detail__section-title">Analysis</h4>
                    {issue.status !== 'resolved' && issue.status !== 'dismissed' && (
                        <button
                            className="mc-issues-analyze-btn"
                            onClick={() => onAnalyze()}
                            disabled={analyzing}
                        >
                            {analyzing ? (
                                <span className="mc-issues-spinner" />
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            )}
                            {analyzing ? 'Analyzing...' : latestAnalysis ? 'Re-analyze' : 'Analyze with AI'}
                        </button>
                    )}
                </div>

                {latestAnalysis ? (
                    <div className="mc-issue-detail__analysis">
                        {latestAnalysis.rootCause && (
                            <div className="mc-issue-detail__root-cause">
                                <span className="mc-issue-detail__rc-label">Root Cause</span>
                                <p>{latestAnalysis.rootCause}</p>
                            </div>
                        )}
                        {latestAnalysis.diagnosis && (
                            <div className="mc-issue-detail__diagnosis">
                                <span className="mc-issue-detail__rc-label">Diagnosis</span>
                                <div className="mc-issue-detail__diagnosis-text">
                                    {latestAnalysis.diagnosis}
                                </div>
                            </div>
                        )}
                        {latestAnalysis.proposedFix && latestAnalysis.proposedFix.files?.length > 0 && (
                            <div className="mc-issue-detail__fix">
                                <span className="mc-issue-detail__rc-label">Proposed Fix</span>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                                    {latestAnalysis.proposedFix.explanation}
                                </p>
                                {latestAnalysis.proposedFix.files.map((file, i) => (
                                    <div key={i} className="mc-issue-detail__fix-file">
                                        <div className="mc-issue-detail__fix-path">{file.path}</div>
                                        <pre className="mc-issue-detail__fix-diff">
                                            {file.oldContent && <span className="mc-diff-remove">- {file.oldContent}</span>}
                                            {file.newContent && <span className="mc-diff-add">+ {file.newContent}</span>}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        )}
                        {latestAnalysis.fitAnalysis && (
                            <div className="mc-issue-detail__fit">
                                <span className="mc-issue-detail__rc-label">Fit Analysis</span>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{latestAnalysis.fitAnalysis}</p>
                            </div>
                        )}
                        <div className="mc-issue-detail__analysis-meta">
                            {latestAnalysis.agentModel && <span>Model: {latestAnalysis.agentModel}</span>}
                            {latestAnalysis.tokensUsed ? <span>{latestAnalysis.tokensUsed.toLocaleString()} tokens</span> : null}
                            {latestAnalysis.durationMs ? <span>{(latestAnalysis.durationMs / 1000).toFixed(1)}s</span> : null}
                        </div>
                    </div>
                ) : (
                    <div className="mc-issue-detail__no-analysis">
                        No analysis yet. Click "Analyze with AI" to start.
                    </div>
                )}
            </div>

            {/* Conversation Section */}
            <div className="mc-issue-detail__section">
                <h4 className="mc-issue-detail__section-title">Conversation</h4>
                <div className="mc-issue-detail__conversation">
                    {conversations.length === 0 ? (
                        <div className="mc-issue-detail__no-analysis" style={{ fontSize: 13 }}>
                            No conversation yet. Ask a question or trigger analysis.
                        </div>
                    ) : (
                        conversations.map(msg => (
                            <ConversationMessage key={msg.id} message={msg} />
                        ))
                    )}
                    <div ref={conversationEndRef as any} />
                </div>

                {issue.status !== 'resolved' && issue.status !== 'dismissed' && (
                    <div className="mc-issue-detail__chat-input">
                        <input
                            className="mc-issue-detail__chat-field"
                            placeholder="Ask about this issue..."
                            value={conversationInput}
                            onChange={e => onConversationInputChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConverse(); } }}
                            disabled={conversing}
                        />
                        <button
                            className="mc-issue-detail__chat-send"
                            onClick={onConverse}
                            disabled={conversing || !conversationInput.trim()}
                        >
                            {conversing ? (
                                <span className="mc-issues-spinner" />
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                                </svg>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="mc-issues-summary-pill">
            <span className="mc-issues-summary-pill__value" style={{ color }}>{value}</span>
            <span className="mc-issues-summary-pill__label">{label}</span>
        </div>
    );
}

function SeverityDot({ severity, count }: { severity: 'critical' | 'error' | 'warning'; count: number }) {
    const cfg = SEVERITY_CONFIG[severity];
    return (
        <div className="mc-issues-severity-dot" title={`${cfg.label}: ${count}`}>
            <span className="mc-issues-severity-dot__dot" style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}60` }} />
            <span style={{ color: cfg.color, fontSize: 12, fontWeight: 600 }}>{count}</span>
        </div>
    );
}

function MetaItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="mc-issue-detail__meta-item">
            <span className="mc-issue-detail__meta-label">{label}</span>
            <span className="mc-issue-detail__meta-value">{value}</span>
        </div>
    );
}

function ConversationMessage({ message }: { message: IssueConversation }) {
    const roleConfig = {
        user: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', label: 'You', color: '#60a5fa' },
        agent: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.15)', label: 'AI Agent', color: '#fbbf24' },
        system: { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)', label: 'System', color: 'rgba(255,255,255,0.4)' },
    };
    const cfg = roleConfig[message.role] || roleConfig.system;

    return (
        <div className="mc-conversation-msg" style={{ background: cfg.bg, borderColor: cfg.border }}>
            <div className="mc-conversation-msg__header">
                <span style={{ color: cfg.color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {cfg.label}
                </span>
                <span className="mc-conversation-msg__time">
                    {new Date(message.createdAt).toLocaleTimeString()}
                </span>
            </div>
            <div className="mc-conversation-msg__content" style={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
            </div>
        </div>
    );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;

    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
    return new Date(dateStr).toLocaleDateString();
}
