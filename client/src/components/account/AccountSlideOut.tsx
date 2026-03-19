/**
 * AccountSlideOut — Hover/touch-triggered slide-out navigation panel
 *
 * Desktop: Activated by hovering over a trigger strip on the left edge.
 * Mobile: Tap the hamburger menu button that replaces the trigger strip.
 * Slides in from the left with a spring animation.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserIcon, CoinsIcon, ShieldIcon, ActivityIcon,
  SettingsIcon, LogOutIcon, ChevronRightIcon, MenuIcon,
} from '@/components/ui/icons';
import { useUserStore } from '@/store/useUserStore';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  tab: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Profile', icon: <UserIcon size={18} />, tab: 'profile' },
  { label: 'Billing & Credits', icon: <CoinsIcon size={18} />, tab: 'billing' },
  { label: 'Security', icon: <ShieldIcon size={18} />, tab: 'security' },
  { label: 'Usage', icon: <ActivityIcon size={18} />, tab: 'usage' },
  { label: 'Preferences', icon: <SettingsIcon size={18} />, tab: 'preferences' },
];

export function AccountSlideOut() {
  const [isOpen, setIsOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useUserStore();

  // Detect touch device on mount
  useEffect(() => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(isTouch);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 300);
  }, [cancelClose]);

  const handleOpen = useCallback(() => {
    cancelClose();
    setIsOpen(true);
  }, [cancelClose]);

  const handleNavigate = useCallback((tab: string) => {
    setIsOpen(false);
    navigate(`/settings?tab=${tab}`);
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    setIsOpen(false);
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // User initials for avatar fallback
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      {/* Desktop: hover trigger zone — invisible strip on the left edge */}
      {!isTouchDevice && (
        <div
          className="fixed left-0 top-0 w-[60px] h-full z-40 hidden md:block"
          onMouseEnter={handleOpen}
          onMouseLeave={scheduleClose}
          style={{ pointerEvents: isOpen ? 'none' : 'auto' }}
        />
      )}

      {/* Mobile: fixed menu button */}
      {isTouchDevice && !isOpen && (
        <button
          onClick={handleOpen}
          className="fixed top-3 left-3 z-40 w-10 h-10 flex items-center justify-center rounded-lg bg-kriptik-charcoal/90 border border-white/10 md:hidden"
          aria-label="Open menu"
        >
          <MenuIcon size={18} />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel — narrower on mobile */}
            <motion.div
              ref={panelRef}
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[280px] sm:w-[320px] bg-kriptik-charcoal border-r border-white/10 flex flex-col shadow-2xl shadow-black/60"
              onMouseEnter={!isTouchDevice ? cancelClose : undefined}
              onMouseLeave={!isTouchDevice ? scheduleClose : undefined}
            >
              {/* User header */}
              <div className="p-4 sm:p-5 border-b border-white/5">
                <div className="flex items-center gap-3 mb-3">
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-kriptik-lime/30"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-kriptik-lime/15 border border-kriptik-lime/30 flex items-center justify-center text-sm font-semibold text-kriptik-lime">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-kriptik-white truncate">{user?.name}</p>
                    <p className="text-xs text-kriptik-slate truncate">{user?.email}</p>
                  </div>
                </div>

                {/* Credit balance */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-kriptik-black/50 border border-white/5">
                  <div className="flex items-center gap-2">
                    <CoinsIcon size={14} />
                    <span className="text-xs text-kriptik-silver">Credits</span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-kriptik-lime">
                    {(user?.credits ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Navigation items */}
              <nav className="flex-1 py-2 overflow-y-auto">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.tab}
                    onClick={() => handleNavigate(item.tab)}
                    className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-sm text-kriptik-silver hover:text-kriptik-white hover:bg-white/5 active:bg-white/10 transition-colors group"
                  >
                    <span className="text-kriptik-slate group-hover:text-kriptik-lime transition-colors">
                      {item.icon}
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRightIcon size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                  </button>
                ))}
              </nav>

              {/* Tier badge + separator */}
              <div className="px-4 sm:px-5 py-3 border-t border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-kriptik-slate">Current Plan</span>
                  <span className="text-xs font-semibold text-kriptik-lime uppercase tracking-wider px-2 py-0.5 rounded bg-kriptik-lime/10 border border-kriptik-lime/20">
                    {user?.tier || 'free'}
                  </span>
                </div>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-kriptik-slate hover:text-red-400 hover:bg-red-500/5 active:bg-red-500/10 rounded-lg transition-colors"
                >
                  <LogOutIcon size={16} />
                  <span>Log out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * LogoHoverTrigger — wrap around the KripTik logo to also trigger the slide-out
 * Usage: <LogoHoverTrigger onHover={() => ...}><Logo /></LogoHoverTrigger>
 */
export function LogoHoverTrigger({ children, onHover }: { children: React.ReactNode; onHover: () => void }) {
  return (
    <div onMouseEnter={onHover} className="cursor-pointer">
      {children}
    </div>
  );
}
