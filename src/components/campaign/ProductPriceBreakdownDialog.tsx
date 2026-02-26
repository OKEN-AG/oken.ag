import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
  campaignId: string;
};

type PriceScenario = {
  label: string;
  impact: number; // percentage impact
  type: 'discount' | 'markup' | 'neutral';
};

export default function ProductPriceBreakdownDialog({ open, onOpenChange, product, campaignId }: Props) {
  const [campaign, setCampaign] = useState<any>(null);
  const [channelSegments, setChannelSegments] = useState<any[]>([]);
  const [clientSegments, setClientSegments] = useState<any[]>([]);
  const [channelTypes, setChannelTypes] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !campaignId) return;
    setLoading(true);

    Promise.all([
      supabase.from('campaigns').select('*').eq('id', campaignId).single(),
      (supabase as any).from('campaign_channel_segments').select('*').eq('campaign_id', campaignId).eq('active', true),
      (supabase as any).from('campaign_segments').select('*').eq('campaign_id', campaignId).eq('active', true),
      (supabase as any).from('campaign_channel_types').select('*').eq('campaign_id', campaignId).eq('active', true),
      (supabase as any).from('campaign_payment_methods').select('*').eq('campaign_id', campaignId).eq('active', true),
      supabase.from('combos').select('*').eq('campaign_id', campaignId),
    ]).then(([campRes, csRes, segRes, ctRes, pmRes, comboRes]) => {
      setCampaign(campRes.data);
      setChannelSegments(csRes.data || []);
      setClientSegments(segRes.data || []);
      setChannelTypes(ctRes.data || []);
      setPaymentMethods(pmRes.data || []);
      setCombos(comboRes.data || []);
      setLoading(false);
    });
  }, [open, campaignId]);

  if (!product) return null;

  const basePrice = product.price_cash || product.price_per_unit || 0;
  const termPrice = product.price_term || basePrice;

  // Collect all variable impacts
  const variables: PriceScenario[] = [];

  // Interest rate
  if (campaign?.interest_rate > 0) {
    variables.push({
      label: `Juros Campanha (${campaign.interest_rate}% a.m.)`,
      impact: campaign.interest_rate * 12,
      type: 'markup',
    });
  }

  // Max discounts
  if (campaign?.max_discount_internal > 0) {
    variables.push({
      label: `Desconto Interno Máx. (${campaign.max_discount_internal}%)`,
      impact: -campaign.max_discount_internal,
      type: 'discount',
    });
  }
  if (campaign?.max_discount_reseller > 0) {
    variables.push({
      label: `Desconto Revenda Máx. (${campaign.max_discount_reseller}%)`,
      impact: -campaign.max_discount_reseller,
      type: 'discount',
    });
  }

  // Channel types (price adjustment)
  channelTypes.forEach((ct) => {
    if (ct.price_adjustment_percent !== 0) {
      variables.push({
        label: `Tipo Canal: ${ct.channel_type_name} (${ct.price_adjustment_percent > 0 ? '+' : ''}${ct.price_adjustment_percent}%)`,
        impact: ct.price_adjustment_percent,
        type: ct.price_adjustment_percent > 0 ? 'markup' : 'discount',
      });
    }
  });

  // Channel segments (margin + adjustment)
  channelSegments.forEach((cs) => {
    if (cs.margin_percent !== 0) {
      variables.push({
        label: `Margem Seg. Canal: ${cs.channel_segment_name} (${cs.margin_percent > 0 ? '+' : ''}${cs.margin_percent}%)`,
        impact: cs.margin_percent,
        type: cs.margin_percent > 0 ? 'markup' : 'discount',
      });
    }
    if (cs.price_adjustment_percent !== 0) {
      variables.push({
        label: `Ajuste Seg. Canal: ${cs.channel_segment_name} (${cs.price_adjustment_percent > 0 ? '+' : ''}${cs.price_adjustment_percent}%)`,
        impact: cs.price_adjustment_percent,
        type: cs.price_adjustment_percent > 0 ? 'markup' : 'discount',
      });
    }
  });

  // Client segments
  clientSegments.forEach((s) => {
    if (s.price_adjustment_percent !== 0) {
      variables.push({
        label: `Seg. Cliente: ${s.segment_name} (${s.price_adjustment_percent > 0 ? '+' : ''}${s.price_adjustment_percent}%)`,
        impact: s.price_adjustment_percent,
        type: s.price_adjustment_percent > 0 ? 'markup' : 'discount',
      });
    }
  });

  // Payment methods (markup)
  paymentMethods.forEach((pm) => {
    if (pm.markup_percent !== 0) {
      variables.push({
        label: `Pagamento: ${pm.method_name} (${pm.markup_percent > 0 ? '+' : ''}${pm.markup_percent}%)`,
        impact: pm.markup_percent,
        type: pm.markup_percent > 0 ? 'markup' : 'discount',
      });
    }
  });

  // Combos
  combos.forEach((c) => {
    if (c.discount_percent > 0) {
      variables.push({
        label: `Combo: ${c.name} (-${c.discount_percent}%)`,
        impact: -c.discount_percent,
        type: 'discount',
      });
    }
  });

  // Calculate min and max
  const discounts = variables.filter((v) => v.impact < 0);
  const markups = variables.filter((v) => v.impact > 0);

  const maxDiscountTotal = discounts.reduce((sum, v) => sum + v.impact, 0);
  const maxMarkupTotal = markups.reduce((sum, v) => sum + v.impact, 0);

  const minPrice = basePrice * (1 + maxDiscountTotal / 100);
  const maxPrice = basePrice * (1 + maxMarkupTotal / 100);

  // Best case: all markups + no discounts
  const bestCasePrice = basePrice * (1 + maxMarkupTotal / 100);
  // Worst case: all discounts + no markups
  const worstCasePrice = basePrice * (1 + maxDiscountTotal / 100);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Lista de Preço — {product.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : (
          <div className="space-y-4">
            {/* Base prices */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Preço Cash (Base)</p>
                <p className="text-lg font-bold text-foreground">{campaign?.currency || product.currency} {fmt(basePrice)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Preço Prazo</p>
                <p className="text-lg font-bold text-foreground">{campaign?.currency || product.currency} {fmt(termPrice)}</p>
              </div>
            </div>

            <Separator />

            {/* Variables table */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Variáveis de Impacto no Preço</p>
              {variables.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma variável configurada nesta campanha.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-foreground">Variável</TableHead>
                        <TableHead className="text-right text-foreground">Impacto (%)</TableHead>
                        <TableHead className="text-right text-foreground">Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variables.map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{v.label}</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {v.impact > 0 ? '+' : ''}{fmt(v.impact)}%
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={v.type === 'discount' ? 'default' : 'secondary'} className="text-[10px]">
                              {v.type === 'discount' ? 'Desconto' : 'Acréscimo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Separator />

            {/* Min / Max summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md">
                <p className="text-xs text-muted-foreground">Preço Mínimo Possível</p>
                <p className="text-xs text-muted-foreground mb-1">(todos descontos aplicados)</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">
                  {campaign?.currency || product.currency} {fmt(Math.max(0, worstCasePrice))}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {maxDiscountTotal !== 0 ? `${fmt(maxDiscountTotal)}% sobre base` : 'Sem descontos'}
                </p>
              </div>
              <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md">
                <p className="text-xs text-muted-foreground">Preço Máximo Possível</p>
                <p className="text-xs text-muted-foreground mb-1">(todos acréscimos aplicados)</p>
                <p className="text-lg font-bold text-orange-700 dark:text-orange-400">
                  {campaign?.currency || product.currency} {fmt(bestCasePrice)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {maxMarkupTotal !== 0 ? `+${fmt(maxMarkupTotal)}% sobre base` : 'Sem acréscimos'}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
