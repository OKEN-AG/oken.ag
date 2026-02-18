import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * CALCULATION ENGINE - Edge Function
 * Centralizes critical calculations server-side for integrity.
 * 
 * Endpoints:
 * POST /calculate-pricing  - Normalize prices and compute gross-to-net
 * POST /calculate-parity   - Compute commodity parity
 * POST /calculate-combos   - Run combo cascade
 */

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const body = await req.json();

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: Record<string, unknown>;

    switch (path) {
      case 'calculate-pricing': {
        const { products, campaignId, segment, dueMonths } = body;

        // Fetch campaign data server-side
        const { data: campaign, error: cErr } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .single();
        if (cErr) throw cErr;

        const { data: margins } = await supabase
          .from('channel_margins')
          .select('*')
          .eq('campaign_id', campaignId);

        // Normalize each product price
        const pricingResults = products.map((item: {
          productId: string;
          pricePerUnit: number;
          currency: string;
          priceType: string;
          includesMargin: boolean;
          quantity: number;
        }) => {
          let price = item.pricePerUnit;

          // USD → BRL
          if (item.currency === 'USD') {
            price *= campaign.exchange_rate_products;
          }

          // Vista → Prazo
          const interestMultiplier = item.priceType === 'vista' && dueMonths > 0
            ? Math.pow(1 + campaign.interest_rate / 100, dueMonths) - 1
            : 0;

          const margin = (margins || []).find((m: { segment: string }) => m.segment === segment);
          const marginPercent = (!item.includesMargin && margin && segment !== 'direto')
            ? margin.margin_percent / 100
            : 0;

          const basePrice = price;
          const priceWithInterest = basePrice * (1 + interestMultiplier);
          const normalizedPrice = priceWithInterest * (1 + marginPercent);

          return {
            productId: item.productId,
            basePrice,
            normalizedPrice,
            interestComponent: basePrice * interestMultiplier,
            marginComponent: priceWithInterest * marginPercent,
            commercialPrice: normalizedPrice,
            quantity: item.quantity,
            subtotal: normalizedPrice * item.quantity,
          };
        });

        // Gross to net
        const grossRevenue = pricingResults.reduce((s: number, p: { subtotal: number }) => s + p.subtotal, 0);
        const totalInterest = pricingResults.reduce((s: number, p: { interestComponent: number; quantity: number }) => s + p.interestComponent * p.quantity, 0);
        const totalMargin = pricingResults.reduce((s: number, p: { marginComponent: number; quantity: number }) => s + p.marginComponent * p.quantity, 0);

        result = {
          pricingResults,
          grossRevenue,
          totalInterest,
          totalMargin,
        };

        // Log calculation
        if (body.operationId) {
          await supabase.from('operation_logs').insert({
            operation_id: body.operationId,
            user_id: user.id,
            action: 'server_pricing_calculated',
            details: { segment, dueMonths, grossRevenue, productsCount: products.length },
          });
        }
        break;
      }

      case 'calculate-parity': {
        const { totalAmountBRL, commodityPricing, port, freightReducer, userOverridePrice, grossAmountBRL } = body;

        // Calculate commodity net price
        const pricing = commodityPricing;
        const basisPrice = pricing.basis_by_port?.[port] ?? 0;
        const grossPrice = (pricing.exchange_price + basisPrice) * pricing.exchange_rate_bolsa;
        const afterMarketDelta = grossPrice * (1 - (pricing.security_delta_market || 0) / 100);

        let freightCost = 0;
        if (freightReducer) {
          freightCost = freightReducer.total_reducer;
          freightCost *= (1 + (pricing.security_delta_freight || 0) / 100);
        }

        const commodityNetPrice = userOverridePrice || Math.max(afterMarketDelta - freightCost, 0.01);
        const quantitySacas = totalAmountBRL / commodityNetPrice;
        const referencePrice = grossAmountBRL
          ? grossAmountBRL / quantitySacas
          : totalAmountBRL / quantitySacas;
        const valorization = ((referencePrice / commodityNetPrice) - 1) * 100;

        result = {
          totalAmountBRL,
          commodityPricePerUnit: commodityNetPrice,
          quantitySacas,
          referencePrice,
          valorization,
          userOverridePrice: userOverridePrice || null,
          hasExistingContract: !!userOverridePrice,
        };

        if (body.operationId) {
          await supabase.from('operation_logs').insert({
            operation_id: body.operationId,
            user_id: user.id,
            action: 'server_parity_calculated',
            details: { totalAmountBRL, commodityNetPrice, quantitySacas, valorization },
          });
        }
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
