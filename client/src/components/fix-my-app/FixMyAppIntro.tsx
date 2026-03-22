/**
 * Fix My App Intro Animation - Premium 3D Glass Edition
 *
 * Immediately shows the photorealistic 3D scene with:
 * - Falling error blocks raining from above
 * - "Let's Fix This" title with amber accent
 * - Liquid glass "Start Fixing" button with refraction
 * - High frame rate butter-smooth animations (60fps)
 */

import { useEffect, useRef, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';

// Lazy load the 3D scene for performance
const FixMyAppIntro3DScene = lazy(() => import('./FixMyAppIntro3DScene'));

interface FixMyAppIntroProps {
  onComplete: () => void;
}

// =============================================================================
// MAIN INTRO COMPONENT — Goes straight to the 3D scene
// =============================================================================

export function FixMyAppIntro({ onComplete }: FixMyAppIntroProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // GSAP entrance animation
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.5, ease: 'power2.out' }
    );
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-[#030305] overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Load the 3D scene immediately — no frustration/smoke phases */}
      <motion.div
        key="ready"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="absolute inset-0"
      >
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-[#030305]">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-slate-400">Loading 3D scene...</p>
            </div>
          </div>
        }>
          <FixMyAppIntro3DScene onButtonClick={onComplete} />
        </Suspense>
      </motion.div>
    </div>
  );
}

export default FixMyAppIntro;
