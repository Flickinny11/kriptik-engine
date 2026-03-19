/**
 * ProfileSettings — Profile management with warm-glass premium styling.
 * Off-white cards with 3D depth, realistic shadows, and hover animations.
 */

import { useState, useEffect } from 'react';
import { UserIcon, EditIcon, CheckIcon, CloseIcon } from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';
import { toast } from 'sonner';

// Shared card style for all settings
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

const cardHoverStyle: React.CSSProperties = {
  ...cardStyle,
  boxShadow: `
    0 8px 24px rgba(0,0,0,0.08),
    0 2px 8px rgba(0,0,0,0.04),
    inset 0 1px 0 rgba(255,255,255,0.9),
    inset 0 -1px 0 rgba(0,0,0,0.02)
  `,
};

export function ProfileSettings() {
  const { user, updateProfile, fetchProfile } = useUserStore();
  const [editingName, setEditingName] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [slug, setSlug] = useState(user?.slug || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { setName(user?.name || ''); setSlug(user?.slug || ''); }, [user?.name, user?.slug]);

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      setEditingName(false);
      toast.success('Name updated');
    } catch (err: any) { toast.error(err.message || 'Failed to update name'); }
    finally { setSaving(false); }
  };

  const saveSlug = async () => {
    if (!slug.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ slug: slug.trim().toLowerCase() });
      setEditingSlug(false);
      toast.success('Slug updated');
    } catch (err: any) { toast.error(err.message || 'Failed to update slug'); }
    finally { setSaving(false); }
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Profile</h2>
        <p className="text-sm text-[#8a7a6b]">Manage your account information</p>
      </div>

      {/* Avatar */}
      <div
        className="flex items-center gap-5 p-5 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500 hover:-translate-y-0.5"
        style={cardStyle}
      >
        {user?.image ? (
          <img src={user.image} alt={user.name} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#c25a00]/20 shadow-lg" />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold text-[#c25a00]"
            style={{
              background: 'linear-gradient(135deg, #fef3e8 0%, #fde6d0 100%)',
              boxShadow: '0 4px 12px rgba(194,90,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-[#1a1a1a]">{user?.name}</p>
          <p className="text-xs text-[#b0a090] mt-0.5">Avatar upload coming soon</p>
        </div>
      </div>

      {/* Display name */}
      <SettingsField
        label="Display Name"
        description="How you appear across KripTik"
        editing={editingName}
        onEdit={() => setEditingName(true)}
        onCancel={() => { setEditingName(false); setName(user?.name || ''); }}
        onSave={saveName}
        saving={saving}
      >
        {editingName ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            autoFocus
            className="bg-white border border-[#ddd3c8] rounded-xl px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#c25a00]/50 focus:ring-2 focus:ring-[#c25a00]/10 w-full max-w-xs transition-all duration-300"
            style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}
          />
        ) : (
          <span className="text-sm text-[#1a1a1a] font-medium">{user?.name}</span>
        )}
      </SettingsField>

      {/* Email */}
      <SettingsField label="Email" description="Your login email address">
        <span className="text-sm text-[#1a1a1a] font-medium">{user?.email}</span>
        {user && (
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-lg font-medium ${
            (user as any).emailVerified
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {(user as any).emailVerified ? 'Verified' : 'Unverified'}
          </span>
        )}
      </SettingsField>

      {/* Slug */}
      <SettingsField
        label="Namespace Slug"
        description="Your app URLs will be {slug}.kriptik.app"
        editing={editingSlug}
        onEdit={() => setEditingSlug(true)}
        onCancel={() => { setEditingSlug(false); setSlug(user?.slug || ''); }}
        onSave={saveSlug}
        saving={saving}
      >
        {editingSlug ? (
          <div className="flex items-center gap-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && saveSlug()}
              autoFocus
              placeholder="my-namespace"
              className="bg-white border border-[#ddd3c8] rounded-xl px-3 py-2 text-sm text-[#1a1a1a] font-mono focus:outline-none focus:border-[#c25a00]/50 focus:ring-2 focus:ring-[#c25a00]/10 w-48 transition-all duration-300"
              style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}
            />
            <span className="text-xs text-[#b0a090]">.kriptik.app</span>
          </div>
        ) : (
          <span className="text-sm text-[#1a1a1a] font-mono font-medium">
            {user?.slug ? `${user.slug}.kriptik.app` : 'Not set'}
          </span>
        )}
      </SettingsField>

      {/* Account created */}
      <SettingsField label="Member Since" description="When your account was created">
        <span className="text-sm text-[#1a1a1a] font-medium">
          {user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Unknown'}
        </span>
      </SettingsField>
    </div>
  );
}

function SettingsField({
  label, description, children, editing, onEdit, onCancel, onSave, saving,
}: {
  label: string; description?: string; children: React.ReactNode;
  editing?: boolean; onEdit?: () => void; onCancel?: () => void; onSave?: () => void; saving?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500 hover:-translate-y-0.5"
      style={hovered ? cardHoverStyle : cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#4a3f35] mb-1">{label}</p>
        {description && <p className="text-xs text-[#b0a090] mb-2">{description}</p>}
        <div className="flex items-center gap-2">{children}</div>
      </div>
      <div className="flex items-center gap-1 pt-1">
        {editing ? (
          <>
            <button
              onClick={onSave}
              disabled={saving}
              className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-all duration-300 disabled:opacity-50"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <CheckIcon size={14} />
            </button>
            <button
              onClick={onCancel}
              className="p-2 rounded-xl text-[#b0a090] hover:bg-[#f0ebe5] transition-all duration-300"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <CloseIcon size={14} />
            </button>
          </>
        ) : onEdit ? (
          <button
            onClick={onEdit}
            className="p-2 rounded-xl text-[#b0a090] hover:text-[#1a1a1a] hover:bg-white/80 transition-all duration-300"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <EditIcon size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
