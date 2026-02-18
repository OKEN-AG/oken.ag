import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import JourneyHeader from './JourneyHeader';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-[240px] min-h-screen flex flex-col">
        <JourneyHeader />
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
