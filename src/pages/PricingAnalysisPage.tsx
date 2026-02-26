import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type PricingDebugRow = {
  productId: string;
  code: string;
  ref: string;
  productName: string;
  unitType: string;
  quantity: number;
  sourceField: string;
  sourceValue: number;
  listCurrency: 'BRL' | 'USD';
  exchangeRateProducts: number;
  priceAfterFx: number;
  dueMonths: number;
  campaignMonthlyRatePercent: number;
  paymentMethodAnnualRatePercent: number;
  paymentMethodMonthlyRatePercent: number;
  interestMultiplier: number;
  interestPerUnit: number;
  priceWithInterest: number;
  channelSegment: string;
  marginPercent: number;
  marginPerUnit: number;
  priceWithMargin: number;
  segmentName: string;
  segmentAdjustmentPercent: number;
  segmentAdjPerUnit: number;
  priceWithSegAdj: number;
  paymentMethodMarkupPercent: number;
  paymentMarkupPerUnit: number;
  normalizedPrice: number;
  subtotal: number;
};

const brMoney = (v: number, c: 'BRL' | 'USD') => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: c });

export default function PricingAnalysisPage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['operation-pricing-analysis', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_pricing_snapshots')
        .select('snapshot, created_at, snapshot_type')
        .eq('operation_id', id!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(() => ((data?.snapshot as any)?.pricingDebugRows || []) as PricingDebugRow[], [data]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Análise de Cálculo de Preços</h1>
          <p className="text-sm text-muted-foreground">Operação {id} · Snapshot mais recente</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/operacao/${id}`}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Carregando...</div> : null}
      {!isLoading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum pricingDebugRows encontrado no snapshot da operação.</div>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Produto</th>
                <th className="p-2 text-left">Canal/Segmento</th>
                <th className="p-2 text-left">Origem Preço</th>
                <th className="p-2 text-right">Base</th>
                <th className="p-2 text-right">Juros</th>
                <th className="p-2 text-right">Margem</th>
                <th className="p-2 text-right">Ajuste Seg</th>
                <th className="p-2 text-right">Markup PM</th>
                <th className="p-2 text-right">Preço Final</th>
                <th className="p-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{r.productName}</div>
                    <div className="text-muted-foreground">{r.ref || r.code} · {r.quantity} {r.unitType}</div>
                  </td>
                  <td className="p-2">{r.channelSegment} / {r.segmentName}</td>
                  <td className="p-2">{r.sourceField} ({r.listCurrency})</td>
                  <td className="p-2 text-right">{brMoney(r.priceAfterFx, 'BRL')}</td>
                  <td className="p-2 text-right">{brMoney(r.interestPerUnit, 'BRL')} <span className="text-muted-foreground">({r.interestMultiplier.toFixed(4)})</span></td>
                  <td className="p-2 text-right">{brMoney(r.marginPerUnit, 'BRL')} <span className="text-muted-foreground">({r.marginPercent.toFixed(2)}%)</span></td>
                  <td className="p-2 text-right">{brMoney(r.segmentAdjPerUnit, 'BRL')} <span className="text-muted-foreground">({r.segmentAdjustmentPercent.toFixed(2)}%)</span></td>
                  <td className="p-2 text-right">{brMoney(r.paymentMarkupPerUnit, 'BRL')} <span className="text-muted-foreground">({r.paymentMethodMarkupPercent.toFixed(2)}%)</span></td>
                  <td className="p-2 text-right font-semibold">{brMoney(r.normalizedPrice, 'BRL')}</td>
                  <td className="p-2 text-right font-semibold">{brMoney(r.subtotal, 'BRL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
