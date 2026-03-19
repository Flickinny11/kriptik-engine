/**
 * ProfileSettings — Profile management tab
 * Edit display name, slug, view email and account info.
 */

import { useState, useEffect } from 'react';
import { UserIcon, EditIcon, CheckIcon, CloseIcon } from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';
import { toast } from 'sonner';

export function ProfileSettings() {
  const { user, updateProfile, fetchProfile } = useUserStore();
  const [editingName, setEditingName] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [slug, setSlug] = useState(user?.slug || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    setName(user?.name || '');
    setSlug(user?.slug || '');
  }, [user?.name, user?.slug]);

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      setEditingName(false);
      toast.success('Name updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const saveSlug = async () => {
    if (!slug.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ slug: slug.trim().toLowerCase() });
      setEditingSlug(false);
      toast.success('Slug updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update slug');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-bold text-kriptik-white mb-1">Profile</h2>
        <p className="text-sm text-kriptik-slate">Manage your account information</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-5 p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        {user?.image ? (
          <img src={user.image} alt={user.name} className="w-16 h-16 rounded-full object-cover ring-2 ring-kriptik-lime/30" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-kriptik-lime/15 border border-kriptik-lime/30 flex items-center justify-center text-lg font-bold text-kriptik-lime">
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-kriptik-white">{user?.name}</p>
          <p className="text-xs text-kriptik-slate mt-0.5">Avatar upload coming soon</p>
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
            className="bg-kriptik-black border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white focus:outline-none focus:border-kriptik-lime/50 w-full max-w-xs"
          />
        ) : (
          <span className="text-sm text-kriptik-white">{user?.name}</span>
        )}
      </SettingsField>

      {/* Email */}
      <SettingsField label="Email" description="Your login email address">
        <span className="text-sm text-kriptik-white">{user?.email}</span>
        {user && (
          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
            (user as any).emailVerified
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
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
              className="bg-kriptik-black border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white font-mono focus:outline-none focus:border-kriptik-lime/50 w-48"
            />
            <span className="text-xs text-kriptik-slate">.kriptik.app</span>
          </div>
        ) : (
          <span className="text-sm text-kriptik-white font-mono">
            {user?.slug ? `${user.slug}.kriptik.app` : 'Not set'}
          </span>
        )}
      </SettingsField>

      {/* Account created */}
      <SettingsField label="Member Since" description="When your account was created">
        <span className="text-sm text-kriptik-white">
          {user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Unknown'}
        </span>
      </SettingsField>
    </div>
  );
}

function SettingsField({
  label,
  description,
  children,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  editing?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-kriptik-charcoal border border-white/5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-kriptik-silver mb-1">{label}</p>
        {description && <p className="text-xs text-kriptik-slate mb-2">{description}</p>}
        <div className="flex items-center gap-2">{children}</div>
      </div>
      <div className="flex items-center gap-1 pt-1">
        {editing ? (
          <>
            <button
              onClick={onSave}
              disabled={saving}
              className="p-1.5 rounded-md text-kriptik-lime hover:bg-kriptik-lime/10 transition-colors disabled:opacity-50"
            >
              <CheckIcon size={14} />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-md text-kriptik-slate hover:bg-white/5 transition-colors"
            >
              <CloseIcon size={14} />
            </button>
          </>
        ) : onEdit ? (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-kriptik-slate hover:text-kriptik-white hover:bg-white/5 transition-colors"
          >
            <EditIcon size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
