/**
 * PreferencesSettings — Theme, notification, and build preferences
 * Most options are stubs for now as the app is dark-mode only.
 */

import { useState } from 'react';
import { MoonIcon, BellIcon, SettingsIcon } from '@/components/ui/icons';

export function PreferencesSettings() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-bold text-kriptik-white mb-1">Preferences</h2>
        <p className="text-sm text-kriptik-slate">Customize your KripTik experience</p>
      </div>

      {/* Theme */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <MoonIcon size={16} />
          <h3 className="text-sm font-semibold text-kriptik-silver">Theme</h3>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme('dark')}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              theme === 'dark'
                ? 'bg-kriptik-lime/10 text-kriptik-lime border border-kriptik-lime/20'
                : 'bg-kriptik-black border border-white/10 text-kriptik-silver hover:border-white/20'
            }`}
          >
            Dark
          </button>
          <button
            disabled
            className="px-4 py-2 rounded-lg text-sm bg-kriptik-black border border-white/5 text-kriptik-slate cursor-not-allowed"
          >
            Light (Coming Soon)
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <BellIcon size={16} />
          <h3 className="text-sm font-semibold text-kriptik-silver">Notifications</h3>
        </div>
        <div className="space-y-3">
          <PreferenceToggle
            label="Build completion alerts"
            description="Get notified when a build finishes"
            enabled={true}
            disabled
          />
          <PreferenceToggle
            label="Low credit warnings"
            description="Alert when credits drop below 50"
            enabled={true}
            disabled
          />
          <PreferenceToggle
            label="Product updates"
            description="New features and improvements"
            enabled={false}
            disabled
          />
        </div>
        <p className="text-xs text-kriptik-slate mt-3">Notification preferences coming soon</p>
      </div>

      {/* Build Defaults */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <SettingsIcon size={16} />
          <h3 className="text-sm font-semibold text-kriptik-silver">Build Defaults</h3>
        </div>
        <p className="text-xs text-kriptik-slate">
          Default build settings and budget caps will be configurable here in a future update.
        </p>
      </div>
    </div>
  );
}

function PreferenceToggle({
  label,
  description,
  enabled,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-kriptik-white">{label}</p>
        <p className="text-xs text-kriptik-slate">{description}</p>
      </div>
      <button
        onClick={() => onChange?.(!enabled)}
        disabled={disabled}
        className={`w-10 h-5 rounded-full transition-colors relative ${
          enabled ? 'bg-kriptik-lime/30' : 'bg-white/10'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
          enabled ? 'translate-x-5 bg-kriptik-lime' : 'translate-x-0.5 bg-kriptik-slate'
        }`} />
      </button>
    </div>
  );
}
