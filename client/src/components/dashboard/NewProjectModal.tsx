/**
 * NewProjectModal — Create New Project
 *
 * Creates project client-side first (instant), then navigates to Builder.
 * Server persistence happens when the build starts.
 * No auth dependency for the initial create action.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '../../store/useProjectStore';
import { toast } from 'sonner';

export default function NewProjectModal() {
    const navigate = useNavigate();
    const { addProject } = useProjectStore();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [engineType, setEngineType] = useState<'cortex' | 'prism'>('cortex');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Load fonts via link tag (safe, no module-level side effects)
    useEffect(() => {
        if (document.head.querySelector('[data-fontshare-modal]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700&f[]=cabinet-grotesk@400,500,700&display=swap';
        link.setAttribute('data-fontshare-modal', '');
        document.head.appendChild(link);
    }, []);

    const handleCreate = useCallback(async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Project name is required');
            return;
        }

        setError('');
        setIsLoading(true);

        // Generate a client-side ID immediately
        const projectId = crypto.randomUUID();

        // Add to local store FIRST (instant, no server dependency)
        addProject({
            id: projectId,
            name: trimmedName,
            description: description.trim() || '',
            createdAt: new Date(),
            lastEdited: 'Just now',
            framework: 'react',
            status: 'development' as const,
        });

        // Persist to localStorage as a pending project so it survives page refresh
        try {
            const pending = JSON.parse(localStorage.getItem('kriptik_pending_projects') || '[]');
            pending.push({
                id: projectId,
                name: trimmedName,
                description: description.trim() || '',
                framework: 'react',
                createdAt: new Date().toISOString(),
            });
            localStorage.setItem('kriptik_pending_projects', JSON.stringify(pending));
        } catch { /* localStorage unavailable */ }

        // Try server-side persistence in background (non-blocking)
        fetch('/api/projects', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: projectId,
                name: trimmedName,
                description: description.trim() || undefined,
                framework: 'react',
                engineType,
            }),
        }).then(async (res) => {
            if (res.ok) {
                console.log('[NewProjectModal] Server persisted project');
                // Clear from pending since it's now on the server
                try {
                    const current = JSON.parse(localStorage.getItem('kriptik_pending_projects') || '[]');
                    localStorage.setItem('kriptik_pending_projects',
                        JSON.stringify(current.filter((p: { id: string }) => p.id !== projectId))
                    );
                } catch { /* ignore */ }
            } else {
                console.warn('[NewProjectModal] Server persist failed:', res.status, '— project exists locally');
            }
        }).catch((err) => {
            console.warn('[NewProjectModal] Server persist failed:', err, '— project exists locally');
        });

        // Navigate immediately (don't wait for server)
        toast.success('Project created!');
        setOpen(false);
        setName('');
        setDescription('');
        setEngineType('cortex');
        setIsLoading(false);
        navigate(`/builder/${projectId}`);
    }, [name, description, addProject, navigate]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && name.trim()) {
            e.preventDefault();
            handleCreate();
        }
    }, [handleCreate, name]);

    const handleClose = useCallback(() => {
        if (isLoading) return;
        setOpen(false);
        setName('');
        setDescription('');
        setEngineType('cortex');
        setError('');
    }, [isLoading]);

    return (
        <>
            {/* Trigger Button */}
            <button
                onClick={() => setOpen(true)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
                    backdropFilter: 'blur(12px)',
                    color: '#1a1a1a',
                    fontFamily: '"Clash Display", "Satoshi", sans-serif',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 1px rgba(0,0,0,0.04)',
                }}
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>New Project</span>
            </button>

            {/* Modal */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={handleClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0, 0, 0, 0.45)',
                            backdropFilter: 'blur(6px)',
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 12 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: 'min(480px, 92vw)',
                                borderRadius: '20px',
                                overflow: 'hidden',
                                background: 'linear-gradient(160deg, rgba(255,255,255,0.85) 0%, rgba(248,244,240,0.9) 100%)',
                                backdropFilter: 'blur(40px) saturate(160%)',
                                border: '1px solid rgba(255,255,255,0.5)',
                                boxShadow: `
                                    0 24px 80px rgba(0,0,0,0.15),
                                    0 8px 24px rgba(0,0,0,0.08),
                                    inset 0 1px 0 rgba(255,255,255,0.9),
                                    inset 0 -1px 0 rgba(0,0,0,0.04)
                                `,
                            }}
                        >
                            {/* Top edge highlight */}
                            <div style={{
                                height: '2px',
                                background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.9) 30%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.9) 70%, transparent 95%)',
                            }} />

                            <div style={{ padding: '36px 40px 32px' }}>
                                {/* Header */}
                                <h2 style={{
                                    fontFamily: '"Clash Display", sans-serif',
                                    fontSize: '26px',
                                    fontWeight: 600,
                                    color: '#1a1a1a',
                                    margin: 0,
                                    letterSpacing: '-0.02em',
                                }}>
                                    Create New Project
                                </h2>
                                <p style={{
                                    fontFamily: '"Satoshi", sans-serif',
                                    fontSize: '14px',
                                    color: '#888',
                                    margin: '4px 0 28px',
                                }}>
                                    Name it, describe it, build it.
                                </p>

                                {/* Name input */}
                                <label style={{
                                    fontFamily: '"Cabinet Grotesk", "Satoshi", sans-serif',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#666',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    display: 'block',
                                    marginBottom: '8px',
                                }}>
                                    Project Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => { setName(e.target.value); setError(''); }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="e.g. ShopFlow, MoodBoard, NightOwl"
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '13px 16px',
                                        borderRadius: '12px',
                                        border: error ? '1.5px solid #ef4444' : '1px solid rgba(0,0,0,0.08)',
                                        background: 'rgba(255,255,255,0.7)',
                                        fontFamily: '"Satoshi", sans-serif',
                                        fontSize: '15px',
                                        fontWeight: 500,
                                        color: '#1a1a1a',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        transition: 'border-color 0.15s',
                                    }}
                                />
                                {error && (
                                    <p style={{ color: '#ef4444', fontSize: '12px', fontFamily: '"Satoshi", sans-serif', marginTop: '6px' }}>
                                        {error}
                                    </p>
                                )}

                                {/* Description */}
                                <label style={{
                                    fontFamily: '"Cabinet Grotesk", "Satoshi", sans-serif',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#666',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    display: 'block',
                                    marginTop: '20px',
                                    marginBottom: '8px',
                                }}>
                                    Description <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="What are you building?"
                                    rows={3}
                                    style={{
                                        width: '100%',
                                        padding: '13px 16px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                        background: 'rgba(255,255,255,0.7)',
                                        fontFamily: '"Satoshi", sans-serif',
                                        fontSize: '15px',
                                        fontWeight: 500,
                                        color: '#1a1a1a',
                                        outline: 'none',
                                        resize: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />

                                {/* Engine Type */}
                                <label style={{
                                    fontFamily: '"Cabinet Grotesk", "Satoshi", sans-serif',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#666',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    display: 'block',
                                    marginTop: '20px',
                                    marginBottom: '8px',
                                }}>
                                    Engine
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {([
                                        { value: 'cortex' as const, label: 'Cortex', desc: 'Multi-agent AI' },
                                        { value: 'prism' as const, label: 'Prism', desc: 'Diffusion pipeline' },
                                    ]).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setEngineType(opt.value)}
                                            style={{
                                                flex: 1,
                                                padding: '10px 14px',
                                                borderRadius: '10px',
                                                border: engineType === opt.value
                                                    ? '1.5px solid rgba(245,158,11,0.4)'
                                                    : '1px solid rgba(0,0,0,0.08)',
                                                background: engineType === opt.value
                                                    ? 'linear-gradient(145deg, rgba(255,240,210,0.6) 0%, rgba(255,225,175,0.4) 100%)'
                                                    : 'rgba(255,255,255,0.5)',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <div style={{
                                                fontFamily: '"Clash Display", sans-serif',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                color: engineType === opt.value ? '#92400e' : '#555',
                                            }}>
                                                {opt.label}
                                            </div>
                                            <div style={{
                                                fontFamily: '"Satoshi", sans-serif',
                                                fontSize: '11px',
                                                color: engineType === opt.value ? '#b45309' : '#999',
                                                marginTop: '2px',
                                            }}>
                                                {opt.desc}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Buttons */}
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        disabled={isLoading}
                                        style={{
                                            padding: '11px 22px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            background: 'rgba(255,255,255,0.5)',
                                            fontFamily: '"Satoshi", sans-serif',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: '#777',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreate}
                                        disabled={isLoading || !name.trim()}
                                        style={{
                                            padding: '11px 28px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(245,158,11,0.3)',
                                            background: (!name.trim() || isLoading)
                                                ? 'linear-gradient(145deg, rgba(220,215,210,0.8) 0%, rgba(210,205,200,0.75) 100%)'
                                                : 'linear-gradient(145deg, rgba(255,240,210,0.95) 0%, rgba(255,225,175,0.9) 100%)',
                                            fontFamily: '"Clash Display", sans-serif',
                                            fontSize: '15px',
                                            fontWeight: 600,
                                            color: (!name.trim() || isLoading) ? '#aaa' : '#92400e',
                                            cursor: (!name.trim() || isLoading) ? 'not-allowed' : 'pointer',
                                            boxShadow: name.trim() && !isLoading
                                                ? '0 4px 16px rgba(245,158,11,0.18), inset 0 1px 0 rgba(255,255,255,0.7)'
                                                : 'none',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {isLoading ? 'Creating...' : 'Create Project'}
                                    </button>
                                </div>
                            </div>

                            {/* Bottom edge depth */}
                            <div style={{
                                height: '3px',
                                background: 'linear-gradient(90deg, transparent 5%, rgba(0,0,0,0.04) 30%, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0.04) 70%, transparent 95%)',
                            }} />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
