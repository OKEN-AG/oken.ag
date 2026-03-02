import type { Product } from '@/types/barter';
import { ShoppingCart } from 'lucide-react';

interface SimulationStepProps {
  isActive: boolean;
  products: Product[];
  pricingResults: any[];
  grossToNet: {
    grossRevenue: number;
    comboDiscount: number;
    directIncentiveDiscount?: number;
    distributorMargin: number;
    netRevenue: number;
  };
  formatCurrency: (v: number) => string;
}

export function SimulationStep({ isActive, products, pricingResults, grossToNet, formatCurrency }: SimulationStepProps) {
  if (!isActive) return null;
  return (
    <div className="glass-card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-primary" /> Breakdown da Simulação
      </h2>
      <div className="space-y-1">
        {pricingResults.map(pr => {
          const prod = products.find(p => p.id === pr.productId);
          return (
            <div key={pr.productId} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
              <span className="text-foreground">{prod?.name}</span>
              <div className="flex items-center gap-4 font-mono text-xs">
                <span className="text-muted-foreground">{pr.quantity.toFixed(0)} {prod?.unitType}</span>
                <span className="text-muted-foreground">{formatCurrency(pr.normalizedPrice)}/{prod?.unitType}</span>
                <span className="text-foreground font-medium w-28 text-right">{formatCurrency(pr.subtotal)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border">
        <div><div className="stat-label">Receita Bruta</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div></div>
        <div><div className="stat-label">Desconto Total</div><div className="font-mono font-bold text-warning">-{formatCurrency(grossToNet.comboDiscount + (grossToNet.directIncentiveDiscount || 0))}</div></div>
        <div><div className="stat-label">Margem Canal</div><div className="font-mono text-muted-foreground">{formatCurrency(grossToNet.distributorMargin)}</div></div>
        <div><div className="stat-label">Total a Pagar</div><div className="font-mono font-bold text-xl text-success">{formatCurrency(grossToNet.netRevenue)}</div></div>
      </div>
    </div>
  );
}
