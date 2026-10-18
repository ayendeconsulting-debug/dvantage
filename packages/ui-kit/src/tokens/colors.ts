/**
 * Atlas color tokens — v1.0
 * Single source of truth for every color value in Vantage.
 * Never use raw hex values outside this file.
 */

export const colors = {
  brand: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA', // accent — interactive elements, links
    500: '#3B82F6', // primary — CTAs, brand marks
    600: '#2563EB', // pressed / active state
    700: '#1D4ED8',
    900: '#1E3A8A',
  },

  surface: {
    base: '#050505', // page background
    raised: '#0A0A0A', // cards
    overlay: '#141414', // modals, elevated panels
    border: '#1F1F1F', // dividers, borders
    hover: '#2A2A2A', // hover state
    inverse: '#F4F4F5', // light surfaces (e.g. tooltips on dark)
  },

  text: {
    primary: '#FFFFFF',
    body: '#D4D4D8',
    secondary: '#A1A1AA',
    muted: '#71717A',
    disabled: '#52525B',
  },

  status: {
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
} as const;

export type Colors = typeof colors;
