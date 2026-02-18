import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useCreateOperation, useCreateOperationItems, useCreateOperationLog } from '@/hooks/useOperations';
import { useAuth } from '@/contexts/AuthContext';
import { calculateAgronomicSelection } from '@/engines/agronomic';
import { applyComboCascade, getMaxPossibleDiscount, getActivatedDiscount, getComplementaryDiscount, getSuggestedDoseForRef } from '@/engines/combo-cascade';
import { decomposePricing, calculateGrossToNet } from '@/engines/pricing';
import type { AgronomicSelection, ChannelSegment, Product } from '@/types/barter';
import { Plus, Minus, Wheat, ShoppingCart, TrendingUp, AlertCircle, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function SimulationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: activeCampaigns, isLoading: loadingCampaigns } = useActiveCampaigns();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const { campaign, rawCampaign, products, combos, isLoading: loadingData } = useCampaignData(selectedCampaignId || undefined);

  const [area, setArea] = useState(500);
  const [segment, setSegment] = useState<ChannelSegment>('distribuidor');
  const [dueMonths, setDueMonths] = useState(12);
  const [clientName, setClientName] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState<string>('soja');
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());
  const [eligibilityWarning, setEligibilityWarning] = useState<string | null>(null);

  const createOperation = useCreateOperation();
  const createItems = useCreateOperationItems();
  const createLog = useCreateOperationLog();

  // Bug #1: Fix useMemo → useEffect for auto-select
  useEffect(() => {
    if (!selectedCampaignId && activeCampaigns && activeCampaigns.length > 0) {
      setSelectedCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, selectedCampaignId]);

  // Bug #1: Fix useMemo → useEffect for reset products
  useEffect(() => {
    setSelectedProducts(new Map());
  }, [selectedCampaignId]);

  // Bug #9: Fetch campaign_due_dates dynamically
  const { data: campaignDueDates } = useQuery({
    queryKey: ['campaign-due-dates-sim', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_due_dates')
        .select('*')
        .eq('campaign_id', selectedCampaignId);
      if (error) throw error;
      return data || [];
    },
  });

  // Bug #10: Fetch campaign_segments dynamically
  const { data: campaignSegments } = useQuery({
    queryKey: ['campaign-segments-sim', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_segments')
        .select('*')
        .eq('campaign_id', selectedCampaignId);
      if (error) throw error;
      return data || [];
    },
  });

  // Derive due date options: use campaign_due_dates if available, else fallback
  const dueDateOptions = useMemo(() => {
    if (campaignDueDates && campaignDueDates.length > 0) {
      const uniqueDates = [...new Set(campaignDueDates.map(d => d.due_date))].sort();
      return uniqueDates.map(d => {
        const date = new Date(d + 'T00:00:00');
        const now = new Date();
        const diffMonths = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
        return { value: String(Math.max(diffMonths, 1)), label: date.toLocaleDateString('pt-BR'), date: d };
      });
    }
    // Fallback: available_due_dates from campaign
    if (campaign?.availableDueDates && campaign.availableDueDates.length > 0) {
      return campaign.availableDueDates.map(d => {
        const date = new Date(d + 'T00:00:00');
        const now = new Date();
        const diffMonths = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
        return { value: String(Math.max(diffMonths, 1)), label: date.toLocaleDateString('pt-BR'), date: d };
      });
    }
    // Ultimate fallback
    return [
      { value: '6', label: '6 meses', date: '' },
      { value: '9', label: '9 meses', date: '' },
      { value: '12', label: '12 meses', date: '' },
      { value: '15', label: '15 meses', date: '' },
    ];
  }, [campaignDueDates, campaign]);

  // Derive segment options: use campaign_segments if available
  const segmentOptions = useMemo(() => {
    if (campaignSegments && campaignSegments.length > 0) {
      return campaignSegments
        .filter(s => s.active)
        .map(s => ({ value: s.segment_name, label: s.segment_name }));
    }
    return [
      { value: 'distribuidor', label: 'Distribuidor' },
      { value: 'cooperativa', label: 'Cooperativa' },
      { value: 'direto', label: 'Venda Direta' },
    ];
  }, [campaignSegments]);

  const toggleProduct = (productId: string) => {
    const next = new Map(selectedProducts);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      const prod = products.find(p => p.id === productId)!;
      const suggestedDose = getSuggestedDoseForRef(combos, prod.ref || '');
      const defaultDose = suggestedDose !== null ? suggestedDose : prod.dosePerHectare;
      next.set(productId, defaultDose);
    }
    setSelectedProducts(next);
  };

  const updateDose = (productId: string, dose: number) => {
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  const selections = useMemo<AgronomicSelection[]>(() => {
    return Array.from(selectedProducts.entries()).map(([id, dose]) => {
      const product = products.find(p => p.id === id);
      if (!product) return null;
      return calculateAgronomicSelection(product, area, dose);
    }).filter(Boolean) as AgronomicSelection[];
  }, [selectedProducts, area, products]);

  const comboActivations = useMemo(() => {
    return applyComboCascade(combos, selections);
  }, [selections, combos]);

  const maxDiscount = getMaxPossibleDiscount(combos);
  const activatedDiscount = getActivatedDiscount(comboActivations);
  const complementaryDiscount = getComplementaryDiscount(comboActivations);
  const discountProgress = maxDiscount > 0 ? (activatedDiscount / maxDiscount) * 100 : 0;

  const pricingResults = useMemo(() => {
    if (!campaign) return [];
    return selections.map(sel =>
      decomposePricing(sel.product, campaign, segment, dueMonths, sel.roundedQuantity)
    );
  }, [selections, segment, dueMonths, campaign]);

  const grossToNet = useMemo(() => {
    return calculateGrossToNet(pricingResults, comboActivations);
  }, [pricingResults, comboActivations]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Bug #3: Separate save-only vs save-and-navigate
  const doSave = async () => {
    if (!user || !selectedCampaignId || selections.length === 0) return null;
    const op = await createOperation.mutateAsync({
      campaign_id: selectedCampaignId,
      user_id: user.id,
      client_name: clientName || 'Sem nome',
      channel: segment,
      due_months: dueMonths,
      area_hectares: area,
      gross_revenue: grossToNet.grossRevenue,
      combo_discount: grossToNet.comboDiscount,
      net_revenue: grossToNet.netRevenue,
      financial_revenue: grossToNet.financialRevenue,
      distributor_margin: grossToNet.distributorMargin,
      commodity: selectedCommodity as any, // Bug #24: Save selected commodity
      status: 'simulacao' as const,
    });

    const items = pricingResults.map(pr => {
      const sel = selections.find(s => s.productId === pr.productId)!;
      return {
        operation_id: op.id,
        product_id: pr.productId,
        dose_per_hectare: sel.dosePerHectare,
        raw_quantity: sel.rawQuantity,
        rounded_quantity: sel.roundedQuantity,
        boxes: sel.boxes,
        pallets: sel.pallets,
        base_price: pr.basePrice,
        normalized_price: pr.normalizedPrice,
        interest_component: pr.interestComponent,
        margin_component: pr.marginComponent,
        subtotal: pr.subtotal,
      };
    });

    await createItems.mutateAsync(items);
    await createLog.mutateAsync({
      operation_id: op.id,
      user_id: user.id,
      action: 'simulacao_criada',
      details: { area, segment, dueMonths, productsCount: selections.length },
    });

    return op;
  };

  const handleSaveOnly = async () => {
    try {
      await doSave();
      toast.success('Operação salva como simulação!');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    }
  };

  const handleSaveAndParity = async () => {
    try {
      const op = await doSave();
      if (!op) return;
      toast.success('Operação salva! Redirecionando para paridade...');
      navigate('/paridade', { state: { operationId: op.id, campaignId: selectedCampaignId, amount: grossToNet.netRevenue, grossAmount: grossToNet.grossRevenue } });
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    }
  };

  if (loadingCampaigns) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!activeCampaigns || activeCampaigns.length === 0) {
    return (
      <div className="p-6">
        <div className="glass-card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Nenhuma campanha ativa</h2>
          <p className="text-sm text-muted-foreground">O administrador precisa criar e ativar uma campanha para iniciar simulações.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Simulação de Pedido</h1>
          <p className="text-sm text-muted-foreground">Selecione produtos, ajuste doses e visualize a simulação completa</p>
        </div>
      </div>

      {/* Campaign selector + config */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4 lg:col-span-2">
          <label className="stat-label">Campanha</label>
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {activeCampaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({c.season})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Área (hectares)</label>
          <Input type="number" value={area} onChange={e => setArea(Number(e.target.value))} className="mt-2 bg-muted border-border font-mono text-foreground" min={1} />
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Canal de Venda</label>
          <Select value={segment} onValueChange={(v) => setSegment(v as ChannelSegment)}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {segmentOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Prazo / Vencimento</label>
          <Select value={String(dueMonths)} onValueChange={(v) => setDueMonths(Number(v))}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {dueDateOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Bug #24: Commodity selector */}
        <div className="glass-card p-4">
          <label className="stat-label">Commodity (Barter)</label>
          <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(rawCampaign?.commodities?.length ? rawCampaign.commodities : ['soja', 'milho', 'cafe', 'algodao']).map((c: string) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadingData ? (
        <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : !campaign ? (
        <div className="glass-card p-6 text-center text-muted-foreground">Selecione uma campanha</div>
      ) : (
        <>
          {/* Combo discount bar */}
          {combos.length > 0 && (
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-success" /> Ativação de Combos
                </span>
                <span className="font-mono text-sm text-success font-bold">
                  Oferta: {activatedDiscount.toFixed(1)}% / {maxDiscount}%
                  {complementaryDiscount > 0 && <span className="ml-2 text-info">+ Compl: {complementaryDiscount.toFixed(1)}%</span>}
                </span>
              </div>
              <Progress value={discountProgress} className="h-3 bg-muted" />
              <div className="flex flex-wrap gap-2 mt-3">
                {comboActivations.map(ca => (
                  <span key={ca.comboId} className={`engine-badge ${ca.applied ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {ca.comboName} ({ca.discountPercent}%) {ca.applied ? ' ✓' : ''}
                  </span>
                ))}
              </div>
              {discountProgress < 100 && (
                <div className="flex items-center gap-1 mt-2 text-xs text-warning">
                  <AlertCircle className="w-3 h-3" /> Adicione mais produtos ou ajuste doses para maximizar descontos
                </div>
              )}
            </div>
          )}

          {/* Product selection */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Portfólio de Produtos ({products.length})</h2>
            {products.length === 0 ? (
              <div className="glass-card p-6 text-center text-muted-foreground">Nenhum produto vinculado a esta campanha. O administrador precisa vincular produtos na aba Produtos.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map(product => {
                  const isSelected = selectedProducts.has(product.id);
                  const dose = selectedProducts.get(product.id) ?? product.dosePerHectare;
                  const selection = selections.find(s => s.productId === product.id);
                  return (
                    <motion.div key={product.id} layout className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`} onClick={() => !isSelected && toggleProduct(product.id)}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-semibold text-foreground">{product.name}</span>
                          <span className="ml-2 engine-badge bg-muted text-muted-foreground">{product.category}</span>
                        </div>
                        {isSelected ? (
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleProduct(product.id); }} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"><Minus className="w-4 h-4" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-success hover:text-success hover:bg-success/10 h-7 w-7 p-0"><Plus className="w-4 h-4" /></Button>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{product.activeIngredient}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Dose rec.:</span><span className="ml-1 font-mono text-foreground">{product.dosePerHectare} {product.unitType}/ha</span></div>
                        <div><span className="text-muted-foreground">Preço:</span><span className="ml-1 font-mono text-foreground">{product.currency === 'USD' ? 'US$' : 'R$'} {product.pricePerUnit.toFixed(2)}/{product.unitType}</span></div>
                      </div>
                      {isSelected && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-border space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground w-20">Dose/ha:</label>
                            <Input type="number" value={dose} step={0.05} min={product.minDose} max={product.maxDose} onChange={e => { e.stopPropagation(); updateDose(product.id, Number(e.target.value)); }} onClick={e => e.stopPropagation()} className="h-7 bg-muted border-border font-mono text-xs text-foreground" />
                          </div>
                          {selection && (
                            <div className="grid grid-cols-3 gap-1 text-xs">
                              <div className="bg-muted/50 rounded p-1.5 text-center"><div className="text-muted-foreground">Volume</div><div className="font-mono font-medium text-foreground">{selection.roundedQuantity.toFixed(0)} {product.unitType}</div></div>
                              <div className="bg-muted/50 rounded p-1.5 text-center"><div className="text-muted-foreground">Caixas</div><div className="font-mono font-medium text-foreground">{selection.boxes}</div></div>
                              <div className="bg-muted/50 rounded p-1.5 text-center"><div className="text-muted-foreground">Pallets</div><div className="font-mono font-medium text-foreground">{selection.pallets}</div></div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {selections.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 glow-border">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" /> Resumo da Simulação
              </h2>

              {/* Client name */}
              <div className="mb-4">
                <label className="stat-label">Nome do Cliente</label>
                <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nome do produtor ou empresa" className="mt-1 bg-muted border-border text-foreground" />
              </div>

              {/* Product line items */}
              <div className="space-y-1 mb-4">
                {pricingResults.map(pr => {
                  const prod = products.find(p => p.id === pr.productId)!;
                  return (
                    <div key={pr.productId} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                      <span className="text-foreground">{prod.name}</span>
                      <div className="flex items-center gap-6 font-mono text-xs">
                        <span className="text-muted-foreground">{pr.quantity.toFixed(0)} {prod.unitType}</span>
                        <span className="text-muted-foreground">{formatCurrency(pr.normalizedPrice)}/{prod.unitType}</span>
                        <span className="text-foreground font-medium w-28 text-right">{formatCurrency(pr.subtotal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bug #8: Complete Gross-to-Net */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-border">
                <div><div className="stat-label">Receita Bruta</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div></div>
                <div><div className="stat-label">Desconto Combo</div><div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.comboDiscount)}</div></div>
                <div><div className="stat-label">Margem Canal</div><div className="font-mono font-bold text-muted-foreground">{formatCurrency(grossToNet.distributorMargin)}</div></div>
                <div><div className="stat-label">Receita Financeira</div><div className="font-mono font-bold text-info">{formatCurrency(grossToNet.financialRevenue)}</div></div>
                <div><div className="stat-label">Net Net Revenue</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.netNetRevenue)}</div></div>
                <div><div className="stat-label">Total a Pagar (Prazo)</div><div className="font-mono font-bold text-xl text-success">{formatCurrency(grossToNet.netRevenue)}</div></div>
              </div>

              {/* Bug #3: Separate save buttons */}
              <div className="flex justify-end gap-3 mt-6">
                <Button onClick={handleSaveOnly} disabled={createOperation.isPending} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                  {createOperation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Salvar Operação
                </Button>
                <Button onClick={handleSaveAndParity} disabled={createOperation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Wheat className="w-4 h-4 mr-2" /> Salvar & Calcular Paridade →
                </Button>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
