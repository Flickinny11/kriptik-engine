/**
 * Open App Landing Page — /open/:appSlug
 *
 * Universal Link fallback for when KripTik Player (Kompanion) is not installed.
 * If the user has the Kompanion app, iOS intercepts this URL and opens the Player.
 * If not, this page renders with an App Store download prompt + web fallback.
 */

import { useParams } from 'react-router-dom';

const APP_STORE_URL = import.meta.env.VITE_KOMPANION_APP_STORE_URL
  || 'https://apps.apple.com/app/kriptik-kompanion/id6758965689';

export default function OpenAppPage() {
    const { appSlug } = useParams<{ appSlug: string }>();

    const handleOpenInPlayer = () => {
        // Try the custom scheme deep link
        window.location.href = `kriptik://app/${appSlug}`;

        // If the app doesn't open after 1.5s, the user likely doesn't have it
        setTimeout(() => {
            // They're still here — redirect to App Store
            window.location.href = APP_STORE_URL;
        }, 1500);
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center px-4"
            style={{
                background: 'linear-gradient(180deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)',
            }}
        >
            <div
                className="max-w-md w-full rounded-2xl p-8 text-center"
                style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                {/* App icon */}
                <div
                    className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        boxShadow: '0 8px 32px rgba(245,158,11,0.3)',
                    }}
                >
                    <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">
                    Open in KripTik Player
                </h1>

                <p className="text-zinc-400 mb-6">
                    <span className="text-amber-400 font-medium">{appSlug}</span> is ready to
                    run in the KripTik Kompanion app.
                </p>

                {/* Primary CTA */}
                <button
                    onClick={handleOpenInPlayer}
                    className="w-full py-3.5 px-6 rounded-xl font-semibold text-white mb-3 transition-all hover:brightness-110"
                    style={{
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
                    }}
                >
                    Open in Player
                </button>

                {/* Secondary: App Store */}
                <a
                    href={APP_STORE_URL}
                    className="block w-full py-3 px-6 rounded-xl font-medium text-zinc-300 mb-4 transition-colors hover:bg-white/5"
                    style={{
                        border: '1px solid rgba(255,255,255,0.1)',
                    }}
                >
                    Download Kompanion App
                </a>

                <p className="text-xs text-zinc-500">
                    Don't have the app? Download it free from the App Store to run apps built with KripTik AI.
                </p>
            </div>

            {/* Branding */}
            <p className="mt-8 text-xs text-zinc-600">
                Powered by <span className="text-zinc-500">KripTik</span><span className="text-zinc-600">AI</span>
            </p>
        </div>
    );
}
