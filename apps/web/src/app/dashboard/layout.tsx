import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

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
  return <DashboardShell>{children}</DashboardShell>;
}
