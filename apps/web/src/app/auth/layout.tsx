import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { DVantageLogo } from '@/components/logo/dvantage-logo';

export const metadata: Metadata = {
  title: {
    default: "D'Vantage",
    template: "%s · D'Vantage",
  },
};

// ---------------------------------------------------------------------------
// IllustrationPanel
//
// SVG has no background fill — the CSS grid on .vt-auth-left shows through.
// This matches the Faustus pattern: grid is a CSS linear-gradient behind
// the SVG, not embedded inside it.
// ---------------------------------------------------------------------------

function IllustrationPanel() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 480 800"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* ═══════════════════════════════════════════════════════
          LINES — solid and dashed connectors between nodes
          ═══════════════════════════════════════════════════ */}

      {/* Background crossing diagonal — very faint, creates X tension */}
      <line x1="460" y1="18" x2="22" y2="748" stroke="rgba(59,130,246,0.09)" strokeWidth="1" />

      {/* Top-left corner → RESUME → PARSE */}
      <line x1="22" y1="22" x2="65" y2="132" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
      <line x1="65" y1="132" x2="185" y2="300" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />

      {/* Top-right corner → PARSE */}
      <line x1="460" y1="18" x2="185" y2="300" stroke="rgba(59,130,246,0.22)" strokeWidth="1" />

      {/* PARSE → SCORE */}
      <line x1="185" y1="300" x2="305" y2="458" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />

      {/* PARSE → right edge (solid horizontal) */}
      <line x1="185" y1="300" x2="460" y2="300" stroke="rgba(59,130,246,0.22)" strokeWidth="1" />

      {/* SCORE → MATCH */}
      <line x1="305" y1="458" x2="390" y2="605" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />

      {/* SCORE → right edge (dashed horizontal) */}
      <line
        x1="305"
        y1="458"
        x2="460"
        y2="458"
        stroke="rgba(59,130,246,0.18)"
        strokeWidth="1"
        strokeDasharray="5 5"
      />

      {/* Left edge → MATCH (dashed horizontal) */}
      <line
        x1="22"
        y1="605"
        x2="390"
        y2="605"
        stroke="rgba(59,130,246,0.14)"
        strokeWidth="1"
        strokeDasharray="4 6"
      />

      {/* MATCH → lower-right continuation */}
      <line x1="390" y1="605" x2="460" y2="660" stroke="rgba(59,130,246,0.22)" strokeWidth="1" />

      {/* ═══════════════════════════════════════════════════════
          WAYPOINT DOTS — signal markers at line endpoints
          ═══════════════════════════════════════════════════ */}

      <circle cx="22" cy="22" r="3.5" fill="rgba(59,130,246,0.45)" />
      <circle cx="460" cy="18" r="3.5" fill="rgba(59,130,246,0.45)" />
      <circle cx="460" cy="300" r="3.5" fill="rgba(59,130,246,0.45)" />
      <circle cx="460" cy="458" r="3.5" fill="rgba(59,130,246,0.35)" />
      <circle cx="22" cy="605" r="3.5" fill="rgba(59,130,246,0.35)" />
      <circle cx="460" cy="660" r="3.5" fill="rgba(59,130,246,0.45)" />

      {/* ═══════════════════════════════════════════════════════
          RESUME — small labeled endpoint node
          ═══════════════════════════════════════════════════ */}

      <circle cx="65" cy="132" r="13" fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="1" />
      <circle cx="65" cy="132" r="5" fill="rgba(59,130,246,0.5)" />
      <circle cx="65" cy="132" r="2.5" fill="#60A5FA" />
      <text
        x="83"
        y="128"
        fontSize="9"
        fontFamily="Geist Mono,monospace"
        fill="rgba(96,165,250,0.85)"
        letterSpacing="0.13em"
      >
        RESUME
      </text>
      <text
        x="83"
        y="141"
        fontSize="8"
        fontFamily="Geist Mono,monospace"
        fill="rgba(59,130,246,0.35)"
        letterSpacing="0.09em"
      >
        NODE_01
      </text>

      {/* ═══════════════════════════════════════════════════════
          PARSE — primary active node (three concentric rings)
          ═══════════════════════════════════════════════════ */}

      <circle
        cx="185"
        cy="300"
        r="54"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1"
        className="vt-ring-outer"
      />
      <circle
        cx="185"
        cy="300"
        r="40"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1"
        className="vt-ring-mid"
      />
      <circle
        cx="185"
        cy="300"
        r="27"
        fill="none"
        stroke="rgba(59,130,246,0.5)"
        strokeWidth="1.5"
      />
      <circle cx="185" cy="300" r="8" fill="rgba(59,130,246,0.85)" />
      <circle cx="185" cy="300" r="3.5" fill="#93C5FD" />
      <text
        x="216"
        y="296"
        fontSize="10"
        fontFamily="Geist Mono,monospace"
        fill="rgba(96,165,250,0.9)"
        letterSpacing="0.13em"
      >
        PARSE
      </text>
      <text
        x="216"
        y="310"
        fontSize="8"
        fontFamily="Geist Mono,monospace"
        fill="rgba(59,130,246,0.38)"
        letterSpacing="0.09em"
      >
        AI · EXTRACT
      </text>

      {/* ═══════════════════════════════════════════════════════
          SCORE — secondary active node (three rings, staggered)
          ═══════════════════════════════════════════════════ */}

      <circle
        cx="305"
        cy="458"
        r="50"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1"
        className="vt-ring-outer vt-ring-delay-1"
      />
      <circle
        cx="305"
        cy="458"
        r="36"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1"
        className="vt-ring-mid vt-ring-delay-1"
      />
      <circle
        cx="305"
        cy="458"
        r="24"
        fill="none"
        stroke="rgba(59,130,246,0.5)"
        strokeWidth="1.5"
      />
      <circle cx="305" cy="458" r="8" fill="rgba(59,130,246,0.85)" />
      <circle cx="305" cy="458" r="3.5" fill="#93C5FD" />
      <text
        x="334"
        y="454"
        fontSize="10"
        fontFamily="Geist Mono,monospace"
        fill="rgba(96,165,250,0.9)"
        letterSpacing="0.13em"
      >
        SCORE
      </text>
      <text
        x="334"
        y="468"
        fontSize="8"
        fontFamily="Geist Mono,monospace"
        fill="rgba(59,130,246,0.38)"
        letterSpacing="0.09em"
      >
        ATS · RANK
      </text>

      {/* ═══════════════════════════════════════════════════════
          MATCH — tertiary active node (two rings, most delayed)
          ═══════════════════════════════════════════════════ */}

      <circle
        cx="390"
        cy="605"
        r="38"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1"
        className="vt-ring-outer vt-ring-delay-2"
      />
      <circle cx="390" cy="605" r="26" fill="none" stroke="rgba(59,130,246,0.4)" strokeWidth="1" />
      <circle
        cx="390"
        cy="605"
        r="17"
        fill="none"
        stroke="rgba(59,130,246,0.5)"
        strokeWidth="1.5"
      />
      <circle cx="390" cy="605" r="6" fill="rgba(59,130,246,0.85)" />
      <circle cx="390" cy="605" r="2.5" fill="#93C5FD" />
      <text
        x="412"
        y="601"
        fontSize="10"
        fontFamily="Geist Mono,monospace"
        fill="rgba(96,165,250,0.85)"
        letterSpacing="0.13em"
      >
        MATCH
      </text>
      <text
        x="412"
        y="615"
        fontSize="8"
        fontFamily="Geist Mono,monospace"
        fill="rgba(59,130,246,0.38)"
        letterSpacing="0.09em"
      >
        JOB · FIT
      </text>

      {/* ═══════════════════════════════════════════════════════
          BRAND — bottom-left lockup
          ═══════════════════════════════════════════════════ */}

      <text
        x="28"
        y="668"
        fontSize="9"
        fontFamily="Geist Mono,monospace"
        fill="rgba(59,130,246,0.28)"
        letterSpacing="0.16em"
      >
        D'VANTAGE INTELLIGENCE
      </text>
      <text
        x="28"
        y="696"
        fontSize="23"
        fontWeight="700"
        fontFamily="Outfit,sans-serif"
        fill="#F2F6FF"
        letterSpacing="-0.5"
      >
        Resume.
      </text>
      <text
        x="28"
        y="724"
        fontSize="23"
        fontWeight="700"
        fontFamily="Outfit,sans-serif"
        fill="#60A5FA"
        letterSpacing="-0.5"
      >
        Intelligently
      </text>
      <text
        x="28"
        y="752"
        fontSize="23"
        fontWeight="700"
        fontFamily="Outfit,sans-serif"
        fill="#F2F6FF"
        letterSpacing="-0.5"
      >
        scored.
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        /* ── Shell ── */
        .vt-auth-shell {
          display: flex;
          min-height: 100vh;
        }

        /* ── Left panel — CSS grid background + SVG nodes on top ── */
        /* Grid approach mirrors Faustus: background-image linear-gradient */
        .vt-auth-left {
          width: 44%;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;

          /* Base colour */
          background-color: #010305;

          /* Fine grid overlay — brand blue at 6% opacity, 48px cells */
          background-image:
            linear-gradient(rgba(59, 130, 246, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.06) 1px, transparent 1px);
          background-size: 48px 48px;

          /* Right border acts as a soft separator */
          border-right: 1px solid rgba(59, 130, 246, 0.08);
        }

        /* ── Right panel — near-black, no texture, maximum contrast ── */
        .vt-auth-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;

          /* Darker than left panel — no grid, no texture, pure depth */
          background-color: #000000;

          padding: 48px 40px 96px;
        }

        /* Centred column */
        .vt-auth-inner {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }
        .vt-auth-form { width: 100%; }

        /* ── Node pulse animations ── */
        @keyframes vt-pulse-outer {
          0%, 100% { opacity: 0.12; }
          50%       { opacity: 0.03; }
        }
        @keyframes vt-pulse-mid {
          0%, 100% { opacity: 0.28; }
          50%       { opacity: 0.09; }
        }

        .vt-ring-outer {
          animation: vt-pulse-outer 4s ease-in-out infinite;
        }
        .vt-ring-mid {
          animation: vt-pulse-mid 4s ease-in-out infinite 0.65s;
        }

        /* Each active node starts its pulse at a different phase */
        .vt-ring-delay-1 { animation-delay: 1.3s; }
        .vt-ring-delay-2 { animation-delay: 2.6s; }

        /* ── Mobile: hide illustration, full-width form ── */
        @media (max-width: 768px) {
          .vt-auth-left  { display: none; }
          .vt-auth-right { padding: 40px 20px; }
        }
      `}</style>

      <div className="vt-auth-shell">
        {/* Left — illustration sits on top of CSS grid */}
        <aside className="vt-auth-left" aria-hidden="true">
          <IllustrationPanel />
        </aside>

        {/* Right — near-black, form centred */}
        <main className="vt-auth-right">
          <div className="vt-auth-inner">
            <Link href="/" style={logoLink} aria-label="D'Vantage home">
              <DVantageLogo width={132} />
            </Link>

            <div className="vt-auth-form">{children}</div>

            <p style={footer}>From applied to interview.</p>
          </div>
        </main>
      </div>
    </>
  );
}

const logoLink: React.CSSProperties = {
  display: 'inline-flex',
  textDecoration: 'none',
};

const footer: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-xs)',
  color: 'var(--vt-text-disabled)',
  margin: 0,
  letterSpacing: '0.01em',
};
