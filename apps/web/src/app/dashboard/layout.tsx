import type { Metadata } from 'next';
import { Sidebar } from '@/components/dashboard/sidebar';
import { TopBar }  from '@/components/dashboard/topbar';

export const metadata: Metadata = {
  title: {
    default:  "Dashboard · D'Vantage",
    template: "%s · D'Vantage",
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={styles.shell}>
      <Sidebar />
      <div style={styles.main}>
        <TopBar />
        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  shell: {
    display:         'flex',
    minHeight:       '100vh',
    backgroundColor: 'var(--vt-surface-base)',
  },
  main: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column' as const,
    minWidth:      0, // prevent flex overflow
  },
  content: {
    flex:    1,
    padding: '32px 32px',
  },
} as const;
