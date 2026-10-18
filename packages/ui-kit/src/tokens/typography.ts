/**
 * Atlas typography tokens — v1.0
 *
 * Three families, each with a strict purpose:
 *   Display (Outfit)  — headings, wordmark, large UI numbers
 *   Body    (DM Sans) — all prose, labels, inputs
 *   Mono (Geist Mono) — code, scores, data values, monospaced labels
 */

export const typography = {
  family: {
    display: "'Outfit', sans-serif",
    body: "'DM Sans', sans-serif",
    mono: "'Geist Mono', monospace",
  },

  /**
   * Font size scale.
   * Use named steps — never raw px values in components.
   */
  size: {
    xs: '11px', // micro labels, badges
    sm: '12px', // captions, timestamps, helper text
    base: '14px', // default body
    md: '16px', // comfortable reading
    lg: '18px', // lead text, card intros
    xl: '20px', // section intros
    '2xl': '24px', // small headings
    '3xl': '30px', // medium headings
    '4xl': '36px', // large headings
    '5xl': '48px', // hero subheadings
    '6xl': '60px', // hero headings
    '7xl': '72px', // display / wordmark size
    display: '64px', // section title canonical size (matches brand codex)
  },

  /**
   * Line height scale.
   */
  leading: {
    none: '1',
    tight: '1.15',
    snug: '1.3',
    normal: '1.5',
    relaxed: '1.625',
    loose: '1.75',
  },

  /**
   * Letter spacing.
   */
  tracking: {
    tighter: '-0.04em', // display headings
    tight: '-0.02em', // large headings
    normal: '0',
    wide: '0.05em', // uppercase labels
    wider: '0.1em',
    widest: '0.2em', // mono section labels (e.g. "01 · OVERVIEW")
  },

  /**
   * Font weights available in each family.
   * Outfit: 200, 500, 600, 700, 900
   * DM Sans: 400, 500
   * Geist Mono: 400, 500
   */
  weight: {
    thin: 200,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },
} as const;

export type Typography = typeof typography;

/**
 * Google Fonts URL for Next.js <link> tag.
 * Loads all three families with the required weights in one request.
 */
export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Outfit:wght@200;500;600;700;900&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&family=Geist+Mono:wght@400;500&display=swap';
