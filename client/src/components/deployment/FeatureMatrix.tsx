/**
 * FeatureMatrix — Tier comparison table for mobile deployment options.
 *
 * Shows a visual comparison of PWA vs KripTik Player vs Native App Store
 * features, helping users choose the right deployment tier.
 */

interface FeatureMatrixProps {
    onSelectTier?: (tier: 'pwa' | 'player' | 'native') => void;
    selectedTier?: 'pwa' | 'player' | 'native';
}

const CHECK = '\u2713';
const DASH = '\u2014';

const FEATURES = [
    { name: 'Install Time', pwa: 'Instant', player: '< 5 sec', native: '5–10 min' },
    { name: 'App Store Review', pwa: 'None', player: 'None', native: 'Required' },
    { name: 'Offline Support', pwa: CHECK, player: CHECK, native: CHECK },
    { name: 'Push Notifications', pwa: 'Limited', player: CHECK, native: CHECK },
    { name: 'Camera Access', pwa: 'Browser', player: CHECK, native: CHECK },
    { name: 'Haptic Feedback', pwa: DASH, player: CHECK, native: CHECK },
    { name: 'Home Screen Icon', pwa: CHECK, player: CHECK, native: CHECK },
    { name: 'OTA Updates', pwa: CHECK, player: CHECK, native: 'Via Capgo' },
    { name: 'Native APIs', pwa: DASH, player: 'Bridge', native: 'Full' },
    { name: 'App Store Listing', pwa: DASH, player: DASH, native: CHECK },
    { name: 'TestFlight/Beta', pwa: DASH, player: DASH, native: CHECK },
    { name: 'Apple Credentials', pwa: DASH, player: DASH, native: 'Required' },
    { name: 'Signing/Certs', pwa: DASH, player: DASH, native: 'Auto' },
] as const;

const TIER_META = {
    pwa: { label: 'PWA', color: '#3b82f6', tagline: 'Quick Install' },
    player: { label: 'Player', color: '#f59e0b', tagline: 'KripTik Player' },
    native: { label: 'Native', color: '#14b8a6', tagline: 'App Store' },
} as const;

export function FeatureMatrix({ onSelectTier, selectedTier }: FeatureMatrixProps) {
    return (
        <div
            className="rounded-xl overflow-hidden"
            style={{
                background: 'rgba(10,10,15,0.95)',
                border: '1px solid rgba(255,255,255,0.06)',
            }}
        >
            {/* Header row */}
            <div className="grid grid-cols-4 gap-0">
                <div className="p-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Feature
                </div>
                {(['pwa', 'player', 'native'] as const).map((tier) => (
                    <button
                        key={tier}
                        onClick={() => onSelectTier?.(tier)}
                        className="p-3 text-center transition-colors"
                        style={{
                            background: selectedTier === tier
                                ? `${TIER_META[tier].color}15`
                                : 'transparent',
                            borderBottom: selectedTier === tier
                                ? `2px solid ${TIER_META[tier].color}`
                                : '2px solid transparent',
                        }}
                    >
                        <span
                            className="text-xs font-bold block"
                            style={{ color: TIER_META[tier].color }}
                        >
                            {TIER_META[tier].label}
                        </span>
                        <span className="text-[10px] text-zinc-500 block">
                            {TIER_META[tier].tagline}
                        </span>
                    </button>
                ))}
            </div>

            {/* Feature rows */}
            {FEATURES.map((feature, i) => (
                <div
                    key={feature.name}
                    className="grid grid-cols-4 gap-0"
                    style={{
                        background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                    }}
                >
                    <div className="p-2.5 text-xs text-zinc-400">
                        {feature.name}
                    </div>
                    {(['pwa', 'player', 'native'] as const).map((tier) => {
                        const val = feature[tier];
                        const isCheck = val === CHECK;
                        const isDash = val === DASH;
                        return (
                            <div key={tier} className="p-2.5 text-center text-xs">
                                {isCheck ? (
                                    <span style={{ color: '#22c55e' }}>{CHECK}</span>
                                ) : isDash ? (
                                    <span className="text-zinc-600">{DASH}</span>
                                ) : (
                                    <span className="text-zinc-300">{val}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
