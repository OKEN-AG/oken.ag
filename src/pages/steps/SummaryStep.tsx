interface SummaryStepProps {
  isActive: boolean;
  clientName: string;
  area: number;
  selections: any[];
  grossToNet: { grossRevenue: number; comboDiscount: number; directIncentiveDiscount?: number; netRevenue: number };
  parity: { quantitySacas: number; valorization: number };
  insurancePremium: any;
  consumptionLedger: Record<string, Record<string, number>> | undefined;
  comboActivations: any[];
  formatCurrency: (v: number) => string;
}

export function SummaryStep({
  isActive, clientName, area, selections, grossToNet, parity,
  insurancePremium, consumptionLedger, comboActivations, formatCurrency,
}: SummaryStepProps) {
  if (!isActive) return null;
  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Resumo Final</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div className="stat-label">Cliente</div><div className="text-foreground font-medium">{clientName || '—'}</div></div>
          <div><div className="stat-label">Área</div><div className="font-mono text-foreground">{area} ha</div></div>
          <div><div className="stat-label">Produtos</div><div className="font-mono text-foreground">{selections.length}</div></div>
          <div><div className="stat-label">Receita Bruta</div><div className="font-mono font-bold text-foreground">{formatCurrency(grossToNet.grossRevenue)}</div></div>
          <div><div className="stat-label">Desconto Total</div><div className="font-mono text-warning">-{formatCurrency(grossToNet.comboDiscount + (grossToNet.directIncentiveDiscount || 0))}</div></div>
          <div><div className="stat-label">Total a Pagar</div><div className="font-mono font-bold text-success text-xl">{formatCurrency(grossToNet.netRevenue)}</div></div>
          <div><div className="stat-label">Sacas</div><div className="font-mono font-bold text-foreground">{(insurancePremium?.totalSacas ?? parity.quantitySacas).toLocaleString('pt-BR')}</div></div>
          <div><div className="stat-label">Valorização</div><div className={`font-mono font-bold ${parity.valorization >= 0 ? 'text-success' : 'text-destructive'}`}>{parity.valorization.toFixed(1)}%</div></div>
        </div>
      </div>
      {consumptionLedger && Object.keys(consumptionLedger).length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Ledger de Consumo (Combos)</h3>
          {Object.entries(consumptionLedger).map(([comboId, refs]) => {
            const ca = comboActivations.find((a: any) => a.comboId === comboId);
            return (
              <div key={comboId} className="mb-2">
                <div className="text-xs font-medium text-foreground">{ca?.comboName || comboId}</div>
                <div className="flex gap-2 mt-1">
                  {Object.entries(refs as Record<string, number>).map(([ref, qty]) => (
                    <span key={ref} className="engine-badge bg-muted text-muted-foreground text-xs">{ref}: {qty.toFixed(0)}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
