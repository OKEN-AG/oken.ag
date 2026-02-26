import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useCreateOperation, useCreateOperationItems, useCreateOperationLog } from '@/hooks/useOperations';
import { useAuth } from '@/contexts/AuthContext';
import { useSimulationEngine } from '@/hooks/useSimulationEngine';
import type { ChannelSegment, Product } from '@/types/barter';
import { Plus, Minus, Wheat, ShoppingCart, TrendingUp, AlertCircle, Save, Loader2, FileSearch, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function SimulationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: activeCampaigns, isLoading: loadingCampaigns } = useActiveCampaigns();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const { campaign, rawCampaign, products, combos, isLoading: loadingData } = useCampaignData(selectedCampaignId || undefined);

  const [area, setArea] = useState(500);
  const [segment, setSegment] = useState<string>('');
  const [dueMonths, setDueMonths] = useState(12);
  const [clientName, setClientName] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientState, setClientState] = useState('');
  const [selectedCommodity, setSelectedCommodity] = useState<string>('soja');
  const [selectedProducts, setSelectedProducts] = useState<Map<string, number>>(new Map());
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');

  const createOperation = useCreateOperation();
  const createItems = useCreateOperationItems();
  const createLog = useCreateOperationLog();

  const { loading: simLoading, result: simResult, error: simError, simulate, simulateDebounced } = useSimulationEngine();

  useEffect(() => {
    if (!selectedCampaignId && activeCampaigns && activeCampaigns.length > 0) {
      setSelectedCampaignId(activeCampaigns[0].id);
    }
  }, [activeCampaigns, selectedCampaignId]);

  useEffect(() => {
    setSelectedProducts(new Map());
  }, [selectedCampaignId]);

  // Set defaults from simResult config
  useEffect(() => {
    if (simResult?.segmentOptions?.length && !segment) {
      setSegment(simResult.segmentOptions[0].value);
    }
  }, [simResult?.segmentOptions, segment]);

  // Trigger simulation on input changes
  useEffect(() => {
    if (!selectedCampaignId || selectedProducts.size === 0) return;
    const inputSelections = Array.from(selectedProducts.entries()).map(([id, dose]) => ({
      productId: id,
      dosePerHectare: dose,
      areaHectares: area,
    }));
    simulateDebounced({
      campaignId: selectedCampaignId,
      selections: inputSelections,
      segment: segment || 'distribuidor',
      dueMonths,
      paymentMethodId: selectedPaymentMethod || undefined,
      commodityCode: selectedCommodity,
      clientContext: {
        city: clientCity || undefined,
        state: clientState || undefined,
      },
    });
  }, [selectedCampaignId, selectedProducts, area, segment, dueMonths, selectedPaymentMethod, selectedCommodity, clientCity, clientState, simulateDebounced]);

  const toggleProduct = (productId: string) => {
    const next = new Map(selectedProducts);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      const prod = products.find(p => p.id === productId)!;
      next.set(productId, prod.dosePerHectare);
    }
    setSelectedProducts(next);
  };

  const updateDose = (productId: string, dose: number) => {
    const next = new Map(selectedProducts);
    next.set(productId, dose);
    setSelectedProducts(next);
  };

  // Derived from simResult
  const selections = simResult?.selections || [];
  const comboActivations = simResult?.comboActivations || [];
  const pricingResults = simResult?.pricingResults || [];
  const grossToNet = simResult?.grossToNet || {
    grossRevenue: 0, comboDiscount: 0, barterDiscount: 0, directIncentiveDiscount: 0,
    creditLiberacao: 0, creditLiquidacao: 0, netRevenue: 0, financialRevenue: 0,
    distributorMargin: 0, segmentAdjustment: 0, paymentMethodMarkup: 0, barterCost: 0, netNetRevenue: 0,
  };
  const maxDiscount = simResult?.maxDiscount || 0;
  const activatedDiscount = simResult?.activatedDiscount || 0;
  const complementaryDiscount = simResult?.complementaryDiscount || 0;
  const discountProgress = simResult?.discountProgress || 0;
  const dueDateOptions = simResult?.campaignConfig ? [] : []; // Will use campaign_due_dates below
  const segmentOptions = simResult?.segmentOptions || [];
  const paymentMethods = simResult?.paymentMethods || [];
  const eligibility = simResult?.eligibility;

  const segmentAdjustmentPercent = segmentOptions.find(s => s.value === segment)?.adjustmentPercent || 0;
  const selectedPM = paymentMethods.find(pm => pm.id === selectedPaymentMethod) || paymentMethods[0];
  const paymentMethodMarkup = selectedPM?.markupPercent || 0;

  // Eligibility from backend
  const eligibilityWarning = eligibility?.warnings?.length ? eligibility.warnings : null;
  const isBlockedByEligibility = !!eligibility?.blocked;

  // Min order
  const minOrderAmount = (rawCampaign as any)?.min_order_amount || 0;
  const isBelowMinOrder = minOrderAmount > 0 && grossToNet.grossRevenue > 0 && grossToNet.grossRevenue < minOrderAmount;

  // Margin zero warning
  const marginZeroWarning = useMemo(() => {
    if (!rawCampaign) return false;
    const target = rawCampaign.target;
    if (target === 'venda_direta' || target === 'venda_direta_consumidor') return false;
    return grossToNet.distributorMargin === 0 && selections.length > 0;
  }, [rawCampaign, grossToNet, selections]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const doSave = async () => {
    if (!user || !selectedCampaignId || selections.length === 0) return null;
    if (isBlockedByEligibility) {
      toast.error('Operação bloqueada: cliente/região não elegível para esta campanha.');
      return null;
    }
    if (isBelowMinOrder) {
      toast.error(`Pedido mínimo: ${formatCurrency(minOrderAmount)}. Valor atual: ${formatCurrency(grossToNet.grossRevenue)}`);
      return null;
    }
    const op = await createOperation.mutateAsync({
      campaign_id: selectedCampaignId,
      user_id: user.id,
      client_name: clientName || 'Sem nome',
      channel: (segment || 'distribuidor') as ChannelSegment,
      city: clientCity || undefined,
      state: clientState || undefined,
      due_months: dueMonths,
      area_hectares: area,
      gross_revenue: grossToNet.grossRevenue,
      combo_discount: grossToNet.comboDiscount,
      net_revenue: grossToNet.netRevenue,
      financial_revenue: grossToNet.financialRevenue,
      distributor_margin: grossToNet.distributorMargin,
      commodity: selectedCommodity as any,
      status: 'simulacao' as const,
    });

    const items = pricingResults.map(pr => {
      const sel = selections.find(s => s.productId === pr.productId);
      return {
        operation_id: op.id,
        product_id: pr.productId,
        dose_per_hectare: sel?.dosePerHectare || 0,
        raw_quantity: sel?.rawQuantity || 0,
        rounded_quantity: sel?.roundedQuantity || 0,
        boxes: sel?.boxes || 0,
        pallets: sel?.pallets || 0,
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
      details: {
        area, segment, dueMonths, productsCount: selections.length,
        paymentMethodMarkup, segmentAdjustmentPercent,
        eligibilityWarnings: eligibilityWarning,
        source: 'server-authoritative',
      },
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
        {simLoading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
      </div>

      {/* Campaign selector + config */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 lg:col-span-2">
          <label className="stat-label">Campanha</label>
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
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

      {/* Row 2: Segment, Payment, Due date, Client info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Canal de Venda</label>
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {segmentOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {segmentAdjustmentPercent !== 0 && (
            <div className="text-[10px] mt-1 text-info">Ajuste: {segmentAdjustmentPercent > 0 ? '+' : ''}{segmentAdjustmentPercent}%</div>
          )}
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Meio de Pagamento</label>
          <Select value={selectedPaymentMethod || selectedPM?.id || ''} onValueChange={setSelectedPaymentMethod}>
            <SelectTrigger className="mt-2 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {paymentMethods.map(pm => (
                <SelectItem key={pm.id} value={pm.id}>
                  {pm.methodName} {pm.markupPercent !== 0 ? `(${pm.markupPercent > 0 ? '+' : ''}${pm.markupPercent}%)` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Prazo (meses)</label>
          <Input type="number" value={dueMonths} onChange={e => setDueMonths(Number(e.target.value))} className="mt-2 bg-muted border-border font-mono text-foreground" min={1} max={36} />
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Nome do Cliente</label>
          <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Produtor/Empresa" className="mt-2 bg-muted border-border text-foreground" />
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Cidade</label>
          <Input value={clientCity} onChange={e => setClientCity(e.target.value)} placeholder="Cidade" className="mt-2 bg-muted border-border text-foreground" />
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Estado (UF)</label>
          <Input value={clientState} onChange={e => setClientState(e.target.value.toUpperCase())} placeholder="UF" maxLength={2} className="mt-2 bg-muted border-border text-foreground" />
        </div>
      </div>

      {/* Warnings */}
      {simResult && (
        <div className="space-y-2">
          {eligibilityWarning && eligibilityWarning.map((w, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs ${isBlockedByEligibility ? 'text-destructive bg-destructive/10 border border-destructive/20' : 'text-warning bg-warning/10 border border-warning/20'} rounded-md px-3 py-2`}>
              <MapPin className="w-3.5 h-3.5 shrink-0" /> {w}
              {isBlockedByEligibility && <span className="ml-auto font-semibold">⛔ BLOQUEANTE</span>}
            </div>
          ))}
          {isBelowMinOrder && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Pedido mínimo: {formatCurrency(minOrderAmount)}. Valor atual insuficiente.
            </div>
          )}
          {marginZeroWarning && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Margem do distribuidor = 0%. Verifique as margens de canal na configuração da campanha.
            </div>
          )}
          {segmentOptions.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Nenhum canal de venda/segmento configurado.
            </div>
          )}
          {paymentMethods.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Nenhum meio de pagamento configurado. Configure em Admin → Campanhas → Financeiro.
            </div>
          )}
        </div>
      )}

      {simError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Erro no motor de simulação: {simError}
        </div>
      )}

      {loadingData ? (
        <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : !campaign ? (
        <div className="glass-card p-6 text-center text-muted-foreground">Selecione uma campanha</div>
      ) : (
        <>
          {/* Combo discount bar */}
          {maxDiscount > 0 && (
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
              <div className="glass-card p-6 text-center text-muted-foreground">Nenhum produto vinculado a esta campanha.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.map(product => {
                  const isSelected = selectedProducts.has(product.id);
                  const dose = selectedProducts.get(product.id) ?? product.dosePerHectare;
                  const selection = selections.find(s => s.productId === product.id);
                  const simPricing = pricingResults.find(p => p.productId === product.id);
                  const displayPrice = simPricing?.normalizedPrice ?? product.pricePerUnit;
                  return (
                    <motion.div key={product.id} layout className={`glass-card p-4 cursor-pointer transition-all ${isSelected ? 'glow-border' : 'hover:border-muted-foreground/30'}`} onClick={() => !isSelected && toggleProduct(product.id)}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-semibold text-foreground">{product.name}</span>
                          <span className="ml-2 engine-badge bg-muted text-muted-foreground">{product.category}</span>
                        </div>
                        <div className="flex gap-1">
                          {isSelected ? (
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleProduct(product.id); }} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"><Minus className="w-4 h-4" /></Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-success hover:text-success hover:bg-success/10 h-7 w-7 p-0"><Plus className="w-4 h-4" /></Button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">{product.activeIngredient}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Dose rec.:</span><span className="ml-1 font-mono text-foreground">{product.dosePerHectare} {product.unitType}/ha</span></div>
                        <div><span className="text-muted-foreground">Preço:</span><span className="ml-1 font-mono text-foreground">{formatCurrency(displayPrice)}/{product.unitType}</span></div>
                      </div>
                      {isSelected && selection && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-border space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground w-20">Dose/ha:</label>
                            <Input type="number" value={dose} step={0.05} min={product.minDose} max={product.maxDose} onChange={e => { e.stopPropagation(); updateDose(product.id, Number(e.target.value)); }} onClick={e => e.stopPropagation()} className="h-7 bg-muted border-border font-mono text-xs text-foreground" />
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-xs">
                            <div className="bg-muted/50 rounded p-1.5 text-center"><div className="text-muted-foreground">Volume</div><div className="font-mono font-medium text-foreground">{selection.roundedQuantity.toFixed(0)} {product.unitType}</div></div>
                            <div className="bg-muted/50 rounded p-1.5 text-center"><div className="text-muted-foreground">Caixas</div><div className="font-mono font-medium text-foreground">{selection.boxes}</div></div>
                            <div className="bg-muted/50 rounded p-1.5 text-center"><div className="text-muted-foreground">Pallets</div><div className="font-mono font-medium text-foreground">{selection.pallets}</div></div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {selections.length > 0 && grossToNet.grossRevenue > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 glow-border">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" /> Resumo da Simulação
              </h2>

              {/* Product line items */}
              <div className="space-y-1 mb-4">
                {pricingResults.map(pr => {
                  const prod = products.find(p => p.id === pr.productId);
                  if (!prod) return null;
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

              {/* Gross-to-Net */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 pt-4 border-t border-border">
                <div><div className="stat-label">Receita Bruta</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div></div>
                <div><div className="stat-label">Desconto Combo</div><div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.comboDiscount)}</div></div>
                {(grossToNet.directIncentiveDiscount || 0) > 0 && (
                  <div><div className="stat-label">Incentivo Direto</div><div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.directIncentiveDiscount || 0)}</div></div>
                )}
                <div><div className="stat-label">Margem Canal</div><div className="font-mono font-bold text-muted-foreground">{formatCurrency(grossToNet.distributorMargin)}</div></div>
                <div><div className="stat-label">Receita Financeira</div><div className="font-mono font-bold text-info">{formatCurrency(grossToNet.financialRevenue)}</div></div>
                {(grossToNet.paymentMethodMarkup || 0) > 0 && (
                  <div><div className="stat-label">Markup Pagamento</div><div className="font-mono font-bold text-info">{formatCurrency(grossToNet.paymentMethodMarkup || 0)}</div></div>
                )}
                <div><div className="stat-label">Net Net Revenue</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.netNetRevenue)}</div></div>
                <div><div className="stat-label">Total a Pagar (Prazo)</div><div className="font-mono font-bold text-xl text-success">{formatCurrency(grossToNet.netRevenue)}</div></div>
              </div>

              {/* Credit incentives */}
              {((grossToNet.creditLiberacao || 0) > 0 || (grossToNet.creditLiquidacao || 0) > 0) && (
                <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                  {(grossToNet.creditLiberacao || 0) > 0 && (
                    <div>Crédito após liberação: <span className="font-mono text-info">{formatCurrency(grossToNet.creditLiberacao || 0)}</span></div>
                  )}
                  {(grossToNet.creditLiquidacao || 0) > 0 && (
                    <div>Crédito após liquidação: <span className="font-mono text-info">{formatCurrency(grossToNet.creditLiquidacao || 0)}</span></div>
                  )}
                </div>
              )}

              {/* Save buttons */}
              <div className="flex justify-end gap-3 mt-6">
                <Button onClick={handleSaveOnly} disabled={createOperation.isPending || isBlockedByEligibility || isBelowMinOrder} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                  {createOperation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Salvar Operação
                </Button>
                <Button onClick={handleSaveAndParity} disabled={createOperation.isPending || isBlockedByEligibility || isBelowMinOrder} className="bg-primary text-primary-foreground hover:bg-primary/90">
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
