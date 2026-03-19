/**
 * SettingsPage — Full account settings page with tab navigation
 *
 * Accessible via /settings?tab=profile|billing|security|usage|preferences|danger
 * Uses Radix-style tab navigation with URL query params for deep linking.
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
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'profile', label: 'Profile', icon: <UserIcon size={16} /> },
  { id: 'billing', label: 'Billing & Credits', icon: <CoinsIcon size={16} /> },
  { id: 'security', label: 'Security', icon: <ShieldIcon size={16} /> },
  { id: 'usage', label: 'Usage', icon: <ActivityIcon size={16} /> },
  { id: 'preferences', label: 'Preferences', icon: <SettingsIcon size={16} /> },
  { id: 'danger', label: 'Danger Zone', icon: <AlertTriangleIcon size={16} /> },
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
      <div className="min-h-screen bg-kriptik-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-kriptik-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kriptik-black">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-kriptik-silver hover:text-kriptik-white transition-colors"
        >
          <ArrowLeftIcon size={20} />
        </button>
        <h1 className="text-lg font-display font-bold text-kriptik-white">
          Account Settings
        </h1>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
        {/* Tab sidebar */}
        <nav className="w-56 flex-shrink-0">
          <div className="sticky top-8 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-kriptik-lime/10 text-kriptik-lime border border-kriptik-lime/20'
                    : tab.id === 'danger'
                      ? 'text-kriptik-slate hover:text-red-400 hover:bg-red-500/5'
                      : 'text-kriptik-silver hover:text-kriptik-white hover:bg-white/5'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-kriptik-lime' : ''}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Tab content */}
        <motion.main
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0"
        >
          <ActiveComponent />
        </motion.main>
      </div>
    </div>
  );
}
