/**
 * Apple Developer Credential Form
 *
 * Styled to match the Builder's dark slate glass popouts.
 * - No emoji glyphs
 * - No purple
 * - Uses simple-icons for Apple branding
 */

import React, { useCallback, useMemo, useState } from 'react';
import { DeployInterlockIcon3D } from '../ui/InterlockingIcons3D';
const SiApple = ({ size = 20 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>;
const SiAppleHex = '#000';
import './deploy-popout.css';

interface AppleCredentialFormProps {
  onSubmit: (creds: {
    teamId: string;
    ascKeyId: string;
    ascIssuerId: string;
    privateKeyContent: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onValidate?: () => Promise<{ success: boolean; valid: boolean; error?: string }>;
  hasExistingCredentials?: boolean;
  existingTeamId?: string;
  validatedAt?: string | null;
  onBack?: () => void;
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        color: 'rgba(180,215,255,0.92)',
      }}
    >
      {children}
    </span>
  );
}

export function AppleCredentialForm({
  onSubmit,
  onValidate,
  hasExistingCredentials,
  existingTeamId,
  validatedAt,
  onBack,
}: AppleCredentialFormProps) {
  const [teamId, setTeamId] = useState('');
  const [ascKeyId, setAscKeyId] = useState('');
  const [ascIssuerId, setAscIssuerId] = useState('');
  const [privateKeyContent, setPrivateKeyContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  const validatedLabel = useMemo(() => {
    if (!validatedAt) return null;
    try {
      return `Validated ${new Date(validatedAt).toLocaleDateString()}`;
    } catch {
      return null;
    }
  }, [validatedAt]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.p8')) {
      setError('Please upload a .p8 file from App Store Connect.');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content.includes('-----BEGIN PRIVATE KEY-----')) {
        setError('Invalid .p8 file: must contain a PEM-encoded private key.');
        return;
      }
      setPrivateKeyContent(content);
      setError(null);
    };
    reader.readAsText(file);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      if (!/^[A-Z0-9]{10}$/.test(teamId)) {
        setError('Team ID must be exactly 10 alphanumeric characters.');
        return;
      }

      if (!ascKeyId.trim() || !ascIssuerId.trim() || !privateKeyContent) {
        setError('All fields are required.');
        return;
      }

      setSubmitting(true);
      try {
        const result = await onSubmit({ teamId, ascKeyId, ascIssuerId, privateKeyContent });
        if (result.success) {
          setSuccess(true);
        } else {
          setError(result.error || 'Failed to store credentials.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to store credentials.');
      } finally {
        setSubmitting(false);
      }
    },
    [teamId, ascKeyId, ascIssuerId, privateKeyContent, onSubmit]
  );

  const handleValidate = useCallback(async () => {
    if (!onValidate) return;
    setValidating(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await onValidate();
      if (result.valid) {
        setSuccess(true);
      } else {
        setError(result.error || 'Credentials validation failed.');
      }
    } catch {
      setError('Failed to validate credentials.');
    } finally {
      setValidating(false);
    }
  }, [onValidate]);

  const showExistingStatus = hasExistingCredentials && !success && !showUpdateForm;

  if (showExistingStatus) {
    return (
      <div className="space-y-3">
        <div className="deploy-section" style={{ borderColor: 'rgba(34,197,94,0.18)' }}>
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                background: 'linear-gradient(145deg, rgba(34,197,94,0.22), rgba(255,255,255,0.02))',
                border: '1px solid rgba(34,197,94,0.22)',
                boxShadow: '0 18px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DeployInterlockIcon3D size={18} tone="crimson" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="deploy-provider-card__name">Apple Credentials Connected</div>
              <div className="deploy-muted">
                Team ID: <InlineCode>{existingTeamId || '—'}</InlineCode>
                {validatedLabel ? ` · ${validatedLabel}` : ''}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 14,
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(248,250,252,0.82))',
                  border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow:
                    '0 14px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 1px rgba(255,255,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SiApple size={20} color={SiAppleHex} title="Apple" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="deploy-section" style={{ borderColor: 'rgba(239,68,68,0.22)' }}>
            <div style={{ color: 'rgba(255,180,180,0.92)', fontSize: 12, fontFamily: '"Satoshi", system-ui' }}>
              {error}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {onValidate && (
            <button
              type="button"
              className="deploy-btn"
              onClick={handleValidate}
              disabled={validating}
              style={{ opacity: validating ? 0.6 : 1 }}
            >
              {validating ? 'Validating' : 'Re-validate'}
            </button>
          )}
          <button type="button" className="deploy-btn" onClick={() => setShowUpdateForm(true)}>
            Update
          </button>
          {onBack && (
            <button type="button" className="deploy-btn deploy-btn--primary" onClick={onBack}>
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="deploy-section">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="deploy-section__label">App Store Connect</div>
            <div className="deploy-muted" style={{ marginTop: 6 }}>
              Create an API key in App Store Connect, then upload the <InlineCode>.p8</InlineCode> file.
            </div>
          </div>
          <a
            className="deploy-btn"
            href="https://appstoreconnect.apple.com/access/api"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            Open
          </a>
        </div>
      </div>

      {success && (
        <div className="deploy-section" style={{ borderColor: 'rgba(34,197,94,0.18)' }}>
          <div className="flex items-center gap-3">
            <DeployInterlockIcon3D size={18} tone="crimson" />
            <div className="deploy-muted" style={{ color: 'rgba(255,255,255,0.78)' }}>
              Credentials saved successfully.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="deploy-section" style={{ borderColor: 'rgba(239,68,68,0.22)' }}>
          <div style={{ color: 'rgba(255,180,180,0.92)', fontSize: 12, fontFamily: '"Satoshi", system-ui' }}>
            {error}
          </div>
        </div>
      )}

      <div className="deploy-section">
        <div className="deploy-section__label">Credentials</div>

        <div className="deploy-fieldgrid" style={{ marginTop: 10 }}>
          <div className="deploy-field">
            <label className="deploy-label">Team ID</label>
            <input
              className="deploy-input"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value.toUpperCase())}
              placeholder="ABC1234DEF"
              maxLength={10}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              }}
            />
          </div>
          <div className="deploy-field">
            <label className="deploy-label">Key ID</label>
            <input
              className="deploy-input"
              value={ascKeyId}
              onChange={(e) => setAscKeyId(e.target.value)}
              placeholder="2X9R4HXF34"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              }}
            />
          </div>
        </div>

        <div className="deploy-field" style={{ marginTop: 10 }}>
          <label className="deploy-label">Issuer ID</label>
          <input
            className="deploy-input"
            value={ascIssuerId}
            onChange={(e) => setAscIssuerId(e.target.value)}
            placeholder="69a6de7e-1234-47e3-abcd-1234567890ab"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            }}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <label className="deploy-label">Private Key (.p8)</label>
          <label
            style={{
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 14,
              border: '1px dashed rgba(255,255,255,0.16)',
              background: 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
            }}
          >
            <span className="deploy-muted" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {fileName ? (
                <>
                  Selected: <InlineCode>{fileName}</InlineCode>
                </>
              ) : (
                'Choose .p8 file'
              )}
            </span>
            <span className="deploy-pill">Upload</span>
            <input type="file" accept=".p8" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>

        <div className="deploy-btnrow">
          <div className="deploy-muted">
            Required: Team ID, Key ID, Issuer ID, and private key.
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button type="button" className="deploy-btn" onClick={onBack}>
                Back
              </button>
            )}
            <button
              type="submit"
              className="deploy-btn deploy-btn--primary"
              disabled={submitting}
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

