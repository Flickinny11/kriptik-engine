/**
 * GSAP ScrollTrigger animations for the landing page.
 * Extracted for modularity (500-line limit).
 *
 * Design_References.md §6 — ScrollTrigger pinned scrub, parallax, 3D reveals
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

      // ── Brain section — dramatic reveal ──
      gsap.from('.brain-title', {
        scrollTrigger: { trigger: '.brain-section', start: 'top 75%', toggleActions: 'play none none reverse' },
        scale: 0.3, opacity: 0, y: 100, rotateX: -20, duration: 1.8, ease: 'expo.out',
      })
      gsap.from('.brain-desc', {
        scrollTrigger: { trigger: '.brain-section', start: 'top 60%', toggleActions: 'play none none reverse' },
        y: 60, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.2,
      })

      // ── Animated stat counters ──
      gsap.utils.toArray<HTMLElement>('.stat-number').forEach((el) => {
        const target = parseInt(el.dataset.target || '0', 10)
        if (isNaN(target)) return
        const obj = { val: 0 }
        gsap.to(obj, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          val: target, duration: 2.5, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.val).toString() },
        })
      })

      // ── Build types — pinned scroll-through with deeper 3D ──
      const buildItems = gsap.utils.toArray<HTMLElement>('.build-item')
      if (buildItems.length > 0) {
        const buildTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.builds-pinned', pin: true, scrub: 0.8,
            end: () => `+=${window.innerHeight * buildItems.length * 1.4}`,
          },
        })
        buildItems.forEach((item, i) => {
          buildTl.fromTo(item,
            { scale: 0.15, z: -1500, opacity: 0, rotateY: i % 2 === 0 ? -40 : 40, rotateX: -10 },
            { scale: 1, z: 0, opacity: 1, rotateY: 0, rotateX: 0, duration: 1.2, ease: 'power3.out' },
            i * 2,
          )
          if (i < buildItems.length - 1) {
            buildTl.to(item,
              { scale: 4, z: 1200, opacity: 0, rotateY: i % 2 === 0 ? 15 : -15, duration: 1, ease: 'power3.in' },
              i * 2 + 1.5,
            )
          }
        })
      }

      // ── Capabilities — alternating 3D card reveals ──
      gsap.utils.toArray<HTMLElement>('.cap-item').forEach((item, i) => {
        gsap.from(item, {
          scrollTrigger: { trigger: item, start: 'top 85%', toggleActions: 'play none none reverse' },
          x: i % 2 === 0 ? -600 : 600,
          rotateY: i % 2 === 0 ? -30 : 30,
          scale: 0.8,
          opacity: 0, duration: 2, ease: 'expo.out',
        })
      })

      // ── Quality — dramatic zoom + bar animations ──
      gsap.from('.quality-text', {
        scrollTrigger: { trigger: '.quality-section', start: 'top 65%', toggleActions: 'play none none reverse' },
        scale: 0.15, opacity: 0, y: 200, rotateX: -25, duration: 2.2, ease: 'expo.out',
      })
      gsap.from('.quality-sub', {
        scrollTrigger: { trigger: '.quality-section', start: 'top 55%', toggleActions: 'play none none reverse' },
        y: 100, opacity: 0, duration: 1.6, ease: 'expo.out', delay: 0.3,
      })

      // Quality comparison bars
      gsap.utils.toArray<HTMLElement>('.quality-bar').forEach((bar) => {
        const targetWidth = bar.dataset.width || '50'
        gsap.to(bar, {
          scrollTrigger: { trigger: bar, start: 'top 90%' },
          width: `${targetWidth}%`, duration: 1.8, ease: 'power3.out', delay: 0.5,
        })
      })

      // ── Deploy — staggered parallax blocks ──
      gsap.utils.toArray<HTMLElement>('.freedom-block').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
          y: 120 + i * 40, opacity: 0, rotateX: -8, scale: 0.95,
          duration: 1.6, ease: 'expo.out',
        })
      })

      // ── Ship — zoom from infinity ──
      gsap.from('.ship-title', {
        scrollTrigger: { trigger: '.ship-section', start: 'top 70%', toggleActions: 'play none none reverse' },
        scale: 0.08, opacity: 0, rotateX: -20, duration: 2.4, ease: 'expo.out',
      })
      gsap.from('.ship-carousel', {
        scrollTrigger: { trigger: '.ship-section', start: 'top 50%', toggleActions: 'play none none reverse' },
        rotateX: 60, y: 400, opacity: 0, duration: 2, ease: 'expo.out',
      })

      // ── Auth + footer ──
      gsap.from('.auth-section', {
        scrollTrigger: { trigger: '.auth-section', start: 'top 78%', toggleActions: 'play none none reverse' },
        y: 120, scale: 0.9, rotateX: -15, opacity: 0, duration: 1.6, ease: 'expo.out',
      })
      gsap.from('.landing-footer', {
        scrollTrigger: { trigger: '.landing-footer', start: 'top 95%' },
        y: 40, opacity: 0, duration: 1, ease: 'power2.out',
      })
    }, containerRef)

    return () => ctx.revert()
  }, [containerRef])
}
