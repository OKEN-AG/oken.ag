import { useLocation } from 'react-router-dom';
import { useNavigationContext } from '@/hooks/useNavigationContext';

const moduleByPrefix: Array<{ prefix: string; module: string }> = [
  { prefix: '/admin', module: 'Administração' },
  { prefix: '/campanhas', module: 'Campanhas' },
  { prefix: '/operacao', module: 'Operação' },
  { prefix: '/monitoramento', module: 'Operação' },
  { prefix: '/liquidacao', module: 'Operação' },
];

export default function ContextBreadcrumb() {
  const location = useLocation();
  const { tenantId, campaignId, campaigns } = useNavigationContext();

  const moduleName = moduleByPrefix.find(item => location.pathname.startsWith(item.prefix))?.module || 'Módulo';
  const campaignName = campaigns.find(c => c.id === campaignId)?.name || 'Campanha não selecionada';

  return (
    <div className="text-xs text-muted-foreground px-6 py-2 border-b border-border bg-muted/30">
      <span className="font-medium text-foreground">{tenantId}</span> {'>'} <span className="font-medium text-foreground">{campaignName}</span> {'>'} <span>{moduleName}</span>
    </div>
  );
}
