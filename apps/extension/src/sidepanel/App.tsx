// ---------------------------------------------------------------------------
// D'Vantage — Side Panel App
//
// Fonts + Atlas tokens are loaded in index.tsx before this module executes.
// All colour values reference CSS custom properties — no inline hex literals.
//
// Structure:
//   App
//   └── AuthGate            (unauthenticated → sign-in screen)
//       ├── view='main'
//       │   ├── ProfilePanel    (D5: profile header — name, email, plan, sign-out, ⚙)
//       │   ├── ScorePanel      (D6: job detection + ATS scoring)
//       │   └── AutofillPanel   (D10: application form detection + autofill)
//       └── view='settings'
//           └── SettingsPanel   (D11: phone + LinkedIn URL editor)
//
// View state:
//   'main'     → default panel stack.
//   'settings' → SettingsPanel replaces the main stack.
//                ProfilePanel's ⚙ button triggers the transition.
//                SettingsPanel's ← Back button returns to 'main'.
//
//   State is intentionally component-local (useState) — no external store.
//   Transitions are instant; no animation required.
//
// D10: AutofillPanel added.
// D11: Settings view + SettingsPanel added. ProfilePanel receives onOpenSettings prop.
// ---------------------------------------------------------------------------

import { useState }          from 'react';
import AuthGate              from './AuthGate';
import ProfilePanel          from './ProfilePanel';
import ScorePanel            from './components/ScorePanel';
import AutofillPanel         from './components/AutofillPanel';
import SettingsPanel         from './components/SettingsPanel';

type View = 'main' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('main');

  return (
    <AuthGate>
      {view === 'settings' ? (
        <SettingsPanel onBack={() => setView('main')} />
      ) : (
        <>
          <ProfilePanel onOpenSettings={() => setView('settings')} />
          <ScorePanel />
          <AutofillPanel />
        </>
      )}
    </AuthGate>
  );
}
