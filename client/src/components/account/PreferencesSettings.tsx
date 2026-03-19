/**
 * PreferencesSettings — Theme, notification, and build preferences.
 * Premium warm-glass design.
 */

import { useState } from 'react';
import { MoonIcon, BellIcon, SettingsIcon } from '@/components/ui/icons';
import { motion } from 'framer-motion';

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(250,247,244,0.75) 100%)',
  boxShadow: `
    0 4px 16px rgba(0,0,0,0.06),
    0 1px 4px rgba(0,0,0,0.04),
    inset 0 1px 0 rgba(255,255,255,0.8),
    inset 0 -1px 0 rgba(0,0,0,0.02)
  `,
  backdropFilter: 'blur(12px) saturate(150%)',
};

export function PreferencesSettings() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Preferences</h2>
        <p className="text-sm text-[#8a7a6b]">Customize your KripTik experience</p>
      </div>

      {/* Theme */}
      <div className="p-5 rounded-2xl border border-[#e8e0d8]/60" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f0eb]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <MoonIcon size={16} className="text-[#8a7a6b]" />
          </div>
          <h3 className="text-sm font-semibold text-[#4a3f35]">Theme</h3>
        </div>
        <div className="flex gap-3">
          <motion.button
            onClick={() => setTheme('dark')}
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
              theme === 'dark'
                ? 'text-white'
                : 'text-[#8a7a6b] border border-[#e0d8cf] hover:border-[#c25a00]/20'
            }`}
            style={theme === 'dark' ? {
              background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
            } : {
              background: 'linear-gradient(145deg, #ffffff, #f5f0eb)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
          >
            Dark
          </motion.button>
          <button
            disabled
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-[#c0b8ae] border border-[#e8e0d8]/40 cursor-not-allowed"
            style={{
              background: 'rgba(255,255,255,0.3)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            Light (Coming Soon)
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="p-5 rounded-2xl border border-[#e8e0d8]/60" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f0eb]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <BellIcon size={16} className="text-[#8a7a6b]" />
          </div>
          <h3 className="text-sm font-semibold text-[#4a3f35]">Notifications</h3>
        </div>
        <div className="space-y-3">
          <PreferenceToggle label="Build completion alerts" description="Get notified when a build finishes" enabled={true} disabled />
          <PreferenceToggle label="Low credit warnings" description="Alert when credits drop below 50" enabled={true} disabled />
          <PreferenceToggle label="Product updates" description="New features and improvements" enabled={false} disabled />
        </div>
        <p className="text-xs text-[#c0b8ae] mt-3">Notification preferences coming soon</p>
      </div>

      {/* Build Defaults */}
      <div className="p-5 rounded-2xl border border-[#e8e0d8]/60" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f0eb]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <SettingsIcon size={16} className="text-[#8a7a6b]" />
          </div>
          <h3 className="text-sm font-semibold text-[#4a3f35]">Build Defaults</h3>
        </div>
        <p className="text-xs text-[#b0a090]">
          Default build settings and budget caps will be configurable here in a future update.
        </p>
      </div>
    </div>
  );
}

function PreferenceToggle({
  label, description, enabled, disabled, onChange,
}: {
  label: string; description: string; enabled: boolean; disabled?: boolean; onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-[#1a1a1a] font-medium">{label}</p>
        <p className="text-xs text-[#b0a090]">{description}</p>
      </div>
      <button
        onClick={() => onChange?.(!enabled)}
        disabled={disabled}
        className={`w-11 h-6 rounded-full transition-all duration-300 relative ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        style={{
          background: enabled
            ? 'linear-gradient(145deg, #c25a00, #a04800)'
            : 'linear-gradient(145deg, #e0d8cf, #d5cdc3)',
          boxShadow: enabled
            ? '0 2px 6px rgba(194,90,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)'
            : '0 1px 3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
          style={{
            background: 'linear-gradient(145deg, #ffffff, #f5f0eb)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        />
      </button>
    </div>
  );
}
