/**
 * GSAP ScrollTrigger animations for the landing page.
 * Now handles: hero entrance, hero scroll parallax, section transitions,
 * auth/footer reveals. Individual sections (Brain, BuildTypes, Capabilities,
 * Deploy, Quality, Ship) handle their own internal ScrollTrigger animations.
 *
 * Design_References.md §6 — ScrollTrigger parallax, 3D reveals
 */

import { useEffect, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useLandingAnimations(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const ctx = gsap.context(() => {

      // ── Hero entrance — cinematic stagger ──
      const heroTl = gsap.timeline({ delay: 0.3 })
      heroTl.from('.hero-title', {
        y: 120, scale: 0.7, opacity: 0, rotateX: -15,
        duration: 2, ease: 'expo.out',
      })
      heroTl.from('.hero-sub', {
        y: 80, opacity: 0, duration: 1.6, ease: 'expo.out',
      }, '-=1.2')
      heroTl.from('.hero-cta-group', {
        y: 60, opacity: 0, scale: 0.85, duration: 1.4, ease: 'expo.out',
      }, '-=0.8')
      heroTl.from('.scroll-indicator', {
        opacity: 0, y: -30, duration: 1, ease: 'power2.out',
      }, '-=0.4')

      // ── Hero scroll parallax — elements move at different speeds ──
      gsap.to('.hero-title', {
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
        y: -150, scale: 0.85, opacity: 0,
      })
      gsap.to('.hero-sub', {
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top top',
          end: '80% top',
          scrub: true,
        },
        y: -80, opacity: 0,
      })
      gsap.to('.hero-cta-group', {
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top top',
          end: '60% top',
          scrub: true,
        },
        y: -40, opacity: 0,
      })

      // ── Auth + footer reveals ──
      gsap.from('.auth-section', {
        scrollTrigger: { trigger: '.auth-section', start: 'top 80%', toggleActions: 'play none none reverse' },
        y: 100, scale: 0.92, rotateX: -12, opacity: 0, duration: 1.6, ease: 'expo.out',
      })
      gsap.from('.landing-footer', {
        scrollTrigger: { trigger: '.landing-footer', start: 'top 95%' },
        y: 40, opacity: 0, duration: 1, ease: 'power2.out',
      })

    }, containerRef)

    return () => ctx.revert()
  }, [containerRef])
}
