/**
 * FallbackApprovalDialog
 *
 * Shown when a user tries to connect to a service that doesn't have an MCP server.
 * Explains that KripTik will use a browser agent to create an account on their behalf,
 * and requires explicit user approval before proceeding.
 *
 * Three views:
 * 1. Approval — explains what will happen, shows pricing, asks for consent
 * 2. Progress — shows real-time progress messages from the browser agent
 * 3. Verification — input field for pasting email/SMS verification codes
 */

import { useState, useRef, useEffect } from 'react';
import { BrandIcon } from '@/components/ui/BrandIcon';
import type { ServiceRegistryEntry, BrowserAgentProgressMessage } from '@/lib/api-client';

interface FallbackApprovalDialogProps {
  /** The service to connect to */
  service: ServiceRegistryEntry;
  /** User's email for display */
  userEmail: string;
  /** Called when user approves the fallback */
  onApprove: () => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether the fallback is currently running */
  isRunning?: boolean;
  /** Progress messages from the browser agent */
  progressMessages?: BrowserAgentProgressMessage[];
  /** What the session is waiting for (email-code, sms-code) */
  waitingFor?: string;
  /** Called when user submits a verification code */
  onSubmitCode?: (code: string, type: 'email' | 'sms') => void;
  /** Whether the session completed successfully */
  isComplete?: boolean;
  /** Error message if the session failed */
  error?: string;
  /** Called to retry a failed session */
  onRetry?: () => void;
}

export function FallbackApprovalDialog({
  service,
  userEmail,
  onApprove,
  onCancel,
  isRunning = false,
  progressMessages = [],
  waitingFor,
  onSubmitCode,
  isComplete = false,
  error,
  onRetry,
}: FallbackApprovalDialogProps) {
  const [approved, setApproved] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const progressEndRef = useRef<HTMLDivElement>(null);

  const handleApprove = () => {
    setApproved(true);
    onApprove();
  };

  const handleSubmitCode = () => {
    if (!verificationCode.trim() || !onSubmitCode) return;
    const type = waitingFor === 'sms-code' ? 'sms' : 'email';
    onSubmitCode(verificationCode.trim(), type);
    setVerificationCode('');
  };

  // Auto-scroll progress messages
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [progressMessages.length]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fallback-dialog-title"
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl p-6 border border-white/10"
        style={{
          background: 'linear-gradient(145deg, rgba(30,30,30,0.98), rgba(20,20,20,0.98))',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className="rounded-xl p-2.5"
            style={{
              background: `${service.brandColor}15`,
              boxShadow: `0 0 16px ${service.brandColor}10`,
            }}
          >
            <BrandIcon
              iconId={service.iconSlug}
              size={36}
              color={service.brandColor}
              ariaLabel={service.name}
            />
          </div>
          <div>
            <h3 id="fallback-dialog-title" className="text-lg font-semibold text-kriptik-white">
              {isComplete ? `Connected to ${service.name}` : `Connect to ${service.name}`}
            </h3>
            <p className="text-xs text-kriptik-silver">
              {isComplete ? 'Account created successfully' : 'Automated account setup'}
            </p>
          </div>
        </div>

        {!approved ? (
          <>
            {/* Explanation */}
            <div className="mb-5 p-4 rounded-xl bg-kriptik-amber/5 border border-kriptik-amber/20">
              <p className="text-sm text-kriptik-white leading-relaxed">
                {service.name} doesn't support one-click setup yet. KripTik will create an account
                for you using your email.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-kriptik-silver">
                <div className="w-1.5 h-1.5 rounded-full bg-kriptik-amber" />
                <span>Account will be created under: <strong className="text-kriptik-white">{userEmail}</strong></span>
              </div>
              <p className="mt-3 text-xs text-kriptik-silver leading-relaxed">
                You may need to verify your email or paste a code. KripTik will guide you through each step.
              </p>
            </div>

            {/* Pricing note */}
            {service.pricing.length > 0 && (
              <div className="mb-5 p-3 rounded-lg bg-white/3 border border-white/5">
                <p className="text-xs text-kriptik-silver mb-1.5">
                  Starting plan:
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-kriptik-white">
                    {service.pricing[0].name}
                  </span>
                  <span className="text-sm text-kriptik-lime font-medium">
                    {service.pricing[0].price === 0 ? 'Free' : `$${service.pricing[0].price}/mo`}
                  </span>
                </div>
                <p className="text-xs text-kriptik-silver mt-1">
                  {service.pricing[0].description}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-kriptik-silver border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-kriptik-black transition-all"
                style={{
                  background: `linear-gradient(135deg, ${service.brandColor}, ${service.brandColor}cc)`,
                  boxShadow: `0 4px 12px ${service.brandColor}30`,
                }}
              >
                Create Account
              </button>
            </div>
          </>
        ) : (
          /* Progress / Verification / Complete / Error view */
          <div>
            {/* Progress messages */}
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {progressMessages.length > 0 ? (
                progressMessages.map((msg, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 text-sm"
                  >
                    <div
                      className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: msg.completed
                          ? '#22c55e'
                          : i === progressMessages.length - 1
                            ? service.brandColor
                            : '#22c55e',
                      }}
                    />
                    <span className={
                      i === progressMessages.length - 1 && !msg.completed
                        ? 'text-kriptik-white'
                        : 'text-kriptik-silver'
                    }>
                      {msg.message}
                    </span>
                  </div>
                ))
              ) : isRunning ? (
                <div className="flex items-center gap-3 py-4">
                  <div
                    className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: `${service.brandColor} transparent ${service.brandColor} ${service.brandColor}` }}
                  />
                  <span className="text-sm text-kriptik-silver">
                    Preparing signup for {service.name}...
                  </span>
                </div>
              ) : null}
              <div ref={progressEndRef} />
            </div>

            {/* Verification code input */}
            {waitingFor && (waitingFor === 'email-code' || waitingFor === 'sms-code') && (
              <div className="mb-4 p-4 rounded-xl border border-white/10 bg-white/3">
                <p className="text-sm text-kriptik-white mb-3">
                  {waitingFor === 'sms-code'
                    ? 'Paste the SMS verification code you received:'
                    : 'Paste the email verification code you received:'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmitCode()}
                    placeholder="Enter code..."
                    className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-kriptik-white text-sm placeholder:text-kriptik-silver/50 focus:outline-none focus:border-white/20"
                    autoFocus
                  />
                  <button
                    onClick={handleSubmitCode}
                    disabled={!verificationCode.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                    style={{
                      background: verificationCode.trim() ? service.brandColor : 'rgba(255,255,255,0.05)',
                      color: verificationCode.trim() ? '#000' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Complete state */}
            {isComplete && (
              <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <p className="text-sm text-green-400">
                  Account created successfully. Your credentials have been securely stored.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {isRunning && !isComplete && (
                <button
                  onClick={onCancel}
                  className="flex-1 py-2 rounded-xl text-sm text-kriptik-silver border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
              )}

              {error && onRetry && (
                <>
                  <button
                    onClick={onCancel}
                    className="flex-1 py-2 rounded-xl text-sm text-kriptik-silver border border-white/10 hover:border-white/20 transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={onRetry}
                    className="flex-1 py-2 rounded-xl text-sm font-medium text-kriptik-black transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${service.brandColor}, ${service.brandColor}cc)`,
                      boxShadow: `0 4px 12px ${service.brandColor}30`,
                    }}
                  >
                    Retry
                  </button>
                </>
              )}

              {isComplete && (
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-kriptik-black transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                  }}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
