/**
 * Motion tokens for consistent animations across the app
 * Respects prefers-reduced-motion via useReducedMotion hook
 */

// Duration tokens (in seconds)
export const duration = {
  instant: 0.1,
  micro: 0.15,      // micro-interactions: buttons, toggles
  fast: 0.2,        // fast transitions
  normal: 0.25,     // standard transitions
  slow: 0.32,       // panels, modals, page transitions
} as const;

// Easing tokens
export const easing = {
  easeOut: [0.0, 0.0, 0.2, 1],
  easeIn: [0.4, 0.0, 1, 1],
  easeInOut: [0.4, 0.0, 0.2, 1],
  spring: { type: "spring", stiffness: 400, damping: 30 },
  springGentle: { type: "spring", stiffness: 300, damping: 25 },
  springBouncy: { type: "spring", stiffness: 500, damping: 20 },
} as const;

// Distance tokens (in pixels)
export const distance = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const;

// Stagger delay (in seconds)
export const stagger = {
  fast: 0.02,
  normal: 0.03,
  slow: 0.04,
} as const;

// Common animation variants
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: duration.normal, ease: easing.easeOut },
};

export const fadeSlideUp = {
  initial: { opacity: 0, y: distance.sm },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: distance.sm },
};

export const fadeSlideDown = {
  initial: { opacity: 0, y: -distance.sm },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -distance.sm },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const slideInRight = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};

export const slideInLeft = {
  initial: { x: "-100%" },
  animate: { x: 0 },
  exit: { x: "-100%" },
};

// Page transition variant
export const pageTransition = {
  initial: { opacity: 0, y: distance.sm },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: duration.slow, ease: easing.easeOut }
  },
  exit: { 
    opacity: 0, 
    y: -distance.xs,
    transition: { duration: duration.fast, ease: easing.easeIn }
  },
};

// Stagger container for lists
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: stagger.normal,
    },
  },
};

// Stagger item
export const staggerItem = {
  initial: { opacity: 0, y: distance.sm },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: duration.normal, ease: easing.easeOut }
  },
};

// Button press animation
export const buttonPress = {
  whileTap: { scale: 0.98 },
  whileHover: { scale: 1.01 },
  transition: { duration: duration.micro },
};
