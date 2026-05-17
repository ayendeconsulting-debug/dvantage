// ---------------------------------------------------------------------------
// D'Vantage — Side Panel App
//
// Fonts + Atlas tokens are loaded in index.tsx before this module executes.
// All colour values reference CSS custom properties — no inline hex literals.
//
// Structure:
//   App
//   └── AuthGate            (unauthenticated → sign-in screen)
//       └── ProfilePanel    (D5: profile header — name, email, plan, sign-out)
//
// D2: ReadyState placeholder removed. ProfilePanel is the authenticated view.
// M14 will add JobDetectionPanel below ProfilePanel for content-script scoring.
// ---------------------------------------------------------------------------

import AuthGate    from './AuthGate';
import ProfilePanel from './ProfilePanel';

export default function App() {
  return (
    <AuthGate>
      <ProfilePanel />
    </AuthGate>
  );
}
