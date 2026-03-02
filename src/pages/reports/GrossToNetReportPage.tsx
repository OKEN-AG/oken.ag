import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DollarSign, TrendingDown, TrendingUp, Percent } from 'lucide-react';
import StatCard from '@/components/StatCard';

export default function GrossToNetReportPage() {
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  const { data: operations = [], isLoading } = useQuery({
    queryKey: ['g2n-operations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('operations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['g2n-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('campaigns').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = campaignFilter === 'all' ? operations : operations.filter(o => o.campaign_id === campaignFilter);

  const totalGross = filtered.reduce((s, o) => s + (o.gross_revenue || 0), 0);
  const totalComboDiscount = filtered.reduce((s, o) => s + (o.gross_revenue || 0) * (o.combo_discount || 0) / 100, 0);
  const totalBarterDiscount = filtered.reduce((s, o) => s + (o.gross_revenue || 0) * (o.barter_discount || 0) / 100, 0);
  const totalFinancialRevenue = filtered.reduce((s, o) => s + (o.financial_revenue || 0), 0);
  const totalDistributorMargin = filtered.reduce((s, o) => s + (o.distributor_margin || 0), 0);
  const totalNet = filtered.reduce((s, o) => s + (o.net_revenue || 0), 0);
  const totalDiscounts = totalComboDiscount + totalBarterDiscount;
  const commercialRevenue = totalGross - totalDiscounts;
  const marginPct = totalGross > 0 ? ((totalNet / totalGross) * 100).toFixed(1) : '0';

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const waterfallData = [
    { name: 'Receita Bruta', value: totalGross, color: 'hsl(var(--primary))' },
    { name: 'Desc. Combo', value: -totalComboDiscount, color: 'hsl(var(--destructive))' },
    { name: 'Desc. Barter', value: -totalBarterDiscount, color: 'hsl(var(--destructive))' },
    { name: 'Rec. Financeira', value: totalFinancialRevenue, color: 'hsl(var(--success, 142 76% 36%))' },
    { name: 'Margem Distrib.', value: -totalDistributorMargin, color: 'hsl(var(--warning, 38 92% 50%))' },
    { name: 'Receita Líquida', value: totalNet, color: 'hsl(var(--primary))' },
  ];

  // Per-campaign breakdown
  const campaignBreakdown = campaigns.map(c => {
    const ops = operations.filter(o => o.campaign_id === c.id);
    const gross = ops.reduce((s, o) => s + (o.gross_revenue || 0), 0);
    const net = ops.reduce((s, o) => s + (o.net_revenue || 0), 0);
    return { name: c.name, gross, net, count: ops.length, margin: gross > 0 ? ((net / gross) * 100).toFixed(1) : '0' };
  }).filter(c => c.count > 0).sort((a, b) => b.gross - a.gross);

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório Gross-to-Net</h1>
          <p className="text-sm text-muted-foreground">Decomposição da receita de {filtered.length} operações</p>
        </div>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Filtrar campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Campanhas</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Receita Bruta" value={fmt(totalGross)} icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="Descontos Totais" value={fmt(totalDiscounts)} icon={<TrendingDown className="w-4 h-4" />} subtitle={`Combo: ${fmt(totalComboDiscount)} · Barter: ${fmt(totalBarterDiscount)}`} />
        <StatCard label="Receita Líquida" value={fmt(totalNet)} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Margem Líquida" value={`${marginPct}%`} icon={<Percent className="w-4 h-4" />} subtitle={`de ${filtered.length} operações`} />
      </div>

      {/* Waterfall breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Decomposição Gross → Net</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span>Receita Bruta</span><span className="font-mono font-bold">{fmt(totalGross)}</span></div>
            <div className="flex justify-between text-sm text-destructive"><span>— Desconto Combo</span><span className="font-mono">- {fmt(totalComboDiscount)}</span></div>
            <div className="flex justify-between text-sm text-destructive"><span>— Desconto Barter</span><span className="font-mono">- {fmt(totalBarterDiscount)}</span></div>
            <Separator />
            <div className="flex justify-between text-sm"><span>= Receita Comercial</span><span className="font-mono">{fmt(commercialRevenue)}</span></div>
            <div className="flex justify-between text-sm text-success"><span>+ Receita Financeira (Juros)</span><span className="font-mono">+ {fmt(totalFinancialRevenue)}</span></div>
            <div className="flex justify-between text-sm text-warning"><span>— Margem Distribuidor</span><span className="font-mono">- {fmt(totalDistributorMargin)}</span></div>
            <Separator />
            <div className="flex justify-between text-sm font-bold"><span>= Receita Líquida</span><span className="font-mono">{fmt(totalNet)}</span></div>
          </div>

          {totalGross > 0 && (
            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt(Math.abs(v))} />
                  <Bar dataKey="value">
                    {waterfallData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-campaign table */}
      {campaignBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Breakdown por Campanha</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {campaignBreakdown.map(c => (
                <div key={c.name} className="flex items-center justify-between p-3 rounded bg-muted/50 text-sm">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="outline" className="ml-2 text-xs">{c.count} ops</Badge>
                  </div>
                  <div className="flex items-center gap-4 font-mono">
                    <span className="text-muted-foreground">{fmt(c.gross)}</span>
                    <span>→</span>
                    <span className="font-semibold">{fmt(c.net)}</span>
                    <Badge variant="secondary">{c.margin}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
