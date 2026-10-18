/**
 * @vantage/ui-kit — Atlas design tokens
 * packages/ui-kit/src/tokens/index.ts
 *
 * Vantage · Atlas theme · v1.0
 *
 * This is the single source of truth for the entire design system.
 * All colors, typography, spacing, radius, and motion values live here.
 *
 * Consumers:
 *   - apps/web  → imports CSS_VARIABLES into globals.css :root block
 *   - Components → import named tokens directly (colors, spacing, etc.)
 *
 * Rule: never use a raw hex, px, or timing value in a component.
 *       Always import from here.
 */

export { colors, type Colors } from './colors';
export { typography, type Typography, GOOGLE_FONTS_URL } from './typography';
export { spacing, type Spacing, type SpacingKey } from './spacing';
export { radius, type Radius, type RadiusKey } from './radius';
export { motion, type Motion, transitions } from './motion';

import { colors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { motion } from './motion';

export const tokens = { colors, typography, spacing, radius, motion } as const;
export type Tokens = typeof tokens;

// ─── CSS Custom Property Map ──────────────────────────────────────────────────
// Flat map of CSS variable name → value.
// Used in apps/web/src/styles/globals.css to set :root variables.
// Naming convention: --vt-{category}-{key}

export const CSS_VARIABLES: Record<string, string> = {
  // Brand
  '--vt-brand-50': colors.brand[50],
  '--vt-brand-100': colors.brand[100],
  '--vt-brand-200': colors.brand[200],
  '--vt-brand-300': colors.brand[300],
  '--vt-brand-400': colors.brand[400],
  '--vt-brand-500': colors.brand[500],
  '--vt-brand-600': colors.brand[600],
  '--vt-brand-700': colors.brand[700],
  '--vt-brand-900': colors.brand[900],

  // Surface
  '--vt-surface-base': colors.surface.base,
  '--vt-surface-raised': colors.surface.raised,
  '--vt-surface-overlay': colors.surface.overlay,
  '--vt-surface-border': colors.surface.border,
  '--vt-surface-hover': colors.surface.hover,
  '--vt-surface-inverse': colors.surface.inverse,

  // Text
  '--vt-text-primary': colors.text.primary,
  '--vt-text-body': colors.text.body,
  '--vt-text-secondary': colors.text.secondary,
  '--vt-text-muted': colors.text.muted,
  '--vt-text-disabled': colors.text.disabled,

  // Status
  '--vt-status-success': colors.status.success,
  '--vt-status-danger': colors.status.danger,
  '--vt-status-warning': colors.status.warning,
  '--vt-status-info': colors.status.info,

  // Typography — families
  '--vt-font-display': typography.family.display,
  '--vt-font-body': typography.family.body,
  '--vt-font-mono': typography.family.mono,

  // Typography — sizes
  '--vt-text-xs': typography.size.xs,
  '--vt-text-sm': typography.size.sm,
  '--vt-text-base': typography.size.base,
  '--vt-text-md': typography.size.md,
  '--vt-text-lg': typography.size.lg,
  '--vt-text-xl': typography.size.xl,
  '--vt-text-2xl': typography.size['2xl'],
  '--vt-text-3xl': typography.size['3xl'],
  '--vt-text-4xl': typography.size['4xl'],
  '--vt-text-5xl': typography.size['5xl'],
  '--vt-text-6xl': typography.size['6xl'],
  '--vt-text-display': typography.size.display,

  // Spacing
  '--vt-space-1': spacing[1],
  '--vt-space-2': spacing[2],
  '--vt-space-3': spacing[3],
  '--vt-space-4': spacing[4],
  '--vt-space-5': spacing[5],
  '--vt-space-6': spacing[6],
  '--vt-space-7': spacing[7],
  '--vt-space-8': spacing[8],
  '--vt-space-9': spacing[9],
  '--vt-space-10': spacing[10],

  // Radius
  '--vt-radius-1': radius[1],
  '--vt-radius-2': radius[2],
  '--vt-radius-3': radius[3],
  '--vt-radius-4': radius[4],
  '--vt-radius-5': radius[5],
  '--vt-radius-full': radius.full,

  // Motion — duration
  '--vt-duration-fast': motion.duration.fast,
  '--vt-duration-base': motion.duration.base,
  '--vt-duration-slow': motion.duration.slow,
  '--vt-duration-deliberate': motion.duration.deliberate,

  // Motion — easing
  '--vt-ease-standard': motion.easing.standard,
  '--vt-ease-out': motion.easing.out,
  '--vt-ease-in': motion.easing.in,
};

/**
 * Generates the full :root { ... } CSS block as a string.
 */
export function generateCSSVariablesBlock(): string {
  const vars = Object.entries(CSS_VARIABLES)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
  return `:root {\n${vars}\n}`;
}
