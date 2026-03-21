/**
 * DeployGrid — framer-motion enhanced deploy feature cards
 *
 * Uses framer-motion for micro-interactions: hover scale/glow, stagger reveal,
 * spring physics, and layout animations.
 * Design_References.md — framer-motion micro-interactions
 */

import { motion } from 'framer-motion'
import { DEPLOY_FEATURES } from './LandingComponents'

const cardVariants = {
  hidden: { opacity: 0, y: 60, rotateX: -8, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, rotateX: 0, scale: 1,
    transition: {
      delay: i * 0.1,
      type: 'spring', stiffness: 80, damping: 20,
    },
  }),
}

const hoverVariants = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.04, y: -6,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
}

export default function DeployGrid() {
  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount: 0.2 }}
      style={{ willChange: 'transform, opacity', transformStyle: 'preserve-3d' }}
    >
      {DEPLOY_FEATURES.map((feat, i) => (
        <motion.div
          key={feat.title}
          custom={i}
          variants={cardVariants}
          whileHover="hover"
          initial="rest"
          animate="rest"
        >
          <motion.div
            variants={hoverVariants}
            className="relative group rounded-2xl border border-white/[0.04] bg-white/[0.015] p-8 transition-colors duration-500 h-full"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Hover glow */}
            <motion.div
              className="absolute -inset-[1px] rounded-2xl"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              style={{ background: `linear-gradient(135deg, ${feat.color}15, transparent 60%)` }}
            />
            <div className="relative">
              <motion.div
                className="h-1 w-10 rounded-full mb-6"
                style={{ background: feat.color, boxShadow: `0 0 12px ${feat.color}40` }}
                whileHover={{ width: 60, transition: { type: 'spring', stiffness: 200 } }}
              />
              <h4 className="text-lg font-bold mb-3 text-white">{feat.title}</h4>
              <p className="text-sm text-zinc-500 leading-relaxed">{feat.desc}</p>
            </div>
          </motion.div>
        </motion.div>
      ))}
    </motion.div>
  )
}
