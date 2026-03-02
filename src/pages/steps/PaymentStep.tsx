import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface PaymentStepProps {
  isActive: boolean;
  paymentMethods: any[] | undefined;
  selectedPaymentMethod: string;
  selectedPM: any;
  onPaymentMethodChange: (v: string) => void;
  grossToNet: { netRevenue: number; financialRevenue: number; distributorMargin: number };
  simLoading: boolean;
  formatCurrency: (v: number) => string;
}

export function PaymentStep({
  isActive, paymentMethods, selectedPaymentMethod, selectedPM,
  onPaymentMethodChange, grossToNet, simLoading, formatCurrency,
}: PaymentStepProps) {
  if (!isActive) return null;
  return (
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
  );
}
