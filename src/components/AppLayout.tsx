import { ReactNode, useState } from 'react';
import AppSidebar from './AppSidebar';
import JourneyHeader from './JourneyHeader';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { useIsMobile } from '@/hooks/use-mobile';

export default function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);

  return (
    <SidebarProvider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <main
          className="transition-[margin-left] duration-200 min-h-screen flex flex-col"
          style={{ marginLeft: collapsed ? 64 : 240 }}
        >
          <JourneyHeader />
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
