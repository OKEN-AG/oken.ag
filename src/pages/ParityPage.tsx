import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useCampaignData } from '@/hooks/useActiveCampaign';
import { useUpdateOperation, useCreateOperationLog } from '@/hooks/useOperations';
import { useAuth } from '@/contexts/AuthContext';
import { mockCommodityPricing, mockFreightReducers } from '@/data/mock-data';
import { calculateCommodityNetPrice, calculateParity, blackScholes } from '@/engines/parity';
import type { CommodityPricing, FreightReducer } from '@/types/barter';
import { Wheat, ArrowRight, TrendingUp, DollarSign, Truck, Shield, Save, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function ParityPage() {
  const location = useLocation();
  const { user } = useAuth();
  const stateAmount = (location.state as any)?.amount ?? 500000;
  const stateGross = (location.state as any)?.grossAmount ?? 600000;
  const campaignId = (location.state as any)?.campaignId;
  const operationId = (location.state as any)?.operationId;

  const { commodityPricing, freightReducers, isLoading } = useCampaignData(campaignId);
  const updateOperation = useUpdateOperation();
  const createLog = useCreateOperationLog();

  // Use real data if available, fallback to mock
  const pricing: CommodityPricing = commodityPricing || mockCommodityPricing;
  const freights: FreightReducer[] = freightReducers.length > 0 ? freightReducers : mockFreightReducers;

  const [amount, setAmount] = useState(stateAmount);
  const [grossAmount] = useState(stateGross);
  const ports = Object.keys(pricing.basisByPort);
  const [port, setPort] = useState(ports[0] || 'Paranaguá (PR)');
  const [freightOrigin, setFreightOrigin] = useState(freights[0]?.origin || '');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  const [volatility, setVolatility] = useState(25);

  const freightReducer = freights.find(f => f.origin === freightOrigin);

  const commodityNetPrice = useMemo(() => calculateCommodityNetPrice(pricing, port, freightReducer), [port, freightReducer, pricing]);
  const parity = useMemo(() => calculateParity(amount, commodityNetPrice, hasContract ? userPrice : undefined, grossAmount), [amount, commodityNetPrice, hasContract, userPrice, grossAmount]);

  const insurancePremium = useMemo(() => {
    if (!showInsurance) return null;
    const spotPrice = pricing.exchangePrice * pricing.exchangeRateBolsa;
    const premium = blackScholes(spotPrice, spotPrice * 1.05, 0.5, 0.06, volatility / 100, true);
    const premiumPerSaca = premium * 16.667;
    const additionalSacas = Math.ceil(premiumPerSaca * parity.quantitySacas / commodityNetPrice);
    return { premiumPerSaca, additionalSacas, totalSacas: parity.quantitySacas + additionalSacas };
  }, [showInsurance, volatility, parity, commodityNetPrice, pricing]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  const handleSaveParity = async () => {
    if (!operationId || !user) return;
    try {
      await updateOperation.mutateAsync({
        id: operationId,
        total_sacas: insurancePremium?.totalSacas ?? parity.quantitySacas,
        commodity_price: parity.commodityPricePerUnit,
        reference_price: parity.referencePrice,
        has_existing_contract: hasContract,
        insurance_premium_sacas: insurancePremium?.additionalSacas ?? 0,
        payment_method: 'barter' as const,
        status: 'pedido' as const,
      });
      await createLog.mutateAsync({
        operation_id: operationId,
        user_id: user.id,
        action: 'paridade_calculada',
        details: { sacas: parity.quantitySacas, preco: parity.commodityPricePerUnit, port },
      });
      toast.success('Paridade salva na operação!');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Paridade Barter</h1>
          <p className="text-sm text-muted-foreground">Conversão do montante em sacas de commodity</p>
        </div>
        {operationId && (
          <Button onClick={handleSaveParity} disabled={updateOperation.isPending} className="bg-primary text-primary-foreground">
            {updateOperation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Paridade
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Inputs */}
          <div className="space-y-4">
            <div className="glass-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Montante</h3>
              <div>
                <label className="stat-label">Valor Total do Pedido (R$)</label>
                <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" />
              </div>
            </div>

            <div className="glass-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Wheat className="w-4 h-4 text-primary" /> Commodity</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Bolsa</span><div className="font-mono font-medium text-foreground">{pricing.exchange}</div></div>
                <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Contrato</span><div className="font-mono font-medium text-foreground">{pricing.contract}</div></div>
                <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Preço Bolsa</span><div className="font-mono font-medium text-foreground">US$ {pricing.exchangePrice}</div></div>
                <div className="bg-muted/50 rounded p-2"><span className="text-muted-foreground">Câmbio</span><div className="font-mono font-medium text-foreground">R$ {pricing.exchangeRateBolsa}</div></div>
              </div>
            </div>

            <div className="glass-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> Logística</h3>
              <div>
                <label className="stat-label">Porto de Referência</label>
                <Select value={port} onValueChange={setPort}>
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ports.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="stat-label">Origem (Frete)</label>
                <Select value={freightOrigin} onValueChange={setFreightOrigin}>
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {freights.map(f => <SelectItem key={f.origin} value={f.origin}>{f.origin}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {freightReducer && (
                <div className="text-xs text-muted-foreground">
                  Redutor logístico: <span className="font-mono text-warning">{formatCurrency(freightReducer.totalReducer)}/saca</span>
                  <span className="ml-2">({freightReducer.distanceKm} km)</span>
                </div>
              )}
            </div>

            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-foreground">Possui contrato de compra e venda?</Label>
                <Switch checked={hasContract} onCheckedChange={setHasContract} />
              </div>
              {hasContract && (
                <div>
                  <label className="stat-label">Preço do Contrato (R$/saca)</label>
                  <Input type="number" value={userPrice} onChange={e => setUserPrice(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" step={0.5} />
                </div>
              )}
            </div>

            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-foreground flex items-center gap-2"><Shield className="w-4 h-4 text-info" /> Seguro de Mercado</Label>
                <Switch checked={showInsurance} onCheckedChange={setShowInsurance} />
              </div>
              {showInsurance && (
                <div>
                  <label className="stat-label">Volatilidade (%)</label>
                  <Input type="number" value={volatility} onChange={e => setVolatility(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-2 space-y-4">
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 glow-border">
              <h3 className="text-sm font-semibold text-foreground mb-6">Resultado da Paridade</h3>
              <div className="flex items-center justify-center gap-6 mb-8">
                <div className="text-center"><div className="stat-label mb-1">Montante (R$)</div><div className="text-3xl font-bold font-mono text-foreground">{formatCurrency(amount)}</div></div>
                <ArrowRight className="w-8 h-8 text-primary" />
                <div className="text-center"><div className="stat-label mb-1">Sacas de Soja</div><div className="text-3xl font-bold font-mono text-success">{formatNum(insurancePremium?.totalSacas ?? parity.quantitySacas)}</div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/30 rounded-lg p-3 text-center"><div className="stat-label">Preço Líquido</div><div className="font-mono font-bold text-foreground text-lg">{formatCurrency(parity.commodityPricePerUnit)}</div><div className="text-xs text-muted-foreground">/saca interior</div></div>
                <div className="bg-muted/30 rounded-lg p-3 text-center"><div className="stat-label">Preço Valorizado</div><div className="font-mono font-bold text-primary text-lg">{formatCurrency(parity.referencePrice)}</div><div className="text-xs text-muted-foreground">/saca referência</div></div>
                <div className="bg-muted/30 rounded-lg p-3 text-center"><div className="stat-label">Valorização</div><div className={`font-mono font-bold text-lg ${parity.valorization > 0 ? 'text-success' : 'text-destructive'}`}>{parity.valorization > 0 ? '+' : ''}{formatNum(parity.valorization)}%</div><div className="text-xs text-muted-foreground">vs contrato</div></div>
                <div className="bg-muted/30 rounded-lg p-3 text-center"><div className="stat-label">Basis</div><div className="font-mono font-bold text-foreground text-lg">US$ {pricing.basisByPort[port]?.toFixed(2) ?? '0.00'}</div><div className="text-xs text-muted-foreground">{port}</div></div>
              </div>
            </motion.div>

            {showInsurance && insurancePremium && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-info" /> Seguro de Mercado (Black-Scholes)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div><div className="stat-label">Prêmio/Saca</div><div className="font-mono font-bold text-foreground">{formatCurrency(insurancePremium.premiumPerSaca)}</div></div>
                  <div><div className="stat-label">Sacas Adicionais</div><div className="font-mono font-bold text-warning">+{formatNum(insurancePremium.additionalSacas)}</div></div>
                  <div><div className="stat-label">Total c/ Seguro</div><div className="font-mono font-bold text-success text-lg">{formatNum(insurancePremium.totalSacas)} sacas</div></div>
                </div>
              </motion.div>
            )}

            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Precificação da Commodity</h3>
              <div className="space-y-2 text-sm font-mono">
                <PricingRow label="Preço Bolsa (CBOT)" value={`US$ ${pricing.exchangePrice}`} />
                <PricingRow label={`Basis ${port}`} value={`US$ ${pricing.basisByPort[port]?.toFixed(2)}`} />
                <PricingRow label="Preço FOB" value={`US$ ${(pricing.exchangePrice + (pricing.basisByPort[port] ?? 0)).toFixed(2)}`} />
                <PricingRow label="Câmbio" value={`R$ ${pricing.exchangeRateBolsa}`} />
                <PricingRow label="Preço FOB (R$/saca)" value={formatCurrency((pricing.exchangePrice + (pricing.basisByPort[port] ?? 0)) * pricing.exchangeRateBolsa)} />
                <PricingRow label="Delta Mercado" value={`-${pricing.securityDeltaMarket}%`} highlight />
                {freightReducer && <PricingRow label={`Frete ${freightReducer.origin}`} value={`-${formatCurrency(freightReducer.totalReducer)}`} highlight />}
                <PricingRow label="Delta Frete" value={`-${pricing.securityDeltaFreight}%`} highlight />
                <div className="pt-2 border-t border-border flex justify-between font-bold">
                  <span className="text-foreground">Preço Líquido Interior</span>
                  <span className="text-success">{formatCurrency(commodityNetPrice)}/saca</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PricingRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'text-warning' : 'text-foreground'}>{value}</span>
    </div>
  );
}
