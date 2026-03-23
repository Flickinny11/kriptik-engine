/**
 * EmailMcpBanner — Dashboard banner prompting users to connect their email
 * for automatic verification during browser-agent service signups.
 *
 * Conditions for display:
 * - User does NOT have Gmail or Outlook MCP connected
 * - User has at least one project
 * - Banner has not been dismissed (persisted in localStorage per user)
 *
 * The Connect button opens the MCP OAuth flow for Gmail (or Outlook,
 * detected from the user's signup email domain).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { useUserStore } from '@/store/useUserStore';
import { CloseIcon } from '@/components/ui/icons';

interface EmailMcpBannerProps {
  /** Number of projects the user has */
  projectCount: number;
}

const DISMISS_KEY_PREFIX = 'kriptik_email_mcp_banner_dismissed_';

/** Detect email provider from user's email domain */
function detectEmailProvider(email: string): { serviceId: string; label: string } {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live') || domain.includes('microsoft')) {
    return { serviceId: 'microsoft-outlook', label: 'Outlook' };
  }
  return { serviceId: 'gmail', label: 'Gmail' };
}

export function EmailMcpBanner({ projectCount }: EmailMcpBannerProps) {
  const { user } = useUserStore();
  const [hasEmailMcp, setHasEmailMcp] = useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = useState(true); // default hidden until checked
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const userId = user?.id ?? '';
  const userEmail = user?.email ?? '';
  const dismissKey = `${DISMISS_KEY_PREFIX}${userId}`;

  // Check dismiss state from localStorage
  useEffect(() => {
    if (!userId) return;
    const dismissed = localStorage.getItem(dismissKey) === 'true';
    setIsDismissed(dismissed);
  }, [userId, dismissKey]);

  // Check if user already has email MCP connected
  useEffect(() => {
    let cancelled = false;
    async function checkEmailMcp() {
      try {
        const { connections } = await apiClient.getMcpConnections();
        const hasEmail = connections.some(
          (c) => (c.serviceId === 'gmail' || c.serviceId === 'microsoft-outlook') && c.status === 'connected'
        );
        if (!cancelled) setHasEmailMcp(hasEmail);
      } catch {
        if (!cancelled) setHasEmailMcp(false);
      }
    }
    checkEmailMcp();
    return () => { cancelled = true; };
  }, []);

  // Listen for OAuth popup completion
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'mcp_oauth_complete' && event.data?.serviceId) {
        const sid = event.data.serviceId;
        if (sid === 'gmail' || sid === 'microsoft-outlook') {
          setHasEmailMcp(true);
          setIsConnecting(false);
          popupRef.current?.close();
        }
      }
      if (event.data?.type === 'mcp_oauth_error') {
        setConnectError('Connection failed. Please try again.');
        setIsConnecting(false);
        popupRef.current?.close();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem(dismissKey, 'true');
  }, [dismissKey]);

  const handleConnect = useCallback(async () => {
    if (!userEmail || isConnecting) return;
    setConnectError(null);
    setIsConnecting(true);

    const { serviceId, label } = detectEmailProvider(userEmail);

    try {
      // The MCP server URLs for email providers
      const mcpServerUrls: Record<string, string> = {
        'gmail': 'https://mcp.google.com/gmail',
        'microsoft-outlook': 'https://mcp.microsoft.com/outlook',
      };

      const mcpServerUrl = mcpServerUrls[serviceId];
      if (!mcpServerUrl) {
        setConnectError(`No MCP server configured for ${label}`);
        setIsConnecting(false);
        return;
      }

      const { authorizationUrl } = await apiClient.startMcpAuth(serviceId, mcpServerUrl);

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      popupRef.current = window.open(
        authorizationUrl,
        `kriptik_email_oauth_${serviceId}`,
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      );

      // Poll for popup close (user cancelled)
      const pollTimer = setInterval(() => {
        if (popupRef.current?.closed) {
          clearInterval(pollTimer);
          setIsConnecting(false);
        }
      }, 500);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to start connection');
      setIsConnecting(false);
    }
  }, [userEmail, isConnecting]);

  // Don't render if: still loading, already connected, dismissed, no projects, no user
  if (hasEmailMcp === null || hasEmailMcp || isDismissed || projectCount === 0 || !userId) {
    return null;
  }

  const { label: providerLabel } = userEmail ? detectEmailProvider(userEmail) : { label: 'Gmail' };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="mb-8"
      >
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(255, 245, 235, 0.7) 0%, rgba(255, 235, 220, 0.5) 50%, rgba(255, 225, 205, 0.45) 100%)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: `
              0 8px 32px rgba(194, 90, 0, 0.08),
              0 4px 16px rgba(0, 0, 0, 0.04),
              inset 0 1px 2px rgba(255, 255, 255, 0.9),
              inset 0 -1px 1px rgba(0, 0, 0, 0.02),
              0 0 0 1px rgba(255, 220, 190, 0.5)
            `,
          }}
        >
          {/* Top highlight edge */}
          <div
            className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
          />

          <div className="flex items-start gap-4 p-5 sm:p-6">
            {/* Icon */}
            <div
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(194, 90, 0, 0.15) 0%, rgba(194, 90, 0, 0.08) 100%)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 4px 12px rgba(194, 90, 0, 0.1)',
              }}
            >
              {/* Mail icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c25a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3
                className="text-sm font-semibold mb-1"
                style={{
                  color: '#1a1a1a',
                  fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Display, sans-serif',
                }}
              >
                Connect your email for seamless service setup
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#555' }}>
                When KripTik creates accounts at third-party services, it can automatically
                verify your email. Connect {providerLabel} so you never have to paste verification codes.
              </p>

              {connectError && (
                <p className="text-xs mt-2" style={{ color: '#dc2626' }}>
                  {connectError}
                </p>
              )}

              {/* Connect button */}
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: isConnecting
                    ? 'linear-gradient(145deg, rgba(194,90,0,0.4) 0%, rgba(160,72,0,0.3) 100%)'
                    : 'linear-gradient(145deg, rgba(194,90,0,0.9) 0%, rgba(160,72,0,0.85) 100%)',
                  color: '#fff',
                  boxShadow: isConnecting
                    ? '0 2px 8px rgba(194, 90, 0, 0.15)'
                    : '0 4px 0 rgba(130, 60, 0, 0.5), 0 8px 24px rgba(194, 90, 0, 0.25), inset 0 1px 1px rgba(255,255,255,0.2)',
                  transform: isConnecting ? 'none' : undefined,
                  cursor: isConnecting ? 'not-allowed' : 'pointer',
                  opacity: isConnecting ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isConnecting) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 0 rgba(130, 60, 0, 0.5), 0 12px 32px rgba(194, 90, 0, 0.3), inset 0 1px 1px rgba(255,255,255,0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isConnecting) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 0 rgba(130, 60, 0, 0.5), 0 8px 24px rgba(194, 90, 0, 0.25), inset 0 1px 1px rgba(255,255,255,0.2)';
                  }
                }}
              >
                {isConnecting ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect {providerLabel}
                  </>
                )}
              </button>
            </div>

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: 'rgba(0,0,0,0.04)',
                color: '#999',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.08)';
                e.currentTarget.style.color = '#666';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                e.currentTarget.style.color = '#999';
              }}
              aria-label="Dismiss email connection banner"
            >
              <CloseIcon size={14} />
            </button>
          </div>

          {/* Subtle bottom edge for depth */}
          <div
            className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(194, 90, 0, 0.1) 50%, transparent 95%)' }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
