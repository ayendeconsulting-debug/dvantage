/**
 * Atlas radius tokens — v1.0
 *
 * Usage guidelines:
 *   radius[1]    — subtle rounding, tags, tight chips
 *   radius[2]    — default for most elements
 *   radius[3]    — buttons, inputs, form controls
 *   radius[4]    — cards, panels
 *   radius[5]    — modals, drawers, larger surfaces
 *   radius.full  — pills, avatar badges, circular indicators
 */

export const radius = {
  none: '0',
  1: '2px',
  2: '4px',
  3: '8px', // buttons, inputs
  4: '12px', // cards
  5: '16px', // modals
  full: '999px', // pills
} as const;

export type Radius = typeof radius;
export type RadiusKey = keyof typeof radius;
