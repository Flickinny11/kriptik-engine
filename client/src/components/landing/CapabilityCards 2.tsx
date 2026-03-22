/**
 * CapabilityCards — framer-motion enhanced capability section
 *
 * Alternating 3D card reveals with spring physics, hover interactions,
 * and animated gradient borders. Uses framer-motion for all animations.
 * Design_References.md — framer-motion layout + hover
 */

import { motion, useMotionValue, useTransform } from 'framer-motion'
import { VFXSpan } from 'react-vfx'
import { CAPABILITIES } from './LandingComponents'

const cardVariants = {
  hidden: (align: string) => ({
    opacity: 0,
    x: align === 'left' ? -400 : 400,
    rotateY: align === 'left' ? -20 : 20,
    scale: 0.85,
  }),
  visible: {
    opacity: 1, x: 0, rotateY: 0, scale: 1,
    transition: { type: 'spring', stiffness: 50, damping: 18, mass: 1.2 },
  },
}

function CapCard({ cap }: { cap: (typeof CAPABILITIES)[0] }) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const rotateX = useTransform(mouseY, [-0.5, 0.5], [4, -4])
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-4, 4])

  function handleMouseMove(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5)
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  function handleMouseLeave() {
    mouseX.set(0)
    mouseY.set(0)
  }

  return (
    <motion.div
      custom={cap.align}
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.3 }}
      className={`cap-item ${cap.align === 'right' ? 'ml-auto' : 'mr-auto'}`}
      style={{
        maxWidth: '800px',
        transformOrigin: cap.align === 'left' ? 'right center' : 'left center',
        perspective: '1200px',
      }}
    >
      <motion.div
        className="relative group"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      >
        {/* Animated gradient border */}
        <div className="absolute -inset-[1px] rounded-3xl overflow-hidden opacity-60 group-hover:opacity-100 transition-opacity duration-700">
          <div style={{
            position: 'absolute', inset: 0,
            background: `conic-gradient(from 0deg, ${cap.color}30, transparent 40%, ${cap.color}15, transparent 80%, ${cap.color}30)`,
            animation: 'spin 14s linear infinite',
          }} />
        </div>
        <div className="relative rounded-3xl bg-kriptik-black/80 backdrop-blur-xl border border-white/[0.04] p-10 md:p-14"
          style={{ textAlign: cap.align }}>
          {/* Glow orb icon */}
          <motion.div className="mb-8 inline-flex items-center justify-center w-16 h-16 rounded-2xl"
            whileHover={{ scale: 1.15, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 300 }}
            style={{
              background: `linear-gradient(135deg, ${cap.color}12, transparent)`,
              boxShadow: `0 0 40px ${cap.color}15, inset 0 0 20px ${cap.color}08`,
            }}>
            <motion.div className="w-6 h-6 rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              style={{ background: cap.color, boxShadow: `0 0 20px ${cap.color}80` }} />
          </motion.div>
          <h3 className="font-creative font-black tracking-tight"
            style={{
              fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: cap.color,
              textShadow: `0 0 80px ${cap.color}25, 0 0 160px ${cap.color}08`,
              lineHeight: 0.95,
            }}>
            <VFXSpan shader={cap.shader}>{cap.title}</VFXSpan>
          </h3>
          <p className="mt-8 text-lg md:text-xl text-zinc-400 leading-relaxed font-light max-w-lg"
            style={{ marginLeft: cap.align === 'right' ? 'auto' : undefined }}>
            {cap.desc}
          </p>
          <motion.div className="mt-10 h-[2px] rounded-full"
            initial={{ width: 0 }}
            whileInView={{ width: 128 }}
            viewport={{ once: false }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            style={{
              background: `linear-gradient(90deg, ${cap.color}, transparent)`,
              marginLeft: cap.align === 'right' ? 'auto' : undefined,
            }} />
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function CapabilityCards() {
  return (
    <div className="relative z-10 max-w-6xl mx-auto space-y-32">
      {CAPABILITIES.map((cap) => (
        <CapCard key={cap.title} cap={cap} />
      ))}
    </div>
  )
}
