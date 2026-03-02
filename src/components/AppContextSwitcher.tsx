import { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AppContextSwitcher({ blocked = false }: { blocked?: boolean }) {
  const { tenantId, campaignId, tenants, campaigns, setTenantId, setCampaignId } = useAppContext();

  const campaignOptions = useMemo(
    () => campaigns.filter((campaign) => campaign.company_name === tenantId),
    [campaigns, tenantId],
  );

  const content = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm font-medium">Tenant (Empresa)</p>
        <Select value={tenantId ?? undefined} onValueChange={(value) => { setTenantId(value); setCampaignId(null); }}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o tenant" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((tenant) => (
              <SelectItem key={tenant} value={tenant}>{tenant}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Campanha</p>
        <Select value={campaignId ?? undefined} onValueChange={setCampaignId} disabled={!tenantId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a campanha" />
          </SelectTrigger>
          <SelectContent>
            {campaignOptions.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (!blocked) return content;

  return (
    <div className="p-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Selecione contexto para continuar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta página operacional exige contexto canônico completo: <strong>tenant_id &gt; campaign_id</strong>.
          </p>
          {content}
        </CardContent>
      </Card>
    </div>
  );
}
