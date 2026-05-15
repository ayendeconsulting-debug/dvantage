/**
 * Atlas spacing tokens — v1.0
 * 4px base unit. Steps 1–10.
 * Never use arbitrary px values in components — always reference these.
 */

export const spacing = {
  0:  '0',
  1:  '4px',    // tight inline gap
  2:  '8px',    // compact spacing
  3:  '12px',   // small gap
  4:  '16px',   // default padding
  5:  '24px',   // comfortable gap
  6:  '32px',   // section internal padding
  7:  '48px',   // between major sections
  8:  '64px',   // large vertical rhythm
  9:  '96px',   // section padding
  10: '128px',  // hero / max vertical breath
} as const;

export type Spacing = typeof spacing;
export type SpacingKey = keyof typeof spacing;
