/**
 * Motion configuration presets for Framer Motion animations
 * Based on the design system's motion philosophy:
 * - Emil Kowalski (50%): Restraint and speed for productivity
 * - Jakub Krehel (40%): Production polish for hero moments
 * - Jhey Tompkins (10%): Creative touches for brand expression
 */

import type { Transition } from "framer-motion";

/**
 * Animation target values (opacity, y, scale, filter, etc.).
 * Framer Motion's TargetAndTransition type lives in the transitive
 * dependency `motion-dom` and is not re-exported by `framer-motion`,
 * so we define a local type covering the string | number values
 * actually used in this codebase.
 */
type AnimationTarget = Record<string, string | number>;

// Spring configurations
export const springs = {
  // Professional, snappy (default for UI elements)
  snappy: {
    type: "spring" as const,
    duration: 0.45,
    bounce: 0,
  },

  // Gentle, organic (for step transitions, larger movements)
  gentle: {
    type: "spring" as const,
    duration: 0.6,
    bounce: 0.1,
  },

  // Bouncy (for celebratory moments — use sparingly)
  bouncy: {
    type: "spring" as const,
    duration: 0.5,
    bounce: 0.3,
  },
};

// Enter animation recipe (default)
export const defaultEnter = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0)" },
  transition: springs.snappy,
};

// Exit animation recipe
export const defaultExit = {
  exit: { opacity: 0, scale: 0.98, filter: "blur(2px)" },
  transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
};

// Fade in/out (simpler, for text changes)
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

// Slide up (for buttons, cards appearing from below)
export const slideUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: springs.gentle,
};

// Scale in (for icons, success indicators)
export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: springs.bouncy,
};

// Stagger children helper
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

// Get transition based on reduced motion preference
export function getTransition(prefersReducedMotion: boolean, baseTransition: Transition): Transition {
  return prefersReducedMotion
    ? { duration: 0.01 }
    : baseTransition;
}

// Get variants based on reduced motion preference
export function getVariants(
  prefersReducedMotion: boolean,
  variants: {
    initial: AnimationTarget;
    animate: AnimationTarget;
    exit?: AnimationTarget;
  }
) {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  return variants;
}
