/**
 * VantageLogo
 *
 * Renders the Vantage wordmark + abstract mark lockup.
 *
 * Mark spec (Brand Codex):
 *   - Path: M 2 20 L 11 4 L 30 20
 *   - ViewBox: 32×24
 *   - Stroke: 3, square caps, miter joints
 *   - Colour: brand-500 (#3B82F6)
 *
 * Wordmark spec:
 *   - Font: Outfit
 *   - "vant" weight 900, "age" weight 200
 *   - "age" in brand-400 (#60A5FA)
 *
 * Minimum sizes:
 *   - Horizontal lockup: 96px wide
 *   - Mark only: 24px
 */

interface VantageLogoProps {
  /** Width of the horizontal lockup in px. Height scales proportionally. */
  width?: number;
  /** Show mark only (no wordmark). For favicons and tight spaces. */
  markOnly?: boolean;
  /** Override the mark colour. Defaults to brand-500. */
  color?: string;
}

export function VantageLogo({
  width = 160,
  markOnly = false,
  color = 'var(--vt-brand-500)',
}: VantageLogoProps) {
  const markWidth  = markOnly ? width : Math.round(width * 0.22);
  const markHeight = Math.round(markWidth * (24 / 32));
  const fontSize   = Math.round(width * 0.28);

  if (markOnly) {
    return (
      <svg
        width={markWidth}
        height={markHeight}
        viewBox="0 0 32 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Vantage"
        role="img"
      >
        <path
          d="M 2 20 L 11 4 L 30 20"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    );
  }

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        `${Math.round(markWidth * 0.45)}px`,
        userSelect: 'none',
      }}
      aria-label="Vantage"
      role="img"
    >
      {/* Mark */}
      <svg
        width={markWidth}
        height={markHeight}
        viewBox="0 0 32 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M 2 20 L 11 4 L 30 20"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      {/* Wordmark */}
      <span
        style={{
          fontFamily:    'var(--vt-font-display)',
          fontSize:      `${fontSize}px`,
          lineHeight:    1,
          letterSpacing: '-0.03em',
          color:         'var(--vt-text-primary)',
        }}
      >
        <span style={{ fontWeight: 900 }}>vant</span>
        <span style={{ fontWeight: 200, color: 'var(--vt-brand-400)' }}>age</span>
      </span>
    </div>
  );
}
