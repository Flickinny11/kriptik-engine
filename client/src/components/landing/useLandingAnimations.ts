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
      // Hero entrance
      gsap.from('.hero-title', { y: 80, scale: 0.85, opacity: 0, duration: 1.8, ease: 'expo.out', delay: 0.3 })
      gsap.from('.hero-sub', { y: 60, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.8 })
      gsap.from('.hero-cta-group', { y: 50, opacity: 0, scale: 0.9, duration: 1.2, ease: 'expo.out', delay: 1.2 })
      gsap.from('.scroll-indicator', { opacity: 0, y: -20, duration: 1, ease: 'power2.out', delay: 2 })

      // Brain section — reveal from center
      gsap.from('.brain-title', {
        scrollTrigger: { trigger: '.brain-section', start: 'top 70%' },
        scale: 0.4, opacity: 0, y: 80, duration: 1.6, ease: 'expo.out',
      })
      gsap.from('.brain-desc', {
        scrollTrigger: { trigger: '.brain-section', start: 'top 60%' },
        y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', delay: 0.3,
      })

      // Animated stat counters
      gsap.utils.toArray<HTMLElement>('.stat-number').forEach((el) => {
        const target = parseInt(el.dataset.target || '0', 10)
        if (isNaN(target)) return
        const obj = { val: 0 }
        gsap.to(obj, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          val: target, duration: 2, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.val).toString() },
        })
      })

      // Build types — pinned scroll-through
      const buildItems = gsap.utils.toArray<HTMLElement>('.build-item')
      if (buildItems.length > 0) {
        const buildTl = gsap.timeline({
          scrollTrigger: {
            trigger: '.builds-pinned', pin: true, scrub: 1,
            end: () => `+=${window.innerHeight * buildItems.length * 1.2}`,
          },
        })
        buildItems.forEach((item, i) => {
          buildTl.fromTo(item,
            { scale: 0.2, z: -1200, opacity: 0, rotateY: i % 2 === 0 ? -35 : 35 },
            { scale: 1, z: 0, opacity: 1, rotateY: 0, duration: 1, ease: 'power3.out' },
            i * 2
          )
          if (i < buildItems.length - 1) {
            buildTl.to(item,
              { scale: 3.5, z: 1000, opacity: 0, duration: 0.9, ease: 'power3.in' },
              i * 2 + 1.4
            )
          }
        })
      }

      // Capabilities — alternating 3D reveals
      gsap.utils.toArray<HTMLElement>('.cap-item').forEach((item, i) => {
        gsap.from(item, {
          scrollTrigger: { trigger: item, start: 'top 82%', toggleActions: 'play none none reverse' },
          x: i % 2 === 0 ? -500 : 500,
          rotateY: i % 2 === 0 ? -25 : 25,
          opacity: 0, duration: 1.8, ease: 'expo.out',
        })
      })

      // Quality — scale from deep
      gsap.from('.quality-text', {
        scrollTrigger: { trigger: '.quality-section', start: 'top 65%' },
        scale: 0.2, opacity: 0, y: 150, duration: 2, ease: 'expo.out',
      })
      gsap.from('.quality-sub', {
        scrollTrigger: { trigger: '.quality-section', start: 'top 55%' },
        y: 80, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.3,
      })

      // Freedom — parallax blocks
      gsap.utils.toArray<HTMLElement>('.freedom-block').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%', scrub: 1 },
          y: 180 + i * 60, opacity: 0, rotateX: -10,
        })
      })

      // Ship — zoom from infinity
      gsap.from('.ship-title', {
        scrollTrigger: { trigger: '.ship-section', start: 'top 70%' },
        scale: 0.12, opacity: 0, duration: 2.2, ease: 'expo.out',
      })
      gsap.from('.ship-carousel', {
        scrollTrigger: { trigger: '.ship-section', start: 'top 50%' },
        rotateX: 50, y: 300, opacity: 0, duration: 1.8, ease: 'expo.out',
      })

      // Auth + footer
      gsap.from('.auth-section', {
        scrollTrigger: { trigger: '.auth-section', start: 'top 75%' },
        y: 100, scale: 0.92, rotateX: -12, opacity: 0, duration: 1.4, ease: 'expo.out',
      })
      gsap.from('.landing-footer', {
        scrollTrigger: { trigger: '.landing-footer', start: 'top 95%' },
        y: 40, opacity: 0, duration: 1, ease: 'power2.out',
      })
    }, containerRef)

    return () => ctx.revert()
  }, [containerRef])
}
