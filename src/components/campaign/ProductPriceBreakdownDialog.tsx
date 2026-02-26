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

type PriceVariable = {
  label: string;
  impact: number;
  type: 'discount' | 'markup' | 'neutral';
};

type VariableGroup = {
  groupLabel: string;
  relation: 'and' | 'or'; // "and" = always applies; "or" = pick one from group
  variables: PriceVariable[];
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

  // Build groups with AND/OR logic
  const groups: VariableGroup[] = [];

  // --- AND groups (always apply together) ---

  if (campaign?.max_discount_internal > 0) {
    groups.push({
      groupLabel: 'Desconto Interno',
      relation: 'and',
      variables: [{
        label: `Desconto Interno Máx. (${campaign.max_discount_internal}%)`,
        impact: -campaign.max_discount_internal,
        type: 'discount',
      }],
    });
  }

  if (campaign?.max_discount_reseller > 0) {
    groups.push({
      groupLabel: 'Desconto Revenda',
      relation: 'and',
      variables: [{
        label: `Desconto Revenda Máx. (${campaign.max_discount_reseller}%)`,
        impact: -campaign.max_discount_reseller,
        type: 'discount',
      }],
    });
  }

  // --- OR groups (pick one from each) ---
  const ctVars: PriceVariable[] = channelTypes
    .filter(ct => ct.price_adjustment_percent !== 0)
    .map(ct => ({
      label: `${ct.channel_type_name} (${ct.price_adjustment_percent > 0 ? '+' : ''}${ct.price_adjustment_percent}%)`,
      impact: ct.price_adjustment_percent,
      type: (ct.price_adjustment_percent > 0 ? 'markup' : 'discount') as 'markup' | 'discount',
    }));
  if (ctVars.length > 0) {
    groups.push({ groupLabel: 'Tipo de Canal (escolhe 1)', relation: 'or', variables: ctVars });
  }

  const csMarginVars: PriceVariable[] = channelSegments
    .filter(cs => cs.margin_percent !== 0 || cs.price_adjustment_percent !== 0)
    .map(cs => {
      const totalImpact = (cs.margin_percent || 0) + (cs.price_adjustment_percent || 0);
      const parts: string[] = [];
      if (cs.margin_percent !== 0) parts.push(`margem ${cs.margin_percent}%`);
      if (cs.price_adjustment_percent !== 0) parts.push(`ajuste ${cs.price_adjustment_percent}%`);
      return {
        label: `${cs.channel_segment_name} (${parts.join(' + ')})`,
        impact: totalImpact,
        type: (totalImpact > 0 ? 'markup' : 'discount') as 'markup' | 'discount',
      };
    });
  if (csMarginVars.length > 0) {
    groups.push({ groupLabel: 'Segmento de Canal (escolhe 1)', relation: 'or', variables: csMarginVars });
  }

  const clientSegVars: PriceVariable[] = clientSegments
    .filter(s => s.price_adjustment_percent !== 0)
    .map(s => ({
      label: `${s.segment_name} (${s.price_adjustment_percent > 0 ? '+' : ''}${s.price_adjustment_percent}%)`,
      impact: s.price_adjustment_percent,
      type: (s.price_adjustment_percent > 0 ? 'markup' : 'discount') as 'markup' | 'discount',
    }));
  if (clientSegVars.length > 0) {
    groups.push({ groupLabel: 'Segmento de Cliente (escolhe 1)', relation: 'or', variables: clientSegVars });
  }

  const pmVars: PriceVariable[] = paymentMethods
    .filter(pm => pm.markup_percent !== 0)
    .map(pm => ({
      label: `${pm.method_name} (${pm.markup_percent > 0 ? '+' : ''}${pm.markup_percent}%)`,
      impact: pm.markup_percent,
      type: (pm.markup_percent > 0 ? 'markup' : 'discount') as 'markup' | 'discount',
    }));
  if (pmVars.length > 0) {
    groups.push({ groupLabel: 'Meio de Pagamento (escolhe 1)', relation: 'or', variables: pmVars });
  }

  const comboVars: PriceVariable[] = combos
    .filter(c => c.discount_percent > 0)
    .map(c => ({
      label: `${c.name} (-${c.discount_percent}%)`,
      impact: -c.discount_percent,
      type: 'discount' as const,
    }));
  if (comboVars.length > 0) {
    groups.push({ groupLabel: 'Combo (cascata, melhor aplicável)', relation: 'or', variables: comboVars });
  }

  // Calculate min/max intelligently
  // AND groups: all impacts always apply
  // OR groups: pick best (max impact) for max price, pick worst (min impact) for min price
  let totalAndImpact = 0;
  let bestOrImpact = 0; // for max price scenario
  let worstOrImpact = 0; // for min price scenario

  groups.forEach(g => {
    if (g.relation === 'and') {
      g.variables.forEach(v => { totalAndImpact += v.impact; });
    } else {
      // OR: pick best and worst from this group
      const impacts = g.variables.map(v => v.impact);
      const best = Math.max(...impacts, 0); // 0 = option of not selecting any
      const worst = Math.min(...impacts, 0);
      bestOrImpact += best;
      worstOrImpact += worst;
    }
  });

  const maxPriceImpact = totalAndImpact + bestOrImpact;
  const minPriceImpact = totalAndImpact + worstOrImpact;

  // For display, separate AND discounts from AND markups
  const andDiscounts = totalAndImpact < 0 ? totalAndImpact : 0;
  const andMarkups = totalAndImpact > 0 ? totalAndImpact : 0;

  const maxPrice = basePrice * (1 + Math.max(0, maxPriceImpact) / 100);
  const minPrice = basePrice * (1 + Math.min(0, minPriceImpact) / 100);

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
            {/* Base price */}
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">Preço Base (Cash)</p>
              <p className="text-lg font-bold text-foreground">{campaign?.currency || product.currency} {fmt(basePrice)}</p>
            </div>

            <Separator />

            {/* Variables grouped by AND/OR */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Variáveis de Impacto no Preço</p>
              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma variável configurada nesta campanha.</p>
              ) : (
                <div className="space-y-3">
                  {groups.map((g, gi) => (
                    <div key={gi} className="border rounded-md overflow-hidden">
                      <div className="bg-muted/50 px-3 py-1.5 flex items-center gap-2">
                        <p className="text-xs font-semibold text-foreground">{g.groupLabel}</p>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          {g.relation === 'and' ? 'Sempre aplica' : 'Escolhe 1'}
                        </Badge>
                      </div>
                      <Table>
                        <TableBody>
                          {g.variables.map((v, vi) => (
                            <TableRow key={vi}>
                              <TableCell className="text-xs">{v.label}</TableCell>
                              <TableCell className="text-xs text-right font-mono w-24">
                                {v.impact > 0 ? '+' : ''}{fmt(v.impact)}%
                              </TableCell>
                              <TableCell className="text-right w-20">
                                <Badge variant={v.type === 'discount' ? 'default' : 'secondary'} className="text-[10px]">
                                  {v.type === 'discount' ? '↓' : '↑'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Min / Max summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md">
                <p className="text-xs text-muted-foreground">Preço Mínimo Possível</p>
                <p className="text-xs text-muted-foreground mb-1">(pior cenário de desconto)</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">
                  {campaign?.currency || product.currency} {fmt(Math.max(0, minPrice))}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {minPriceImpact !== 0 ? `${fmt(minPriceImpact)}% sobre base` : 'Sem impacto'}
                </p>
              </div>
              <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md">
                <p className="text-xs text-muted-foreground">Preço Máximo Possível</p>
                <p className="text-xs text-muted-foreground mb-1">(melhor cenário de acréscimo)</p>
                <p className="text-lg font-bold text-orange-700 dark:text-orange-400">
                  {campaign?.currency || product.currency} {fmt(maxPrice)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {maxPriceImpact !== 0 ? `+${fmt(maxPriceImpact)}% sobre base` : 'Sem acréscimos'}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}