import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { mockCommodityPricing, mockFreightReducers } from '@/data/mock-data';
import { calculateCommodityNetPrice, calculateParity, blackScholes } from '@/engines/parity';
import { Wheat, ArrowRight, TrendingUp, DollarSign, Truck, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function ParityPage() {
  const location = useLocation();
  const stateAmount = (location.state as any)?.amount ?? 500000;
  const stateGross = (location.state as any)?.grossAmount ?? 600000;

  const [amount, setAmount] = useState(stateAmount);
  const [grossAmount] = useState(stateGross);
  const [port, setPort] = useState('Paranaguá (PR)');
  const [freightOrigin, setFreightOrigin] = useState('Londrina (PR)');
  const [hasContract, setHasContract] = useState(false);
  const [userPrice, setUserPrice] = useState(0);
  const [showInsurance, setShowInsurance] = useState(false);
  const [volatility, setVolatility] = useState(25);

  const freightReducer = mockFreightReducers.find(f => f.origin === freightOrigin);

  const commodityNetPrice = useMemo(() => {
    return calculateCommodityNetPrice(mockCommodityPricing, port, freightReducer);
  }, [port, freightReducer]);

  const parity = useMemo(() => {
    return calculateParity(amount, commodityNetPrice, hasContract ? userPrice : undefined, grossAmount);
  }, [amount, commodityNetPrice, hasContract, userPrice, grossAmount]);

  // Insurance (Black-Scholes)
  const insurancePremium = useMemo(() => {
    if (!showInsurance) return null;
    const spotPrice = mockCommodityPricing.exchangePrice * mockCommodityPricing.exchangeRateBolsa;
    const premium = blackScholes(spotPrice, spotPrice * 1.05, 0.5, 0.06, volatility / 100, true);
    const premiumPerSaca = premium * 16.667; // bushel to saca conversion approximation
    const additionalSacas = Math.ceil(premiumPerSaca * parity.quantitySacas / commodityNetPrice);
    return { premiumPerSaca, additionalSacas, totalSacas: parity.quantitySacas + additionalSacas };
  }, [showInsurance, volatility, parity, commodityNetPrice]);

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paridade Barter</h1>
        <p className="text-sm text-muted-foreground">Conversão do montante em sacas de commodity</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Inputs */}
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" /> Montante
            </h3>
            <div>
              <label className="stat-label">Valor Total do Pedido (R$)</label>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="mt-1 bg-muted border-border font-mono text-foreground" />
            </div>
          </div>

          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Wheat className="w-4 h-4 text-primary" /> Commodity
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded p-2">
                <span className="text-muted-foreground">Bolsa</span>
                <div className="font-mono font-medium text-foreground">{mockCommodityPricing.exchange}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <span className="text-muted-foreground">Contrato</span>
                <div className="font-mono font-medium text-foreground">{mockCommodityPricing.contract}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <span className="text-muted-foreground">Preço Bolsa</span>
                <div className="font-mono font-medium text-foreground">US$ {mockCommodityPricing.exchangePrice}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <span className="text-muted-foreground">Câmbio</span>
                <div className="font-mono font-medium text-foreground">R$ {mockCommodityPricing.exchangeRateBolsa}</div>
              </div>
            </div>
          </div>

          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" /> Logística
            </h3>
            <div>
              <label className="stat-label">Porto de Referência</label>
              <Select value={port} onValueChange={setPort}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(mockCommodityPricing.basisByPort).map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="stat-label">Origem (Frete)</label>
              <Select value={freightOrigin} onValueChange={setFreightOrigin}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mockFreightReducers.map(f => (
                    <SelectItem key={f.origin} value={f.origin}>{f.origin}</SelectItem>
                  ))}
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
              <Label className="text-sm text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-info" /> Seguro de Mercado
              </Label>
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
          {/* Main parity card */}
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 glow-border">
            <h3 className="text-sm font-semibold text-foreground mb-6">Resultado da Paridade</h3>

            <div className="flex items-center justify-center gap-6 mb-8">
              <div className="text-center">
                <div className="stat-label mb-1">Montante (R$)</div>
                <div className="text-3xl font-bold font-mono text-foreground">{formatCurrency(amount)}</div>
              </div>
              <ArrowRight className="w-8 h-8 text-primary" />
              <div className="text-center">
                <div className="stat-label mb-1">Sacas de Soja</div>
                <div className="text-3xl font-bold font-mono text-success">
                  {formatNum(insurancePremium?.totalSacas ?? parity.quantitySacas)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="stat-label">Preço Líquido</div>
                <div className="font-mono font-bold text-foreground text-lg">{formatCurrency(parity.commodityPricePerUnit)}</div>
                <div className="text-xs text-muted-foreground">/saca interior</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="stat-label">Preço Valorizado</div>
                <div className="font-mono font-bold text-primary text-lg">{formatCurrency(parity.referencePrice)}</div>
                <div className="text-xs text-muted-foreground">/saca referência</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="stat-label">Valorização</div>
                <div className={`font-mono font-bold text-lg ${parity.valorization > 0 ? 'text-success' : 'text-destructive'}`}>
                  {parity.valorization > 0 ? '+' : ''}{formatNum(parity.valorization)}%
                </div>
                <div className="text-xs text-muted-foreground">vs contrato</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="stat-label">Basis</div>
                <div className="font-mono font-bold text-foreground text-lg">
                  US$ {mockCommodityPricing.basisByPort[port]?.toFixed(2) ?? '0.00'}
                </div>
                <div className="text-xs text-muted-foreground">{port}</div>
              </div>
            </div>
          </motion.div>

          {/* Insurance result */}
          {showInsurance && insurancePremium && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-info" /> Seguro de Mercado (Black-Scholes)
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="stat-label">Prêmio/Saca</div>
                  <div className="font-mono font-bold text-foreground">{formatCurrency(insurancePremium.premiumPerSaca)}</div>
                </div>
                <div>
                  <div className="stat-label">Sacas Adicionais</div>
                  <div className="font-mono font-bold text-warning">+{formatNum(insurancePremium.additionalSacas)}</div>
                </div>
                <div>
                  <div className="stat-label">Total c/ Seguro</div>
                  <div className="font-mono font-bold text-success text-lg">{formatNum(insurancePremium.totalSacas)} sacas</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Pricing breakdown */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Precificação da Commodity</h3>
            <div className="space-y-2 text-sm font-mono">
              <Row label="Preço Bolsa (CBOT)" value={`US$ ${mockCommodityPricing.exchangePrice}`} />
              <Row label={`Basis ${port}`} value={`US$ ${mockCommodityPricing.basisByPort[port]?.toFixed(2)}`} />
              <Row label="Preço FOB" value={`US$ ${(mockCommodityPricing.exchangePrice + (mockCommodityPricing.basisByPort[port] ?? 0)).toFixed(2)}`} />
              <Row label="Câmbio" value={`R$ ${mockCommodityPricing.exchangeRateBolsa}`} />
              <Row label="Preço FOB (R$/saca)" value={formatCurrency((mockCommodityPricing.exchangePrice + (mockCommodityPricing.basisByPort[port] ?? 0)) * mockCommodityPricing.exchangeRateBolsa)} />
              <Row label="Delta Mercado" value={`-${mockCommodityPricing.securityDeltaMarket}%`} highlight />
              {freightReducer && <Row label={`Frete ${freightReducer.origin}`} value={`-${formatCurrency(freightReducer.totalReducer)}`} highlight />}
              <Row label="Delta Frete" value={`-${mockCommodityPricing.securityDeltaFreight}%`} highlight />
              <div className="pt-2 border-t border-border flex justify-between font-bold">
                <span className="text-foreground">Preço Líquido Interior</span>
                <span className="text-success">{formatCurrency(commodityNetPrice)}/saca</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'text-warning' : 'text-foreground'}>{value}</span>
    </div>
  );
}
