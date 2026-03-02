import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateCreditSchedule, calculateCreditSummary, type AmortizationMethod } from '@/lib/credit-engine';

interface PaymentStepProps {
  isActive: boolean;
  paymentMethods: any[] | undefined;
  selectedPaymentMethod: string;
  selectedPM: any;
  onPaymentMethodChange: (v: string) => void;
  grossToNet: { netRevenue: number; financialRevenue: number; distributorMargin: number };
  simLoading: boolean;
  formatCurrency: (v: number) => string;
  dueMonths: number;
  monthlyRate: number;
}

export function PaymentStep({
  isActive, paymentMethods, selectedPaymentMethod, selectedPM,
  onPaymentMethodChange, grossToNet, simLoading, formatCurrency,
  dueMonths, monthlyRate,
}: PaymentStepProps) {
  const [amortMethod, setAmortMethod] = useState<AmortizationMethod>('PRICE');
  const [showSchedule, setShowSchedule] = useState(false);

  const creditSummary = useMemo(() => {
    if (grossToNet.netRevenue <= 0 || dueMonths <= 0) return null;
    return calculateCreditSummary({
      principal: grossToNet.netRevenue,
      termMonths: dueMonths,
      monthlyRate: monthlyRate / 100,
      method: amortMethod,
    });
  }, [grossToNet.netRevenue, dueMonths, monthlyRate, amortMethod]);

  if (!isActive) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Meio de Pagamento</label>
          <Select value={selectedPaymentMethod || selectedPM?.id || ''} onValueChange={onPaymentMethodChange}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {paymentMethods?.map(pm => (
                <SelectItem key={pm.id} value={pm.id}>
                  {pm.method_name} {pm.markup_percent !== 0 ? `(${pm.markup_percent > 0 ? '+' : ''}${pm.markup_percent}%)` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4 relative">
          {simLoading && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}
          <div className="stat-label">Montante Final</div>
          <div className="font-mono text-2xl font-bold text-success mt-2">{formatCurrency(grossToNet.netRevenue)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Juros: {formatCurrency(grossToNet.financialRevenue)} | Margem: {formatCurrency(grossToNet.distributorMargin)}
          </div>
        </div>
      </div>

      {/* Credit Schedule */}
      {dueMonths > 0 && grossToNet.netRevenue > 0 && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Cronograma de Parcelas</h3>
            <div className="flex items-center gap-2">
              <Select value={amortMethod} onValueChange={v => setAmortMethod(v as AmortizationMethod)}>
                <SelectTrigger className="h-7 w-32 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRICE">Price (Francês)</SelectItem>
                  <SelectItem value="SAC">SAC</SelectItem>
                  <SelectItem value="BULLET">Bullet</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowSchedule(!showSchedule)}>
                {showSchedule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          {creditSummary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="stat-label">Total Pago</div><div className="font-mono text-sm font-bold text-foreground">{formatCurrency(creditSummary.totalPaid)}</div></div>
                <div><div className="stat-label">Total Juros</div><div className="font-mono text-sm text-warning">{formatCurrency(creditSummary.totalInterest)}</div></div>
                <div><div className="stat-label">Custo Total</div><div className="font-mono text-sm text-destructive">{formatCurrency(creditSummary.totalCost)}</div></div>
                <div><div className="stat-label">CET Anual</div><div className="font-mono text-sm font-bold text-primary">{(creditSummary.cetAnnual * 100).toFixed(2)}%</div></div>
              </div>

              {showSchedule && (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium text-muted-foreground">#</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Principal</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Juros</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Parcela</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditSummary.schedule.map(inst => (
                        <tr key={inst.installmentNumber} className="border-b border-border/30">
                          <td className="p-2 font-mono text-muted-foreground">{inst.installmentNumber}</td>
                          <td className="p-2 font-mono text-right text-foreground">{formatCurrency(inst.principal)}</td>
                          <td className="p-2 font-mono text-right text-warning">{formatCurrency(inst.interest)}</td>
                          <td className="p-2 font-mono text-right font-medium text-foreground">{formatCurrency(inst.payment)}</td>
                          <td className="p-2 font-mono text-right text-muted-foreground">{formatCurrency(inst.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
