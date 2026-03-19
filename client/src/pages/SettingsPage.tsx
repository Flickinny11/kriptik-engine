/**
 * SettingsPage — Full account settings page with tab navigation
 *
 * Premium warm-glass design with off-white background, 3D depth,
 * realistic shadows, and hover animations per Design_References.md
 *
 * Accessible via /settings?tab=profile|billing|security|usage|preferences|danger
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon, UserIcon, CoinsIcon, ShieldIcon,
  ActivityIcon, SettingsIcon, AlertTriangleIcon,
} from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';
import { ProfileSettings } from '@/components/account/ProfileSettings';
import { BillingSettings } from '@/components/account/BillingSettings';
import { SecuritySettings } from '@/components/account/SecuritySettings';
import { UsageSettings } from '@/components/account/UsageSettings';
import { PreferencesSettings } from '@/components/account/PreferencesSettings';
import { DangerZoneSettings } from '@/components/account/DangerZoneSettings';

interface TabDef {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'profile', label: 'Profile', shortLabel: 'Profile', icon: <UserIcon size={16} /> },
  { id: 'billing', label: 'Billing & Credits', shortLabel: 'Billing', icon: <CoinsIcon size={16} /> },
  { id: 'security', label: 'Security', shortLabel: 'Security', icon: <ShieldIcon size={16} /> },
  { id: 'usage', label: 'Usage', shortLabel: 'Usage', icon: <ActivityIcon size={16} /> },
  { id: 'preferences', label: 'Preferences', shortLabel: 'Prefs', icon: <SettingsIcon size={16} /> },
  { id: 'danger', label: 'Danger Zone', shortLabel: 'Danger', icon: <AlertTriangleIcon size={16} /> },
];

const TAB_COMPONENTS: Record<string, React.FC> = {
  profile: ProfileSettings,
  billing: BillingSettings,
  security: SecuritySettings,
  usage: UsageSettings,
  preferences: PreferencesSettings,
  danger: DangerZoneSettings,
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated, isLoading } = useUserStore();
  const activeTab = searchParams.get('tab') || 'profile';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/login');
  }, [isLoading, isAuthenticated, navigate]);

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab] || ProfileSettings;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl border-2 border-[#c25a00]/40 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0eb]">
      {/* Subtle warm noise texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] bg-noise mix-blend-multiply" />

      {/* Header */}
      <header className="relative z-10 border-b border-[#e0d8cf] bg-[#faf7f4]/80 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="group relative p-2 rounded-xl text-[#8a7a6b] hover:text-[#1a1a1a] transition-all duration-300"
          style={{
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)',
          }}
        >
          <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/60 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <ArrowLeftIcon size={20} className="relative z-10" />
        </button>
        <h1 className="text-base sm:text-lg font-display font-bold text-[#1a1a1a] tracking-tight">
          Account Settings
        </h1>
      </header>

      {/* Mobile: horizontal scrollable tab bar */}
      <div className="md:hidden relative z-10 border-b border-[#e0d8cf] bg-[#faf7f4]/60 backdrop-blur-md overflow-x-auto scrollbar-hide">
        <div className="flex min-w-max px-2 py-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap rounded-lg mx-0.5 transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-[#1a1a1a] text-white shadow-md'
                  : tab.id === 'danger'
                    ? 'text-[#b0a090] hover:text-[#8a4a4a]'
                    : 'text-[#8a7a6b] hover:text-[#1a1a1a] hover:bg-white/60'
              }`}
              style={activeTab === tab.id ? {
                boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.08)',
              } : undefined}
            >
              {tab.icon}
              <span>{tab.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8 md:flex md:gap-8">
        {/* Desktop: Tab sidebar */}
        <nav className="hidden md:block w-56 flex-shrink-0">
          <div className="sticky top-8 space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const isDanger = tab.id === 'danger';
              return (
                <button
                  key={tab.id}
                  onClick={() => setTab(tab.id)}
                  className={`group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-300 ${
                    isActive
                      ? 'bg-[#1a1a1a] text-white'
                      : isDanger
                        ? 'text-[#b0a090] hover:text-[#c44a4a] hover:bg-red-50/60'
                        : 'text-[#6b5e50] hover:text-[#1a1a1a] hover:bg-white/70'
                  }`}
                  style={isActive ? {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
                  } : {
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <span className={`transition-colors duration-300 ${isActive ? 'text-[#c8ff64]' : ''}`}>
                    {tab.icon}
                  </span>
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Tab content */}
        <motion.main
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="flex-1 min-w-0"
        >
          <ActiveComponent />
        </motion.main>
      </div>
    </div>
  );
}
