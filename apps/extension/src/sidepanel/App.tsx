// ---------------------------------------------------------------------------
// D'Vantage — Side Panel App
//
// Fonts + Atlas tokens are loaded in index.tsx before this module executes.
// All colour values reference CSS custom properties — no inline hex literals.
//
// Structure:
//   App
//   └── AuthGate            (unauthenticated → sign-in screen)
//       ├── ProfilePanel    (D5: profile header — name, email, plan, sign-out)
//       └── ScorePanel      (D6: job detection + ATS scoring)
//
// D6: ScorePanel added. Renders below ProfilePanel when authenticated.
//   - Empty state when no job posting is detected on the active tab.
//   - Populated state when content script sends JOB_DETECTED to background SW.
//   - Scoring state when user clicks "Score against my resume".
//   - Result state with ATS score ring, keyword gaps, and optimise deep link.
// ---------------------------------------------------------------------------

import AuthGate    from './AuthGate';
import ProfilePanel from './ProfilePanel';
import ScorePanel  from './components/ScorePanel';

export default function App() {
  return (
    <AuthGate>
      <ProfilePanel />
      <ScorePanel />
    </AuthGate>
  );
}
