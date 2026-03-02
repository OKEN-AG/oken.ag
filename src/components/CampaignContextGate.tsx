import { ReactNode } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import AppContextSwitcher from '@/components/AppContextSwitcher';

export default function CampaignContextGate({ children }: { children: ReactNode }) {
  const { isResolving, campaignId } = useAppContext();

  if (isResolving) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando contexto...</div>;
  }

  if (!campaignId) {
    return <AppContextSwitcher blocked />;
  }

  return <>{children}</>;
}
