/**
 * Dependencies Page — Main dependency management view.
 *
 * Serves as the landing page for browsing, connecting, and managing
 * all third-party service dependencies. Full implementation in Task 6.
 * This file provides the routable page shell with layout.
 */

import { useNavigate } from 'react-router-dom';
import { HoverSidebar } from '@/components/navigation/HoverSidebar';
import { AccountSlideOut } from '@/components/account/AccountSlideOut';
import { KriptikLogo } from '@/components/ui/KriptikLogo';
import { GlitchText } from '@/components/ui/GlitchText';
import { HandDrawnArrow } from '@/components/ui/HandDrawnArrow';
import { ArrowLeftIcon } from '@/components/ui/icons';
import '@/styles/realistic-glass.css';

export default function DependenciesPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #e8e4df 0%, #d8d4cf 50%, #ccc8c3 100%)' }}>
      <HoverSidebar />
      <AccountSlideOut />

      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.45) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.9)',
        }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(200,200,205,0.4) 0%, rgba(180,180,185,0.3) 100%)',
            transform: 'translateY(100%)',
          }}
        />
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HandDrawnArrow className="mr-2" />
            <div
              className="flex items-center gap-4 cursor-pointer group"
              onClick={() => navigate('/dashboard')}
            >
              <KriptikLogo size="sm" animated />
              <GlitchText
                text="KripTik AI"
                className="text-2xl group-hover:opacity-90 transition-opacity"
              />
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.4) 100%)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 4px 0 rgba(200, 195, 190, 0.5), 0 8px 24px rgba(0, 0, 0, 0.06), inset 0 1px 2px rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.5)',
              color: '#1a1a1a',
            }}
          >
            <ArrowLeftIcon size={16} />
            Dashboard
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8 md:py-16">
        <div className="max-w-6xl mx-auto">
          <h1
            className="text-3xl md:text-4xl font-bold mb-2"
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Display, sans-serif',
              color: '#1a1a1a',
            }}
          >
            Dependencies
          </h1>
          <p className="text-base mb-8" style={{ color: '#404040' }}>
            Connect and manage all external services your apps depend on
          </p>

          {/* Full catalog and management UI will be built in Task 6 */}
          <div
            className="rounded-2xl p-12 text-center"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.3) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
          >
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(194,90,0,0.15) 0%, rgba(194,90,0,0.08) 100%)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 4px 12px rgba(194,90,0,0.1)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c25a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4" />
                <path d="m16.2 7.8 2.9-2.9" />
                <path d="M18 12h4" />
                <path d="m16.2 16.2 2.9 2.9" />
                <path d="M12 18v4" />
                <path d="m4.9 19.1 2.9-2.9" />
                <path d="M2 12h4" />
                <path d="m4.9 4.9 2.9 2.9" />
              </svg>
            </div>
            <p className="text-lg font-medium" style={{ color: '#1a1a1a' }}>
              Dependency catalog loading
            </p>
            <p className="text-sm mt-1" style={{ color: '#666' }}>
              Browse and connect 38+ services with one click
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
