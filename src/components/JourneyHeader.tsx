import { useLocation } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigationContext } from '@/hooks/useNavigationContext';
import ContextBreadcrumb from '@/components/ContextBreadcrumb';

export default function JourneyHeader() {
  const location = useLocation();
  const { campaignId, campaigns, setCampaign } = useNavigationContext();

  if (location.pathname.startsWith('/portal') || location.pathname.startsWith('/compradores') || location.pathname.startsWith('/investidores')) {
    return null;
  }

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="px-6 py-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Contexto da navegação</div>
        <div className="w-[280px]">
          <Select value={campaignId || ''} onValueChange={setCampaign}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar campanha" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ContextBreadcrumb />
    </div>
  );
}
