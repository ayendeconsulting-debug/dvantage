/**
 * Atlas motion tokens — v1.0
 *
 * Duration guidelines:
 *   fast       (120ms) — hover, focus ring, icon swap
 *   base       (200ms) — most UI transitions (default)
 *   slow       (320ms) — page transitions, score reveal animations
 *   deliberate (560ms) — high-value reveals only (ATS score counter, onboarding)
 *
 * Easing guidelines:
 *   standard — default for most transitions
 *   out      — elements entering the screen
 *   in       — elements leaving the screen
 *
 * Rule: deliberate is reserved for moments that earn attention.
 * Overusing it kills the effect.
 */

export const motion = {
  duration: {
    fast:       '120ms',
    base:       '200ms',
    slow:       '320ms',
    deliberate: '560ms',
  },

  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',  // default
    out:      'cubic-bezier(0, 0, 0.2, 1)',     // entering elements
    in:       'cubic-bezier(0.4, 0, 1, 1)',     // exiting elements
  },
} as const;

export type Motion = typeof motion;

/**
 * Convenience transition strings for common use cases.
 * Import these directly into style props or CSS-in-JS.
 *
 * @example
 *   style={{ transition: transitions.default }}
 */
export const transitions = {
  default:   `all ${motion.duration.base} ${motion.easing.standard}`,
  fast:      `all ${motion.duration.fast} ${motion.easing.standard}`,
  slow:      `all ${motion.duration.slow} ${motion.easing.standard}`,
  enter:     `all ${motion.duration.base} ${motion.easing.out}`,
  exit:      `all ${motion.duration.base} ${motion.easing.in}`,
  color:     `color ${motion.duration.fast} ${motion.easing.standard}, background-color ${motion.duration.fast} ${motion.easing.standard}`,
  transform: `transform ${motion.duration.base} ${motion.easing.out}`,
} as const;
