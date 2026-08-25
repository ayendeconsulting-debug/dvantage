/**
 * DVantageLogo
 *
 * Renders the D'Vantage wordmark + abstract mark lockup.
 *
 * Locked brand spec (approved May 2026):
 *
 *   Mark:
 *     Path:    M 2 20 L 11 4 L 30 20
 *     ViewBox: 32×24
 *     Stroke:  3, square linecap, miter linejoin
 *     Colour:  var(--vt-brand-500)
 *
 *   Wordmark:
 *     "D"    — Outfit 900, var(--vt-brand-500)   (matches mark)
 *     "'"    — Outfit 200, var(--vt-text-primary)
 *     "vant" — Outfit 900, var(--vt-text-primary)
 *     "age"  — Outfit 200, var(--vt-brand-400)    (one step lighter)
 *
 * Internal packages stay @vantage/* — internal names, not user-facing.
 */

interface DVantageLogoProps {
  width?: number;
  markOnly?: boolean;
}

export function DVantageLogo({ width = 160, markOnly = false }: DVantageLogoProps) {
  const markWidth = markOnly ? width : Math.round(width * 0.22);
  const markHeight = Math.round(markWidth * (24 / 32));
  const fontSize = Math.round(width * 0.28);
  const gap = Math.round(markWidth * 0.45);

  if (markOnly) {
    return (
      <svg
        width={markWidth}
        height={markHeight}
        viewBox="0 0 32 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="D'Vantage"
        role="img"
      >
        <path
          d="M 2 20 L 11 4 L 30 20"
          stroke="var(--vt-brand-500)"
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
        display: 'flex',
        alignItems: 'center',
        gap: `${gap}px`,
        userSelect: 'none',
      }}
      aria-label="D'Vantage"
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
          stroke="var(--vt-brand-500)"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      {/* Wordmark — single element, tspan segments, no gaps */}
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--vt-font-display)',
          fontSize: `${fontSize}px`,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          display: 'inline-block',
        }}
      >
        <span style={{ fontWeight: 900, color: 'var(--vt-brand-500)' }}>D</span>
        <span style={{ fontWeight: 200, color: 'var(--vt-text-primary)' }}>'</span>
        <span style={{ fontWeight: 900, color: 'var(--vt-text-primary)' }}>vant</span>
        <span style={{ fontWeight: 200, color: 'var(--vt-brand-400)' }}>age</span>
      </span>
    </div>
  );
}
