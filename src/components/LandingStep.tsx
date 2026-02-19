"use client";

import { motion } from "framer-motion";

import { getTransition, getVariants, springs } from "@/lib/motion";

/** Props for the landing step component (matches component-contracts.ts) */
interface LandingStepProps {
  /** Called when the user clicks "Begin" */
  onBegin: () => void;
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
}

/**
 * Step 1: Character Introduction / Landing page.
 *
 * Full-screen dark landing introducing R.J. Carrington III with staggered
 * entrance animations. Uses a dark background (bg-text-primary) with light
 * text for an imposing, theatrical reveal.
 *
 * Motion perspective: Jakub Krehel 60% / Jhey Tompkins 40% --
 * first-reveal hero moment with production polish and brand expression.
 */
export default function LandingStep({
  onBegin,
  prefersReducedMotion,
}: LandingStepProps) {
  /* Stagger configuration: each child enters sequentially with a 0.12s gap.
     Slower than typical UI stagger to build theatrical tension. */
  const staggerDelay = prefersReducedMotion ? 0 : 0.12;
  const baseTransition = getTransition(prefersReducedMotion, {
    ...springs.gentle,
    duration: 0.7,
  });

  /* Build variants for each staggered element. For reduced motion,
     getVariants returns simple opacity-only transitions. */
  const itemVariants = getVariants(prefersReducedMotion, {
    initial: { opacity: 0, y: 16, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  });

  return (
    <div className="flex w-full flex-1 items-center justify-center bg-text-primary px-4 py-12 md:py-16">
      <div className="flex max-w-xl flex-col items-center text-center">
        {/* Boss name -- dominant visual element */}
        <motion.h2
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 0 }}
          className="font-rubik text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl"
          tabIndex={-1}
        >
          R.J. Carrington III
        </motion.h2>

        {/* Subtitle -- role and company */}
        <motion.p
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 1 }}
          className="mt-4 font-inter text-lg text-white/70"
        >
          Founder & CEO of Carrington Industries
        </motion.p>

        {/* Decorative separator */}
        <motion.div
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 2 }}
          className="mt-8 h-px w-16 bg-white/20"
          aria-hidden="true"
        />

        {/* Stats line */}
        <motion.p
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 3 }}
          className="mt-8 font-inter text-base tracking-wide text-white/60"
        >
          30 years. 40,000 interviews. 12 hires.
        </motion.p>

        {/* Challenge text */}
        <motion.p
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 4 }}
          className="mt-6 font-rubik text-xl text-white/90 md:text-2xl"
        >
          Think you can survive the world's hardest job interview?
        </motion.p>

        {/* Begin button */}
        <motion.div
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 5 }}
          className="mt-10"
        >
          <motion.button
            onClick={onBegin}
            whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            transition={getTransition(prefersReducedMotion, {
              type: "spring",
              duration: 0.3,
              bounce: 0,
            })}
            className="cursor-pointer rounded-lg bg-white px-8 py-3.5 font-inter text-sm font-semibold leading-5 text-text-primary transition-colors duration-150 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-text-primary"
          >
            Begin
          </motion.button>
        </motion.div>

        {/* Taluna attribution */}
        <motion.p
          initial={itemVariants.initial}
          animate={itemVariants.animate}
          transition={{ ...baseTransition, delay: staggerDelay * 6 }}
          className="mt-12 font-inter text-xs tracking-wide text-white/40"
        >
          A Taluna experience
        </motion.p>
      </div>
    </div>
  );
}
