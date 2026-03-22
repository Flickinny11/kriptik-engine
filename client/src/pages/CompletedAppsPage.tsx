/**
 * CompletedAppsPage - Gallery of user's completed app builds.
 *
 * Features:
 * - 3D device mockup cards showing each completed app
 * - Click to open in-browser simulator preview
 * - Download/install to device options
 * - Build new app for any Apple platform (iPhone, iPad, Watch, TV)
 * - Push to connected devices via Kriptik Kompanion
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusIcons } from '../components/ui/icons';
// import { useNavigate } from 'react-router-dom';

interface CompletedApp {
    id: string;
    projectId: string;
    projectName: string;
    appName: string;
    bundleId: string;
    version: string;
    platform: string;
    status: string;
    previewUrl?: string;
    buildSize?: string;
    createdAt: string;
    completedAt?: string;
}

/* const platformInfo: Record<string, { name: string; icon: string }> = {
    ios: { name: 'iPhone', icon: 'smartphone' },
    ipados: { name: 'iPad', icon: 'tablet' },
    watchos: { name: 'Apple Watch', icon: 'watch' },
    tvos: { name: 'Apple TV', icon: 'tv' },
}; */

export default function CompletedAppsPage() {
    const [apps, setApps] = useState<CompletedApp[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedApp, setSelectedApp] = useState<CompletedApp | null>(null);
    const [, setShowBuildModal] = useState(false);

    const loadApps = useCallback(async () => {
        try {
            const res = await fetch('/api/mobile/apps', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setApps(data.apps || []);
            }
        } catch (err) {
            console.error('[CompletedApps] Load error:', err);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadApps(); }, [loadApps]);

    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
            {/* Header */}
            <div className="max-w-6xl mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-stone-900" style={{ fontFamily: 'Syne, sans-serif' }}>
                            Completed Apps
                        </h1>
                        <p className="text-sm text-stone-500 mt-1">Your built applications ready for testing and deployment</p>
                    </div>
                    <button
                        onClick={() => setShowBuildModal(true)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-stone-900 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                            background: 'linear-gradient(145deg, rgba(255,200,170,0.7) 0%, rgba(255,180,150,0.55) 100%)',
                            boxShadow: '0 8px 24px rgba(255,140,100,0.2), 0 0 0 1px rgba(255,200,170,0.6)',
                        }}
                    >
                        <StatusIcons.PlusIcon size={18} />
                        Build New App
                    </button>
                </div>

                {/* Apps Grid */}
                {isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {[0,1,2,3].map(i => (
                            <div key={i} className="h-64 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.3)' }} />
                        ))}
                    </div>
                ) : apps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div
                            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                            style={{ background: 'rgba(255,255,255,0.5)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
                        >
                            <StatusIcons.SmartphoneIcon size={36} className="text-stone-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-stone-700 mb-2">No completed apps yet</h2>
                        <p className="text-sm text-stone-500 text-center max-w-md">
                            Build your first app and it will appear here. You can preview it in the simulator,
                            then download and install it to any of your Apple devices.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {apps.map((app, idx) => (
                            <motion.div
                                key={app.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05, duration: 0.3 }}
                            >
                                <AppCard3D app={app} onClick={() => setSelectedApp(app)} />
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Simulator Modal */}
            <AnimatePresence>
                {selectedApp && (
                    <AppSimulatorModal app={selectedApp} onClose={() => setSelectedApp(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}

// 3D Device Card
function AppCard3D({ app, onClick }: { app: CompletedApp; onClick: () => void }) {
    const [isHovered, setIsHovered] = useState(false);

    const statusColor = app.status === 'ready' ? '#10b981' : app.status === 'building' ? '#d97706' : '#ef4444';

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="w-full text-left transition-transform"
            style={{
                transform: isHovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
                transition: 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
            }}
        >
            <div
                className="rounded-2xl overflow-hidden"
                style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.45) 100%)',
                    backdropFilter: 'blur(40px)',
                    boxShadow: isHovered
                        ? `0 20px 60px rgba(0,0,0,0.12), 0 0 20px ${statusColor}20, 0 0 0 1px rgba(255,255,255,0.5)`
                        : '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.4)',
                }}
            >
                {/* Device frame */}
                <div className="p-4">
                    <div
                        className="rounded-xl h-40 flex items-center justify-center relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(145deg, #1e1e24 0%, #12121a 100%)',
                            boxShadow: `
                                0 0 40px ${statusColor}12,
                                0 12px 24px rgba(0,0,0,0.3),
                                inset 0 1px 0 rgba(255,255,255,0.08),
                                4px 0 0 #0a0a0c,
                                4px 4px 0 #050507,
                                0 4px 0 #0a0a0c
                            `,
                        }}
                    >
                        {app.status === 'building' ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-6 h-6 rounded-full border-2 border-t-amber-500 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: '#d97706' }} />
                                <span className="text-xs text-amber-500 font-mono">Building...</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <StatusIcons.SmartphoneIcon size={32} className="text-amber-400" />
                                <span className="text-[10px] text-zinc-500 font-mono">Tap to preview</span>
                            </div>
                        )}

                        {/* Status indicator */}
                        <div
                            className="absolute top-2 right-2 w-2 h-2 rounded-full"
                            style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}60` }}
                        />
                    </div>
                </div>

                {/* App info */}
                <div className="px-4 pb-4">
                    <h3 className="text-sm font-semibold text-stone-900 truncate">{app.appName}</h3>
                    <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] font-mono text-stone-500 uppercase">{app.platform}</span>
                        <span className="text-[10px] text-stone-400">--</span>
                        <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                            style={{ background: `${statusColor}15`, color: statusColor }}
                        >
                            {app.status}
                        </span>
                    </div>
                </div>
            </div>
        </button>
    );
}

// Simulator Modal
function AppSimulatorModal({ app, onClose }: { app: CompletedApp; onClose: () => void }) {
    const [isInstalling, setIsInstalling] = useState(false);

    const handleInstall = async () => {
        setIsInstalling(true);
        try {
            const res = await fetch(`/api/mobile/apps/${app.id}/install-url`, { credentials: 'include' });
            const data = await res.json();
            if (data.installUrl) {
                window.location.href = data.installUrl;
            }
        } catch (err) {
            console.error('[Install]', err);
        }
        setIsInstalling(false);
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[400] bg-black/50"
                style={{ backdropFilter: 'blur(8px)' }}
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="fixed inset-0 z-[401] flex items-center justify-center pointer-events-none"
            >
                <div className="pointer-events-auto w-[460px] max-h-[85vh] rounded-3xl overflow-hidden flex flex-col"
                    style={{
                        background: 'linear-gradient(160deg, rgba(20,20,25,0.97) 0%, rgba(12,12,16,0.99) 100%)',
                        boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5">
                        <div>
                            <h2 className="text-lg font-semibold text-white">{app.appName}</h2>
                            <p className="text-xs text-zinc-500">{app.platform.toUpperCase()} -- {app.version}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
                            <StatusIcons.XIcon size={18} className="text-zinc-400" />
                        </button>
                    </div>

                    {/* Simulator */}
                    <div className="flex-1 px-8 pb-4">
                        <div
                            className="rounded-2xl h-[400px] overflow-hidden"
                            style={{
                                background: 'linear-gradient(145deg, #1a1a1f 0%, #0d0d10 100%)',
                                boxShadow: '0 0 60px rgba(249,115,22,0.1), 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                            }}
                        >
                            {app.previewUrl ? (
                                <iframe
                                    src={app.previewUrl}
                                    className="w-full h-full rounded-xl"
                                    style={{ border: 'none' }}
                                    title={`${app.appName} Preview`}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-sm text-zinc-500">Preview loading...</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="p-5 space-y-3">
                        {app.status === 'ready' && (
                            <>
                                <button
                                    onClick={handleInstall}
                                    disabled={isInstalling}
                                    className="w-full py-3 rounded-xl text-sm font-semibold text-stone-900 transition-all"
                                    style={{
                                        background: 'linear-gradient(145deg, #fbbf24, #d97706)',
                                        boxShadow: '0 4px 16px rgba(217,119,6,0.3)',
                                    }}
                                >
                                    {isInstalling ? 'Installing...' : 'Download to My Device'}
                                </button>
                                <button
                                    className="w-full py-3 rounded-xl text-sm font-medium text-zinc-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                >
                                    Send to Another Device
                                </button>
                            </>
                        )}
                        {app.status === 'building' && (
                            <div className="flex items-center justify-center gap-2 py-3">
                                <div className="w-4 h-4 rounded-full border-2 border-t-amber-500 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: '#d97706' }} />
                                <span className="text-sm text-amber-400">Building...</span>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </>
    );
}
