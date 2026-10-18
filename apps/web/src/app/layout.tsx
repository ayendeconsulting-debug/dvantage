import type { Metadata } from 'next';
import '../styles/globals.css';
import { ThemeProvider } from '@/lib/theme';

export const metadata: Metadata = {
  title: {
    default: "D'Vantage",
    template: "%s · D'Vantage",
  },
  description: 'From applied to interview.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

/**
 * Inline script that runs before React hydrates, preventing a flash of the
 * wrong theme. Sets data-theme on <html> from localStorage before paint.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('vt-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <head>
        {/* Must be synchronous — no defer, no async */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
