// ---------------------------------------------------------------------------
// D'Vantage — Side Panel App (D1 hello-world)
//
// Atlas dark theme inlined as style attributes.
// Full AuthGate, ScorePanel, AutofillPanel components built in D2–D5.
//
// Atlas tokens reference (Vantage_Brand_Codex.html):
//   surface-base:  #050505   page background
//   surface-1:     #0A0A0A   cards
//   surface-3:     #1F1F1F   borders
//   text-primary:  #FFFFFF
//   text-muted:    #71717A
//   brand-500:     #3B82F6   mark, D glyph
//   brand-400:     #60A5FA   "age" glyph, interactive
//
// Logo system (locked 13 May 2026):
//   Mark path: M 2 20 L 11 4 L 30 20 on 32×24 viewBox
//   Stroke: 3, strokeLinecap square, strokeLinejoin miter
//   Wordmark: D(900,#3B82F6) + '(200,#FFF) + vant(900,#FFF) + age(200,#60A5FA)
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <div
      style={{
        backgroundColor: '#050505',
        minHeight:       '100vh',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         '32px 24px',
        fontFamily:      'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        boxSizing:       'border-box',
      }}
    >
      {/* ── D'Vantage mark ─────────────────────────────────────── */}
      <svg
        viewBox="0 0 32 24"
        width="48"
        height="36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="D'Vantage mark"
        style={{ marginBottom: '20px' }}
      >
        <path
          d="M 2 20 L 11 4 L 30 20"
          stroke="#3B82F6"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      {/* ── Wordmark ────────────────────────────────────────────── */}
      <div
        style={{
          fontSize:      '26px',
          letterSpacing: '-0.03em',
          lineHeight:    1,
          marginBottom:  '14px',
          userSelect:    'none',
        }}
      >
        <span style={{ fontWeight: 900, color: '#3B82F6' }}>D</span>
        <span style={{ fontWeight: 200, color: '#FFFFFF' }}>&apos;</span>
        <span style={{ fontWeight: 900, color: '#FFFFFF' }}>vant</span>
        <span style={{ fontWeight: 200, color: '#60A5FA' }}>age</span>
      </div>

      {/* ── Tagline ─────────────────────────────────────────────── */}
      <p
        style={{
          fontFamily:    'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize:      '12px',
          fontWeight:    400,
          color:         '#71717A',
          margin:        0,
          letterSpacing: '0.01em',
        }}
      >
        From applied to interview.
      </p>

      {/* ── D1 build marker ─────────────────────────────────────── */}
      <div
        style={{
          marginTop:       '40px',
          padding:         '6px 14px',
          backgroundColor: '#1F1F1F',
          borderRadius:    '6px',
          fontFamily:      'monospace',
          fontSize:        '10px',
          color:           '#71717A',
          letterSpacing:   '0.04em',
        }}
      >
        SCAFFOLD D1 \u00b7 AUTH SHELL NEXT
      </div>
    </div>
  );
}
