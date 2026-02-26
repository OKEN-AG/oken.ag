import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PRICING_MEMORY_DICTIONARY } from '@/data/pricing-memory-dictionary';

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
  feesOkenPercent: number;
  g2nComboDiscountAllocated: number;
  g2nBarterDiscountAllocated: number;
  g2nDirectIncentiveAllocated: number;
  g2nNetRevenueAllocated: number;
  parityCommodity: string | null;
  parityPricePerSaca: number | null;
};

type GrossToNetResult = {
  grossRevenue: number;
  comboDiscount: number;
  barterDiscount: number;
  directIncentiveDiscount: number;
  netRevenue: number;
  financialRevenue: number;
  distributorMargin: number;
  segmentAdjustment: number;
  paymentMethodMarkup: number;
  barterCost: number;
  netNetRevenue: number;
};

const brMoney = (v: number, c: 'BRL' | 'USD' = 'BRL') => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: c });

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

  const snapshot = useMemo(() => (data?.snapshot as any) || {}, [data]);
  const rows = useMemo(() => (snapshot.pricingDebugRows || []) as PricingDebugRow[], [snapshot]);
  const g2n = useMemo(() => (snapshot.grossToNet || null) as GrossToNetResult | null, [snapshot]);
  const commodityNetPrice = useMemo(() => snapshot.commodityNetPrice as number | null, [snapshot]);
  
  const dictionaryByModule = useMemo(() => PRICING_MEMORY_DICTIONARY.reduce((acc, item) => {
    acc[item.module] = (acc[item.module] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), []);

  // Calculate net totals for parity
  const netTotals = useMemo(() => {
    if (!rows.length) return null;
    const grossTotal = rows.reduce((s, r) => s + (r.subtotal || 0), 0);
    const netTotal = g2n?.netRevenue ?? grossTotal;
    return { grossTotal, netTotal };
  }, [rows, g2n]);

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

      <div className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(dictionaryByModule).map(([module, count]) => (
          <span key={module} className="px-2 py-1 rounded bg-muted">{module}: {count} campos</span>
        ))}
      </div>

      {/* Gross-to-Net Summary */}
      {g2n && (
        <div className="border border-border rounded-md p-4 space-y-2">
          <h2 className="text-sm font-semibold">Resumo Gross-to-Net</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div><span className="text-muted-foreground">Bruto</span><div className="font-mono font-bold">{brMoney(g2n.grossRevenue)}</div></div>
            <div><span className="text-muted-foreground">Desc. Combo</span><div className="font-mono text-warning">-{brMoney(g2n.comboDiscount)}</div></div>
            <div><span className="text-muted-foreground">Desc. Barter</span><div className="font-mono text-warning">-{brMoney(g2n.barterDiscount)}</div></div>
            <div><span className="text-muted-foreground">Desc. Incentivo</span><div className="font-mono text-warning">-{brMoney(g2n.directIncentiveDiscount)}</div></div>
            <div><span className="text-muted-foreground">Receita Líquida</span><div className="font-mono font-bold text-success">{brMoney(g2n.netRevenue)}</div></div>
            <div><span className="text-muted-foreground">Margem Canal</span><div className="font-mono">{brMoney(g2n.distributorMargin)}</div></div>
            <div><span className="text-muted-foreground">Ajuste Segmento</span><div className="font-mono">{brMoney(g2n.segmentAdjustment)}</div></div>
            <div><span className="text-muted-foreground">Receita Financeira</span><div className="font-mono">{brMoney(g2n.financialRevenue)}</div></div>
          </div>
        </div>
      )}

      {/* Parity Summary */}
      {netTotals && commodityNetPrice && commodityNetPrice > 0 && (
        <div className="border border-border rounded-md p-4 space-y-2">
          <h2 className="text-sm font-semibold">Paridade (Valores Líquidos)</h2>
          <p className="text-[10px] text-muted-foreground">Paridade = montante líquido ÷ preço líquido commodity. Todos os acréscimos e descontos já aplicados.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Montante Líquido</span>
              <div className="font-mono font-bold">{brMoney(netTotals.netTotal)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Preço Commodity</span>
              <div className="font-mono font-bold">{brMoney(commodityNetPrice)}/sc</div>
            </div>
            <div>
              <span className="text-muted-foreground">Paridade Total (sacas)</span>
              <div className="font-mono font-bold text-success">{Math.ceil(netTotals.netTotal / commodityNetPrice).toLocaleString('pt-BR')}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Preço Valorizado</span>
              <div className="font-mono font-bold text-primary">
                {brMoney(netTotals.grossTotal / Math.ceil(netTotals.netTotal / commodityNetPrice))}/sc
              </div>
            </div>
          </div>
        </div>
      )}

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
                <th className="p-2 text-left">Canal</th>
                <th className="p-2 text-left">Segmento</th>
                <th className="p-2 text-left">Origem Preço</th>
                <th className="p-2 text-right">Base</th>
                <th className="p-2 text-right">Juros</th>
                <th className="p-2 text-right">Margem Canal</th>
                <th className="p-2 text-right">Ajuste Seg.</th>
                <th className="p-2 text-right">Markup PM</th>
                <th className="p-2 text-right">Preço Final</th>
                <th className="p-2 text-right">Subtotal</th>
                <th className="p-2 text-right">G2N Net</th>
                {commodityNetPrice && commodityNetPrice > 0 && (
                  <>
                    <th className="p-2 text-right">Paridade Unit.</th>
                    <th className="p-2 text-right">Paridade Subtot.</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const netSubtotal = r.g2nNetRevenueAllocated || r.subtotal || 0;
                const unitParity = commodityNetPrice && commodityNetPrice > 0
                  ? r.normalizedPrice / commodityNetPrice
                  : null;
                const subtotalParity = commodityNetPrice && commodityNetPrice > 0
                  ? Math.ceil(netSubtotal / commodityNetPrice)
                  : null;

                return (
                  <tr key={r.productId} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{r.productName}</div>
                      <div className="text-muted-foreground">{r.ref || r.code} · {r.quantity} {r.unitType}</div>
                    </td>
                    <td className="p-2 capitalize">{r.channelSegment}</td>
                    <td className="p-2">{r.segmentName || '—'}</td>
                    <td className="p-2">{r.sourceField} ({r.listCurrency})</td>
                    <td className="p-2 text-right">{brMoney(r.priceAfterFx)}</td>
                    <td className="p-2 text-right">{brMoney(r.interestPerUnit)} <span className="text-muted-foreground">({r.interestMultiplier.toFixed(4)})</span></td>
                    <td className="p-2 text-right">{brMoney(r.marginPerUnit)} <span className="text-muted-foreground">({r.marginPercent.toFixed(2)}%)</span></td>
                    <td className="p-2 text-right">{brMoney(r.segmentAdjPerUnit)} <span className="text-muted-foreground">({r.segmentAdjustmentPercent.toFixed(2)}%)</span></td>
                    <td className="p-2 text-right">{brMoney(r.paymentMarkupPerUnit)} <span className="text-muted-foreground">({r.paymentMethodMarkupPercent.toFixed(2)}%)</span></td>
                    <td className="p-2 text-right font-semibold">{brMoney(r.normalizedPrice)}</td>
                    <td className="p-2 text-right font-semibold">{brMoney(r.subtotal)}</td>
                    <td className="p-2 text-right">{brMoney(netSubtotal)}</td>
                    {commodityNetPrice && commodityNetPrice > 0 && (
                      <>
                        <td className="p-2 text-right font-mono">
                          {unitParity !== null ? `${unitParity.toFixed(4)} sc` : '—'}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">
                          {subtotalParity !== null ? `${subtotalParity.toLocaleString('pt-BR')} sc` : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
