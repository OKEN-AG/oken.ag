import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/NumericInput';
import { AlertTriangle, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import type { ContractPriceType } from '@/types/barter';

interface PriceTrailData {
  exchangePrice?: number;
  exchange?: string;
  contract?: string;
  exchangeRateBolsa?: number;
  basisByPort?: Record<string, number>;
  securityDeltaMarket?: number;
  securityDeltaFreight?: number;
  bushelsPerTon?: number;
  pesoSacaKg?: number;
}

interface BarterStepProps {
  isActive: boolean;
  freightOrigin: string;
  onFreightOriginChange: (v: string) => void;
  freightReducers: { origin: string; destination: string; distanceKm: number; totalReducer: number }[];
  deliveryLocations: any[];
  port: string;
  onPortChange: (v: string) => void;
  selectedBuyerId: string;
  onBuyerChange: (v: string) => void;
  buyers: any[];
  counterpartyOther: string;
  onCounterpartyOtherChange: (v: string) => void;
  contractPriceType: ContractPriceType;
  onContractPriceTypeChange: (v: ContractPriceType) => void;
  hasContract: boolean;
  onHasContractChange: (v: boolean) => void;
  userPrice: number;
  onUserPriceChange: (v: number) => void;
  commodityNetPrice: number;
  parity: { quantitySacas: number; referencePrice: number; valorization: number; commodityPricePerUnit: number };
  freightReducer: { totalReducer: number; distanceKm: number } | undefined;
  ivp: number;
  buyerFee: number;
  selectedValorization: any;
  showInsurance: boolean;
  onShowInsuranceChange: (v: boolean) => void;
  insurancePremium: any;
  formatCurrency: (v: number) => string;
  priceTrail?: PriceTrailData | null;
}

function TrailStep({ label, value, formula, isLast }: { label: string; value: string; formula?: string; isLast?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted/50 rounded px-3 py-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-mono text-sm font-bold text-foreground">{value}</div>
        {formula && <div className="text-[10px] text-muted-foreground mt-0.5">{formula}</div>}
      </div>
      {!isLast && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
    </div>
  );
}

export function BarterStep({
  isActive, freightOrigin, onFreightOriginChange, freightReducers, deliveryLocations,
  port, onPortChange, selectedBuyerId, onBuyerChange, buyers, counterpartyOther,
  onCounterpartyOtherChange, contractPriceType, onContractPriceTypeChange,
  hasContract, onHasContractChange, userPrice, onUserPriceChange,
  commodityNetPrice, parity, freightReducer, ivp, buyerFee, selectedValorization,
  showInsurance, onShowInsuranceChange, insurancePremium, formatCurrency,
  priceTrail,
}: BarterStepProps) {
  const [showTrail, setShowTrail] = useState(false);

  if (!isActive) return null;

  const basis = priceTrail?.basisByPort?.[port] ?? 0;
  const priceUsdBu = (priceTrail?.exchangePrice ?? 0) / 100; // cents to dollars
  const priceBrl = priceUsdBu * (priceTrail?.exchangeRateBolsa ?? 1);
  const withBasis = priceBrl + basis;
  const bushelsPerTon = priceTrail?.bushelsPerTon ?? 36.744;
  const pesoSacaKg = priceTrail?.pesoSacaKg ?? 60;
  const tonPerSaca = pesoSacaKg / 1000;
  const pricePerSacaPreFreight = withBasis * bushelsPerTon * tonPerSaca;
  const freightDeduction = freightReducer?.totalReducer ?? 0;
  const afterFreight = pricePerSacaPreFreight - freightDeduction;
  const deltaMarket = priceTrail?.securityDeltaMarket ?? 0;
  const deltaFreight = priceTrail?.securityDeltaFreight ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Local de Entrega</label>
          <Select value={freightOrigin} onValueChange={v => {
            onFreightOriginChange(v);
            const fr = freightReducers.find(f => f.origin === v);
            if (fr?.destination) onPortChange(fr.destination);
          }}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione o local..." /></SelectTrigger>
            <SelectContent>
              {deliveryLocations.length > 0
                ? deliveryLocations.map((loc: any) => <SelectItem key={loc.id} value={loc.warehouse_name}>{loc.warehouse_name} — {loc.city}/{loc.state}</SelectItem>)
                : freightReducers.map(f => <SelectItem key={f.origin} value={f.origin}>{f.origin} → {f.destination} ({f.distanceKm}km)</SelectItem>)
              }
            </SelectContent>
          </Select>
        </div>
        {freightReducer && freightReducer.totalReducer > 0 && (
          <div className="glass-card p-4">
            <div className="text-xs text-muted-foreground">Redutor logístico: R$ {freightReducer.totalReducer.toFixed(2)}/sc ({freightReducer.distanceKm}km) — Porto: {port || '—'}</div>
          </div>
        )}
        <div className="glass-card p-4">
          <label className="stat-label">Comprador</label>
          <Select value={selectedBuyerId} onValueChange={onBuyerChange}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {(buyers || []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.buyer_name} {b.fee ? `(fee: ${b.fee}%)` : ''}</SelectItem>)}
              <SelectItem value="__other__">Outro (informar)</SelectItem>
            </SelectContent>
          </Select>
          {selectedBuyerId === '__other__' && (
            <Input value={counterpartyOther} onChange={e => onCounterpartyOtherChange(e.target.value)} placeholder="Nome do comprador" className="mt-2 bg-muted border-border text-foreground text-xs" />
          )}
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Tipo de Preço</label>
          <Select value={contractPriceType} onValueChange={v => onContractPriceTypeChange(v as ContractPriceType)}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixo">Preço Fixo (PF)</SelectItem>
              <SelectItem value="a_fixar">A Fixar (PAF)</SelectItem>
              <SelectItem value="pre_existente">Pré-existente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Switch checked={hasContract} onCheckedChange={onHasContractChange} />
            <Label className="text-xs">Contrato existente</Label>
          </div>
          {hasContract && <NumericInput value={userPrice} onChange={onUserPriceChange} decimals={2} prefix="R$" placeholder="0,00" className="bg-muted border-border text-foreground" />}
        </div>
      </div>

      {/* Price Formation Trail */}
      {priceTrail && priceTrail.exchangePrice !== undefined && (
        <div className="glass-card p-4">
          <button onClick={() => setShowTrail(!showTrail)} className="flex items-center justify-between w-full text-left">
            <h3 className="text-sm font-semibold text-foreground">Trilha de Formação de Preço</h3>
            {showTrail ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showTrail && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <TrailStep label={`Bolsa ${priceTrail.exchange || 'CBOT'} (${priceTrail.contract || ''})`} value={`${(priceTrail.exchangePrice ?? 0).toFixed(2)} ¢/bu`} formula="Preço cotação" />
              <TrailStep label="Câmbio" value={`R$ ${(priceTrail.exchangeRateBolsa ?? 0).toFixed(4)}`} formula={`= USD ${priceUsdBu.toFixed(4)}/bu × R$`} />
              <TrailStep label={`Basis ${port || '—'}`} value={`USD ${basis.toFixed(2)}/bu`} formula="Prêmio porto" />
              <TrailStep label="Preço/sc (pré-frete)" value={formatCurrency(pricePerSacaPreFreight)} formula={`${bushelsPerTon} bu/ton × ${tonPerSaca.toFixed(3)} ton/sc`} />
              <TrailStep label="Redutor Frete" value={`- ${formatCurrency(freightDeduction)}/sc`} formula={freightReducer ? `${freightReducer.distanceKm}km` : '—'} />
              <TrailStep label="Deltas (%)" value={`Mkt: ${deltaMarket}% | Frt: ${deltaFreight}%`} formula="Margem de segurança" />
              <TrailStep label="Preço Net/sc" value={formatCurrency(commodityNetPrice)} formula="Preço final calculado" isLast />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card p-4"><div className="stat-label">Preço Net/sc</div><div className="font-mono text-lg font-bold text-foreground">{formatCurrency(commodityNetPrice)}</div></div>
        <div className="glass-card p-4"><div className="stat-label">Sacas</div><div className="font-mono text-lg font-bold text-success">{parity.quantitySacas.toLocaleString('pt-BR')}</div></div>
        <div className="glass-card p-4"><div className="stat-label">Preço Valorizado</div><div className="font-mono text-lg font-bold text-info">{formatCurrency(parity.referencePrice)}</div></div>
        <div className="glass-card p-4"><div className="stat-label">Valorização</div><div className={`font-mono text-lg font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{parity.valorization.toFixed(1)}%</div></div>
        <div className="glass-card p-4"><div className="stat-label">Diferença</div><div className={`font-mono text-lg font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(parity.referencePrice - parity.commodityPricePerUnit)}/sc</div></div>
      </div>
      {ivp < 1 && (
        <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
          Contrato "A Fixar" — fator de ajuste: {(ivp * 100).toFixed(0)}% (desconto de {((1 - ivp) * 100).toFixed(0)}% por risco de variação de preço)
        </div>
      )}
      {buyerFee > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">Fee do comprador: {buyerFee}% — já aplicado no preço net/sc</div>
      )}
      {selectedValorization && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">
          Valorização: {selectedValorization.use_percent ? `${selectedValorization.percent_value}%` : `R$ ${selectedValorization.nominal_value}/sc`} — já aplicada
        </div>
      )}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2"><Switch checked={showInsurance} onCheckedChange={onShowInsuranceChange} /><Label className="text-xs">Seguro de Mercado (Opção)</Label></div>
        {showInsurance && insurancePremium && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div><div className="stat-label">Prêmio/sc</div><div className="font-mono text-foreground">{formatCurrency(insurancePremium.premiumPerSaca)}</div></div>
            <div><div className="stat-label">Sacas adicionais</div><div className="font-mono text-warning">{insurancePremium.additionalSacas}</div></div>
            <div><div className="stat-label">Total c/ seguro</div><div className="font-mono font-bold text-success">{insurancePremium.totalSacas.toLocaleString('pt-BR')} sc</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
