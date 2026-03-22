/**
 * Learning Engine Maturity Dashboard Tab
 *
 * Self-contained tab for the Manager Console showing:
 * - Overall maturity gauge
 * - Data collection grid (10 categories)
 * - Training readiness checks
 * - Train replacement controls
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { authenticatedFetch, API_URL } from '@/lib/api-config';

interface MaturityCategory {
    name: string;
    count: number;
    target: number;
    table: string;
}

interface MaturityData {
    overallMaturity: number;
    totalDataPoints: number;
    categories: MaturityCategory[];
    evolutionCycles: number;
}

interface ReadinessCheck {
    name: string;
    ready: boolean;
    count: number | null;
    minimum: number | null;
}

interface TrainingRun {
    id: string;
    status: string;
    modelName: string;
    createdAt: string;
}

interface ReadinessData {
    overallReady: boolean;
    checks: ReadinessCheck[];
    recentTrainingRuns: TrainingRun[];
}

export function LearningTab() {
    const [maturity, setMaturity] = useState<MaturityData | null>(null);
    const [readiness, setReadiness] = useState<ReadinessData | null>(null);
    const [loading, setLoading] = useState(true);
    const [training, setTraining] = useState(false);
    const [trainResult, setTrainResult] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState('code_specialist');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [matRes, readRes] = await Promise.all([
                authenticatedFetch(`${API_URL}/api/manager/learning-maturity`),
                authenticatedFetch(`${API_URL}/api/manager/training-readiness`),
            ]);
            if (matRes.ok) setMaturity(await matRes.json());
            if (readRes.ok) setReadiness(await readRes.json());
        } catch (e) {
            console.error('[LearningTab] Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleTrain = useCallback(async () => {
        try {
            setTraining(true);
            setTrainResult(null);
            const res = await authenticatedFetch(`${API_URL}/api/manager/train-replacement`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelType: selectedModel }),
            });
            const data = await res.json();
            if (res.ok) {
                setTrainResult(`Training job submitted: ${data.jobId}`);
                fetchData();
            } else {
                setTrainResult(`Error: ${data.error}`);
            }
        } catch (e) {
            setTrainResult('Failed to submit training job');
        } finally {
            setTraining(false);
        }
    }, [selectedModel, fetchData]);

    if (loading && !maturity) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>Loading learning data...</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Section 1: Overall Maturity */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2rem',
                }}
            >
                {/* Circular gauge */}
                <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                    <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                        <circle
                            cx="60" cy="60" r="50"
                            fill="none"
                            stroke={maturity && maturity.overallMaturity >= 50 ? '#10b981' : '#f59e0b'}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${(maturity?.overallMaturity ?? 0) * 3.14} 314`}
                            transform="rotate(-90 60 60)"
                            style={{ transition: 'stroke-dasharray 0.6s ease' }}
                        />
                    </svg>
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
                            {maturity?.overallMaturity ?? 0}%
                        </span>
                        <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Maturity
                        </span>
                    </div>
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#fff' }}>
                        Learning Engine Maturity
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)' }}>
                        {maturity?.totalDataPoints?.toLocaleString() ?? 0} total data points collected across {maturity?.categories?.length ?? 0} categories
                    </p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
                        {maturity?.evolutionCycles ?? 0} evolution cycles completed
                    </p>
                </div>
            </motion.div>

            {/* Section 2: Data Collection Grid */}
            <div>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Data Collection Progress
                </h4>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '0.75rem',
                }}>
                    {maturity?.categories?.map((cat, i) => {
                        const pct = cat.target > 0 ? Math.min(100, Math.round((cat.count / cat.target) * 100)) : 0;
                        return (
                            <motion.div
                                key={cat.table}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    padding: '0.875rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                                        {cat.name}
                                    </span>
                                    <span style={{ fontSize: '0.6875rem', color: pct >= 100 ? '#10b981' : 'rgba(255,255,255,0.4)' }}>
                                        {pct}%
                                    </span>
                                </div>
                                <div style={{
                                    height: 4, borderRadius: 2,
                                    background: 'rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: 2,
                                        width: `${pct}%`,
                                        background: pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444',
                                        transition: 'width 0.4s ease',
                                    }} />
                                </div>
                                <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.35)' }}>
                                    {cat.count.toLocaleString()} / {cat.target.toLocaleString()}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Section 3: Training Readiness */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: '1.5rem',
                }}
            >
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Training Readiness
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {readiness?.checks?.map((check) => (
                        <div key={check.name} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.5rem 0',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: check.ready ? '#10b981' : '#ef4444',
                                flexShrink: 0,
                            }} />
                            <span style={{ flex: 1, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.7)' }}>
                                {check.name}
                            </span>
                            {check.count !== null && (
                                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                                    {check.count} / {check.minimum}
                                </span>
                            )}
                            <span style={{ fontSize: '0.6875rem', color: check.ready ? '#10b981' : '#ef4444' }}>
                                {check.ready ? 'Ready' : 'Not Ready'}
                            </span>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Section 4: Recent Training Runs */}
            {readiness?.recentTrainingRuns && readiness.recentTrainingRuns.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        padding: '1.5rem',
                    }}
                >
                    <h4 style={{ margin: '0 0 1rem', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Recent Training Runs
                    </h4>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Model</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Started</th>
                                </tr>
                            </thead>
                            <tbody>
                                {readiness.recentTrainingRuns.map((run) => (
                                    <tr key={run.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>{run.modelName}</td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                                                fontSize: '0.6875rem', fontWeight: 500,
                                                background: run.status === 'completed' ? 'rgba(16,185,129,0.15)' : run.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                color: run.status === 'completed' ? '#10b981' : run.status === 'failed' ? '#ef4444' : '#f59e0b',
                                            }}>
                                                {run.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem', color: 'rgba(255,255,255,0.4)' }}>
                                            {new Date(run.createdAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}

            {/* Section 5: Train Replacement Controls */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: '1.5rem',
                }}
            >
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Train Replacement Model
                </h4>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '6px',
                            padding: '0.5rem 0.75rem',
                            color: '#fff',
                            fontSize: '0.8125rem',
                            outline: 'none',
                        }}
                    >
                        <option value="code_specialist">Code Specialist</option>
                        <option value="architecture_specialist">Architecture Specialist</option>
                        <option value="reasoning_specialist">Reasoning Specialist</option>
                        <option value="design_specialist">Design Specialist</option>
                    </select>
                    <button
                        onClick={handleTrain}
                        disabled={training || !readiness?.overallReady}
                        style={{
                            background: readiness?.overallReady ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                            border: '1px solid',
                            borderColor: readiness?.overallReady ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)',
                            borderRadius: '6px',
                            padding: '0.5rem 1rem',
                            color: readiness?.overallReady ? '#10b981' : 'rgba(255,255,255,0.3)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            cursor: readiness?.overallReady ? 'pointer' : 'not-allowed',
                            opacity: training ? 0.6 : 1,
                        }}
                    >
                        {training ? 'Submitting...' : 'Start Training'}
                    </button>
                    {!readiness?.overallReady && (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
                            Not enough data to train. Collect more thinking traces and preference pairs.
                        </span>
                    )}
                </div>
                {trainResult && (
                    <div style={{
                        marginTop: '0.75rem', padding: '0.5rem 0.75rem',
                        background: trainResult.startsWith('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        color: trainResult.startsWith('Error') ? '#ef4444' : '#10b981',
                    }}>
                        {trainResult}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
