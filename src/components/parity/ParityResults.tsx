import { motion } from 'framer-motion';
import { ArrowRight, Shield, TrendingUp } from 'lucide-react';
import type { CommodityPricing, FreightReducer, ParityResult } from '@/types/barter';

interface InsurancePremium {
  premiumPerSaca: number;
  additionalSacas: number;
  totalSacas: number;
}

interface ParityResultsProps {
  amount: number;
  parity: ParityResult;
  insurancePremium: InsurancePremium | null;
  pricing: CommodityPricing;
  port: string;
  freightReducer?: FreightReducer;
  commodityNetPrice: number;
  showInsurance: boolean;
  commodityName?: string;
  valorizationBonus?: number; // I6
  formatCurrency: (v: number) => string;
  formatNum: (v: number) => string;
}

export default function ParityResults({
  amount, parity, insurancePremium, pricing, port, freightReducer,
  commodityNetPrice, showInsurance, commodityName, valorizationBonus, formatCurrency, formatNum,
}: ParityResultsProps) {
  return (
    <div className="lg:col-span-2 space-y-4">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 glow-border">
        <h3 className="text-sm font-semibold text-foreground mb-6">Resultado da Paridade</h3>
        <div className="flex items-center justify-center gap-6 mb-8">
          <div className="text-center"><div className="stat-label mb-1">Montante (R$)</div><div className="text-3xl font-bold font-mono text-foreground">{formatCurrency(amount)}</div></div>
          <ArrowRight className="w-8 h-8 text-primary" />
          <div className="text-center"><div className="stat-label mb-1">Sacas de {commodityName || 'Commodity'}</div><div className="text-3xl font-bold font-mono text-success">{formatNum(insurancePremium?.totalSacas ?? parity.quantitySacas)}</div></div>
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
          {(() => {
            const bushelsPerTon = pricing.bushelsPerTon || 36.744;
            const pesoSacaKg = pricing.pesoSacaKg || 60;
            const sacasPerTon = 1000 / pesoSacaKg;
            const basis = pricing.basisByPort[port] ?? 0;
            const fobUsdTon = (pricing.exchangePrice + basis) * bushelsPerTon;
            const fobBrlTon = fobUsdTon * pricing.exchangeRateBolsa;
            const fobBrlSaca = fobBrlTon / sacasPerTon;
            const afterMarketDelta = fobBrlTon * (1 - pricing.securityDeltaMarket / 100);
            const freightCostTon = freightReducer?.totalReducer ?? 0;
            const interiorTon = afterMarketDelta - freightCostTon;
            const netTon = interiorTon * (1 - pricing.securityDeltaFreight / 100);
            const netSaca = netTon / sacasPerTon;
            return (
              <>
                <PricingRow label="Preço Bolsa (CBOT)" value={`US$ ${pricing.exchangePrice.toFixed(4)}/bu`} />
                <PricingRow label={`Basis ${port}`} value={`US$ ${basis.toFixed(2)}/bu`} />
                <PricingRow label="FOB (USD/ton)" value={`US$ ${fobUsdTon.toFixed(2)}`} />
                <PricingRow label="Câmbio" value={`R$ ${pricing.exchangeRateBolsa.toFixed(4)}`} />
                <PricingRow label="FOB (R$/ton)" value={formatCurrency(fobBrlTon)} />
                <PricingRow label="FOB (R$/saca)" value={formatCurrency(fobBrlSaca)} />
                <PricingRow label="Delta Mercado" value={`-${pricing.securityDeltaMarket}%`} highlight />
                {freightReducer && <PricingRow label={`Frete ${freightReducer.origin}`} value={`-${formatCurrency(freightReducer.totalReducer)}/ton`} highlight />}
                <PricingRow label="Delta Frete" value={`-${pricing.securityDeltaFreight}%`} highlight />
                <div className="pt-2 border-t border-border flex justify-between font-bold">
                  <span className="text-foreground">Preço Líquido Interior</span>
                  <span className="text-foreground">{formatCurrency(netSaca)}/saca</span>
                </div>
                {/* I6: Show valorization bonus */}
                {(valorizationBonus || 0) > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Valorização Padrão</span>
                    <span>+{formatCurrency(valorizationBonus!)}/saca</span>
                  </div>
                )}
                <div className="pt-1 border-t border-border flex justify-between font-bold text-lg">
                  <span className="text-foreground">Preço Efetivo</span>
                  <span className="text-success">{formatCurrency(commodityNetPrice)}/saca</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>
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
