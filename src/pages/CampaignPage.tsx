import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { Settings, MapPin, Percent, Calendar, Layers, DollarSign, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function CampaignPage() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading: loadingList } = useActiveCampaigns();
  const [selectedId, setSelectedId] = useState<string>('');

  // Bug #2: Fix setState in render body → useEffect
  useEffect(() => {
    if (!selectedId && campaigns && campaigns.length > 0) {
      setSelectedId(campaigns[0].id);
    }
  }, [campaigns, selectedId]);

  const { campaign, combos, products, isLoading } = useCampaignData(selectedId || undefined);

  if (loadingList) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!campaigns || campaigns.length === 0) return <div className="p-6 glass-card p-8 text-center text-muted-foreground">Nenhuma campanha ativa disponível.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campanha</h1>
          <p className="text-sm text-muted-foreground">Configuração e parâmetros da campanha selecionada</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {campaign && <Badge variant="default" className="bg-success/10 text-success border-success/20">{campaign.active ? '● Ativa' : '○ Inativa'}</Badge>}
          {/* Bug #15: Add edit button */}
          {selectedId && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/campanhas/${selectedId}`)}>
              <Edit className="w-4 h-4 mr-1" /> Editar
            </Button>
          )}
        </div>
      </div>

      {isLoading || !campaign ? <Skeleton className="h-96 w-full" /> : (
        <Tabs defaultValue="parametros" className="w-full">
          <TabsList className="bg-muted border border-border">
            <TabsTrigger value="parametros" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Parâmetros</TabsTrigger>
            <TabsTrigger value="elegibilidade" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Elegibilidade</TabsTrigger>
            <TabsTrigger value="margens" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Margens & Juros</TabsTrigger>
            <TabsTrigger value="combos" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Combos</TabsTrigger>
            <TabsTrigger value="produtos" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Produtos ({products.length})</TabsTrigger>
            <TabsTrigger value="modulos" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Módulos</TabsTrigger>
          </TabsList>

          <TabsContent value="parametros" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ParamCard icon={<Settings className="w-4 h-4" />} label="Formato Lista de Preços" value={formatPriceList(campaign.priceListFormat)} />
              <ParamCard icon={<DollarSign className="w-4 h-4" />} label="Câmbio Produtos" value={`R$ ${campaign.exchangeRateProducts.toFixed(2)}`} />
              <ParamCard icon={<DollarSign className="w-4 h-4" />} label="Câmbio Barter" value={`R$ ${campaign.exchangeRateBarter.toFixed(2)}`} />
              <ParamCard icon={<Percent className="w-4 h-4" />} label="Desc. Max Interno" value={`${campaign.maxDiscountInternal}%`} />
              <ParamCard icon={<Percent className="w-4 h-4" />} label="Desc. Max Revenda" value={`${campaign.maxDiscountReseller}%`} />
              <ParamCard icon={<Layers className="w-4 h-4" />} label="Direcionamento" value={campaign.target === 'produtor' ? 'Produtor Final' : campaign.target === 'distribuidor' ? 'Distribuidor' : 'Venda Direta'} />
            </div>
          </TabsContent>

          <TabsContent value="elegibilidade" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-semibold text-foreground">Estados Elegíveis</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.eligibility.states.length > 0 ? campaign.eligibility.states.map(s => <span key={s} className="engine-badge bg-primary/10 text-primary">{s}</span>) : <span className="text-sm text-muted-foreground">Todos</span>}
                </div>
              </div>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-semibold text-foreground">Mesorregiões</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.eligibility.mesoregions.length > 0 ? campaign.eligibility.mesoregions.map(m => <span key={m} className="engine-badge bg-info/10 text-info">{m}</span>) : <span className="text-sm text-muted-foreground">Todas</span>}
                </div>
              </div>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-semibold text-foreground">Segmentos de Distribuidor</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.eligibility.distributorSegments.map(s => <span key={s} className="engine-badge bg-warning/10 text-warning capitalize">{s}</span>)}
                </div>
              </div>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-semibold text-foreground">Vencimentos Disponíveis</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.availableDueDates.length > 0 ? campaign.availableDueDates.map(d => <span key={d} className="engine-badge bg-muted text-muted-foreground">{new Date(d).toLocaleDateString('pt-BR')}</span>) : <span className="text-sm text-muted-foreground">Não configurado</span>}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="margens" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaign.margins.length > 0 ? campaign.margins.map(m => (
                <div key={m.segment} className="glass-card p-4">
                  <div className="stat-label mb-2 capitalize">{m.segment}</div>
                  <div className="stat-value text-foreground">{m.marginPercent}%</div>
                  <div className="text-xs text-muted-foreground mt-1">Margem sobre preço base</div>
                </div>
              )) : <div className="text-sm text-muted-foreground">Nenhuma margem configurada.</div>}
              <div className="glass-card p-4">
                <div className="stat-label mb-2">Taxa de Juros</div>
                <div className="stat-value text-foreground">{campaign.interestRate}% a.m.</div>
                <div className="text-xs text-muted-foreground mt-1">Aplicada na conversão vista → prazo</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="combos" className="mt-4 space-y-3">
            {combos.length === 0 ? <div className="glass-card p-6 text-center text-muted-foreground">Nenhum combo configurado para esta campanha.</div> : combos.map((combo, i) => (
              <motion.div key={combo.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{combo.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({combo.products.length} produtos)</span>
                  </div>
                  <span className="engine-badge bg-success/10 text-success font-bold">{combo.discountPercent}% desconto</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {combo.products.map(p => (
                    <div key={p.productId} className="bg-muted/30 rounded p-2 text-xs">
                      <div className="font-medium text-foreground">{products.find(pr => pr.id === p.productId)?.name || p.productId}</div>
                      <div className="text-muted-foreground">{p.minDosePerHa}–{p.maxDosePerHa} L/ha</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </TabsContent>

          <TabsContent value="produtos" className="mt-4">
            {products.length === 0 ? <div className="glass-card p-6 text-center text-muted-foreground">Nenhum produto vinculado.</div> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map(p => (
                  <div key={p.id} className="glass-card p-4">
                    <div className="text-sm font-semibold text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground mb-2">{p.activeIngredient}</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div><span className="text-muted-foreground">Categoria:</span> <span className="text-foreground">{p.category}</span></div>
                      <div><span className="text-muted-foreground">Dose:</span> <span className="font-mono text-foreground">{p.dosePerHectare} {p.unitType}/ha</span></div>
                      <div><span className="text-muted-foreground">Preço:</span> <span className="font-mono text-foreground">{p.currency} {p.pricePerUnit.toFixed(2)}</span></div>
                      <div><span className="text-muted-foreground">Faixa:</span> <span className="font-mono text-foreground">{p.minDose}–{p.maxDose}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="modulos" className="mt-4">
            <div className="glass-card p-4">
              <div className="text-sm font-semibold text-foreground mb-3">Módulos Ativos na Jornada</div>
              <div className="flex flex-wrap gap-2">
                {campaign.activeModules.length > 0 ? campaign.activeModules.map((m, i) => (
                  <div key={m} className="flex items-center gap-2">
                    <span className="engine-badge bg-primary/10 text-primary">{i + 1}. {moduleLabels[m] || m}</span>
                    {i < campaign.activeModules.length - 1 && <span className="text-muted-foreground">→</span>}
                  </div>
                )) : <span className="text-sm text-muted-foreground">Nenhum módulo configurado.</span>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ParamCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2"><span className="text-muted-foreground">{icon}</span><span className="stat-label">{label}</span></div>
      <div className="text-lg font-semibold font-mono text-foreground">{value}</div>
    </div>
  );
}

const moduleLabels: Record<string, string> = {
  adesao: 'Termo de Adesão', simulacao: 'Simulação', pagamento: 'Pagamento', barter: 'Barter',
  seguro: 'Seguro', pedido: 'Pedido', formalizacao: 'Formalização', documentos: 'Documentos', garantias: 'Garantias',
};

function formatPriceList(format: string): string {
  const map: Record<string, string> = {
    brl_vista: 'BRL à Vista', brl_prazo: 'BRL a Prazo', usd_vista: 'USD à Vista', usd_prazo: 'USD a Prazo',
    brl_vista_com_margem: 'BRL à Vista c/ Margem', brl_prazo_com_margem: 'BRL a Prazo c/ Margem',
    usd_vista_com_margem: 'USD à Vista c/ Margem', usd_prazo_com_margem: 'USD a Prazo c/ Margem',
  };
  return map[format] || format;
}
