import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCampaignData } from '@/hooks/useActiveCampaign';
import { useNavigationContext } from '@/hooks/useNavigationContext';

const policyKeys = [
  'Produtos',
  'Pricing Commodity',
  'Frete',
  'Incentivos',
  'Whitelists',
  'Due Dates',
];

export default function CampaignSummaryPage() {
  const { campaignId } = useNavigationContext();
  const { campaign, products, combos, commodityPricing, freightReducers, dueDates } = useCampaignData(campaignId);

  const kpis = [
    { label: 'Produtos Ativos', value: products.length },
    { label: 'Combos Configurados', value: combos.length },
    { label: 'Rotas de Frete', value: freightReducers.length },
    { label: 'Vencimentos Disponíveis', value: dueDates.length },
  ];

  const policyStatus = {
    Produtos: products.length > 0,
    'Pricing Commodity': Boolean(commodityPricing),
    Frete: freightReducers.length > 0,
    Incentivos: combos.length > 0,
    Whitelists: Boolean(campaign?.eligibility?.states?.length || campaign?.eligibility?.cities?.length),
    'Due Dates': dueDates.length > 0,
  } as Record<string, boolean>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resumo da Campanha</h1>
        <p className="text-sm text-muted-foreground">KPIs operacionais e status de publicação das políticas da campanha.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{kpi.label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{kpi.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Status de publicação das políticas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {policyKeys.map((key) => (
            <div key={key} className="flex items-center justify-between border-b pb-2 last:border-b-0">
              <span>{key}</span>
              <span className={policyStatus[key] ? 'text-success' : 'text-warning'}>
                {policyStatus[key] ? 'Publicado' : 'Pendente'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
