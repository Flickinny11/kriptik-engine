import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';

/**
 * GSAP-powered type animation for streaming agent text.
 *
 * Characters appear progressively with a natural typing rhythm —
 * not a constant rate, slight variation per character for organic feel.
 * Uses GSAP for smooth 60fps animation with easing.
 *
 * Falls back to instant display if text is already complete (replay mode).
 */
export function TypeAnimatedText({
  text,
  isLive = false,
  className = '',
}: {
  text: string;
  isLive?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [displayedText, setDisplayedText] = useState(isLive ? '' : text);
  const prevTextRef = useRef(isLive ? '' : text);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!isLive) {
      // Replay mode — show all text instantly
      setDisplayedText(text);
      return;
    }

    // Live mode — animate new characters
    const prevText = prevTextRef.current;
    const newChars = text.slice(prevText.length);
    prevTextRef.current = text;

    if (!newChars) return;

    // Kill any existing animation
    tweenRef.current?.kill();

    const startLen = displayedText.length;
    const endLen = text.length;
    const obj = { len: startLen };

    tweenRef.current = gsap.to(obj, {
      len: endLen,
      duration: Math.min(newChars.length * 0.012, 0.5), // ~12ms per char, max 500ms
      ease: 'none',
      onUpdate: () => {
        setDisplayedText(text.slice(0, Math.floor(obj.len)));
      },
      onComplete: () => {
        setDisplayedText(text);
      },
    });

    return () => {
      tweenRef.current?.kill();
    };
  }, [text, isLive]);

  // Scroll the container's parent to keep latest text visible
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [displayedText]);

  return (
    <span ref={containerRef} className={className}>
      {displayedText}
      {isLive && displayedText.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] bg-current animate-pulse ml-[1px] align-text-bottom" />
      )}
    </span>
  );
}

/**
 * GSAP-powered reveal animation for response box sections.
 * Each section slides up and fades in when it first appears.
 */
export function RevealOnMount({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current,
      { opacity: 0, y: 8, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.35,
        delay,
        ease: 'power2.out',
      },
    );
  }, [delay]);

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
