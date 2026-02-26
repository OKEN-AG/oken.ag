import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RuntimeConfig = {
  calculationVersionDefault: string;
  minimumCommodityPrice: number;
  snapshotTypeInput: string;
  snapshotTypeDebt: string;
};

const defaultRuntimeConfig: RuntimeConfig = {
  calculationVersionDefault: 'v1',
  minimumCommodityPrice: 0.01,
  snapshotTypeInput: 'memory_input',
  snapshotTypeDebt: 'memory_debt',
};

/**
 * CALCULATION ENGINE - Edge Function
 * Centralizes critical calculations server-side for integrity.
 *
 * Endpoints:
 * POST /calculate-pricing                 - Normalize prices and compute gross-to-net
 * POST /calculate-parity                  - Compute commodity parity
 * POST /calculate-input-memory            - Compute commodity memory (insumo)
 * POST /calculate-commodity-debt-memory   - Compute commodity memory (dívida)
 */

function yearsBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`).getTime();
  const end = new Date(`${endISO}T00:00:00`).getTime();
  return (end - start) / 86400000 / 365;
}

function fv(rate: number, years: number, pv: number): number {
  return pv * Math.pow(1 + rate, years);
}

function pv(rate: number, years: number, fvValue: number): number {
  return fvValue / Math.pow(1 + rate, years);
}

function requireFields(payload: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((f) => payload[f] === null || payload[f] === undefined || payload[f] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

function validateTemporalRules(payload: Record<string, unknown>) {
  const concessao = new Date(`${payload.dataConcessao}T00:00:00`).getTime();
  const vencimento = new Date(`${payload.vencimento}T00:00:00`).getTime();
  const entrega = new Date(`${payload.dataEntrega}T00:00:00`).getTime();
  const pagamento = new Date(`${payload.dataPagamento}T00:00:00`).getTime();
  const repasse = payload.dataRepasse ? new Date(`${payload.dataRepasse}T00:00:00`).getTime() : null;
  const excecao = String(payload.regraExcecaoTemporal || '').trim();

  if (concessao > vencimento) {
    throw new Error('Temporal validation failed: dataConcessao must be <= vencimento');
  }
  if (entrega > pagamento) {
    throw new Error('Temporal validation failed: dataEntrega must be <= dataPagamento');
  }
  if (repasse !== null && pagamento > repasse && !excecao) {
    throw new Error('Temporal validation failed: dataPagamento must be <= dataRepasse (or provide regraExcecaoTemporal)');
  }
}

function buildFormulaMetadata(scenario: 'insumo' | 'divida') {
  const formulas = scenario === 'insumo'
    ? {
      valorPresenteCredito: 'precoFornecedor*(1+markupPct-descontoPct)',
      periodoJurosAnos: '(vencimento-dataConcessao)/365',
      valorPontaSemFee: 'FV(jurosCetAa,periodoJurosAnos,valorPresenteCredito)*(1-incentivoPct)',
      valorPontaComFee: 'valorPontaSemFee*(1+feeOkenPct)',
      precoLiquido: 'precoBrutoCommodity*(1+(temImposto?descontoImpostosPct:0))',
      periodoAntecipAnos: '(dataPagamento-dataRepasse)/365',
      precoEntregaAjustado: 'PV(rendimentoAntecipacaoAa,periodoAntecipAnos,precoLiquido)',
    }
    : {
      periodoJurosAnos: '(vencimento-dataConcessao)/365',
      valorPontaSemFee: 'FV(jurosCetAa,periodoJurosAnos,valorDividaPv)*(1-incentivoPct)',
      valorPontaComFee: 'valorPontaSemFee*(1+feeOkenPct)',
      precoLiquido: 'precoBrutoCommodity*(1+(temImposto?descontoImpostosPct:0))',
      periodoAntecipAnos: '(dataPagamento-dataRepasse)/365',
      precoEntregaAjustado: 'PV(rendimentoAntecipacaoAa,periodoAntecipAnos,precoLiquido)',
    };

  const dependencies = ['jurosCetAa','dataConcessao','vencimento','feeOkenPct','incentivoPct','precoBrutoCommodity','temImposto','descontoImpostosPct','dataRepasse','dataPagamento','rendimentoAntecipacaoAa'];
  return { formulas, dependencies };
}

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

    const { data: runtimeRow } = await supabase
      .from('engine_runtime_config')
      .select('value_json')
      .eq('key', 'calculate_engine')
      .maybeSingle();

    const runtimeConfig: RuntimeConfig = {
      ...defaultRuntimeConfig,
      ...(runtimeRow?.value_json || {}),
    };

    let result: Record<string, unknown>;

    switch (path) {
      case 'calculate-pricing': {
        const { products, campaignId, segment, dueMonths } = body;

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

        const pricingResults = products.map((item: {
          productId: string;
          pricePerUnit: number;
          currency: string;
          priceType: string;
          includesMargin: boolean;
          quantity: number;
        }) => {
          let price = item.pricePerUnit;

          if (item.currency === 'USD') {
            price *= campaign.exchange_rate_products;
          }

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

        const grossRevenue = pricingResults.reduce((s: number, p: { subtotal: number }) => s + p.subtotal, 0);
        const totalInterest = pricingResults.reduce((s: number, p: { interestComponent: number; quantity: number }) => s + p.interestComponent * p.quantity, 0);
        const totalMargin = pricingResults.reduce((s: number, p: { marginComponent: number; quantity: number }) => s + p.marginComponent * p.quantity, 0);

        result = {
          pricingResults,
          grossRevenue,
          totalInterest,
          totalMargin,
        };

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

        const pricing = commodityPricing;
        const basisPrice = pricing.basis_by_port?.[port] ?? 0;
        const grossPrice = (pricing.exchange_price + basisPrice) * pricing.exchange_rate_bolsa;
        const afterMarketDelta = grossPrice * (1 - (pricing.security_delta_market || 0) / 100);

        let freightCost = 0;
        if (freightReducer) {
          freightCost = freightReducer.total_reducer;
          freightCost *= (1 + (pricing.security_delta_freight || 0) / 100);
        }

        const commodityNetPrice = userOverridePrice || Math.max(afterMarketDelta - freightCost, Number(runtimeConfig.minimumCommodityPrice || defaultRuntimeConfig.minimumCommodityPrice));
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

      case 'calculate-input-memory': {
        requireFields(body, [
          'precoFornecedor',
          'markupPct',
          'descontoPct',
          'jurosCetAa',
          'dataConcessao',
          'vencimento',
          'feeOkenPct',
          'incentivoPct',
          'commodity',
          'periodoEntrega',
          'localEntrega',
          'precoBrutoCommodity',
          'temImposto',
          'descontoImpostosPct',
          'dataEntrega',
          'dataPagamento',
          'dataRepasse',
          'rendimentoAntecipacaoAa',
          'feeMerchantPct',
        ]);

        const periodoJurosAnos = yearsBetween(body.dataConcessao, body.vencimento);
        const valorPresenteCredito = Number(body.precoFornecedor) * (1 + Number(body.markupPct) - Number(body.descontoPct));
        const valorPontaSemFee = fv(Number(body.jurosCetAa), periodoJurosAnos, valorPresenteCredito) * (1 - Number(body.incentivoPct));
        const valorPontaComFee = valorPontaSemFee * (1 + Number(body.feeOkenPct));

        validateTemporalRules(body);
        const descontoImpostosEfetivo = body.temImposto ? Number(body.descontoImpostosPct) : 0;
        const precoLiquido = Number(body.precoBrutoCommodity) * (1 + descontoImpostosEfetivo);
        const periodoAteRepasseAnos = yearsBetween(body.dataRepasse, body.dataPagamento);
        const precoEntregaAjustado = pv(Number(body.rendimentoAntecipacaoAa), periodoAteRepasseAnos, precoLiquido);

        const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;
        const montanteInsumoReferencia = fv(
          Number(body.jurosCetAa),
          periodoJurosAnos,
          Number(body.precoFornecedor) * (1 + Number(body.markupPct) + Number(body.feeOkenPct))
        );

        const precoValorizado = montanteInsumoReferencia / paridadeRealSacas;
        const valorizacaoNominal = precoValorizado - precoLiquido;
        const valorizacaoPercent = precoLiquido !== 0 ? valorizacaoNominal / precoLiquido : 0;

        const sacasTransfMerchant = paridadeRealSacas / (1 + Number(body.feeOkenPct));
        const feeSacasFarmer = paridadeRealSacas - sacasTransfMerchant;
        const feeSacasMerchant = Number(body.feeMerchantPct) * sacasTransfMerchant;
        const walletMerchant = sacasTransfMerchant - feeSacasMerchant;

        const montantePagoMerchant = walletMerchant * precoLiquido;
        const revenueOken = (feeSacasFarmer + feeSacasMerchant) * precoLiquido;

        result = {
          valorPresenteCredito,
          periodoJurosAnos,
          valorPontaSemFee,
          valorPontaComFee,
          precoLiquido,
          periodoAteRepasseAnos,
          precoEntregaAjustado,
          paridadeRealSacas,
          montanteInsumoReferencia,
          precoValorizado,
          valorizacaoNominal,
          valorizacaoPercent,
          feeSacasFarmer,
          sacasTransfMerchant,
          feeSacasMerchant,
          walletMerchant,
          montantePagoMerchant,
          revenueOken,
          calculationVersion: body.calculationVersion || runtimeConfig.calculationVersionDefault,
        };

        if (body.operationId) {
          await supabase.from('order_pricing_snapshots').insert({
            operation_id: body.operationId,
            snapshot_type: runtimeConfig.snapshotTypeInput,
            snapshot: {
              version: body.calculationVersion || runtimeConfig.calculationVersionDefault,
              ...buildFormulaMetadata('insumo'),
              input: body,
              output: result,
            },
            created_by: user.id,
          });


          await supabase.from('operation_calculation_inputs').upsert({
            operation_id: body.operationId,
            scenario_type: 'insumo',
            calculation_version: body.calculationVersion || runtimeConfig.calculationVersionDefault,
            juros_cet_aa: Number(body.jurosCetAa),
            fee_oken_pct: Number(body.feeOkenPct),
            incentivo_pct: Number(body.incentivoPct),
            commodity: String(body.commodity),
            periodo_entrega: String(body.periodoEntrega),
            local_entrega: String(body.localEntrega),
            preco_bruto_commodity: Number(body.precoBrutoCommodity),
            tem_imposto: Boolean(body.temImposto),
            desconto_impostos_pct: Number(body.descontoImpostosPct),
            data_concessao: String(body.dataConcessao),
            vencimento: String(body.vencimento),
            data_entrega: String(body.dataEntrega),
            data_pagamento: String(body.dataPagamento),
            data_repasse: String(body.dataRepasse),
            rendimento_antecipacao_aa: Number(body.rendimentoAntecipacaoAa),
            preco_fornecedor: Number(body.precoFornecedor),
            markup_pct: Number(body.markupPct),
            desconto_pct: Number(body.descontoPct),
            fee_merchant_pct: Number(body.feeMerchantPct),
            formula_dependencies: buildFormulaMetadata('insumo').dependencies,
            formula_resolved: buildFormulaMetadata('insumo').formulas,
            input_audit_tags: body.inputAuditTags || {},
            regra_excecao_temporal: body.regraExcecaoTemporal || null,
            created_by: user.id,
          }, { onConflict: 'operation_id,scenario_type' });

          await supabase.from('operation_logs').insert({
            operation_id: body.operationId,
            user_id: user.id,
            action: 'server_input_memory_calculated',
            details: { version: body.calculationVersion || runtimeConfig.calculationVersionDefault, scenario: 'insumo' },
          });
        }
        break;
      }

      case 'calculate-commodity-debt-memory': {
        requireFields(body, [
          'valorDividaPv',
          'jurosCetAa',
          'dataConcessao',
          'vencimento',
          'feeOkenPct',
          'incentivoPct',
          'commodity',
          'periodoEntrega',
          'localEntrega',
          'precoBrutoCommodity',
          'temImposto',
          'descontoImpostosPct',
          'dataEntrega',
          'dataPagamento',
          'dataRepasse',
          'rendimentoAntecipacaoAa',
          'feeDealerPct',
        ]);

        const periodoJurosAnos = yearsBetween(body.dataConcessao, body.vencimento);
        const valorPontaSemFee = fv(Number(body.jurosCetAa), periodoJurosAnos, Number(body.valorDividaPv)) * (1 - Number(body.incentivoPct));
        const valorPontaComFee = valorPontaSemFee * (1 + Number(body.feeOkenPct));

        validateTemporalRules(body);
        const descontoImpostosEfetivo = body.temImposto ? Number(body.descontoImpostosPct) : 0;
        const precoLiquido = Number(body.precoBrutoCommodity) * (1 + descontoImpostosEfetivo);
        const periodoAteRepasseAnos = yearsBetween(body.dataRepasse, body.dataPagamento);
        const precoEntregaAjustado = pv(Number(body.rendimentoAntecipacaoAa), periodoAteRepasseAnos, precoLiquido);

        const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;
        const montanteInsumoReferencia = fv(Number(body.jurosCetAa), periodoJurosAnos, Number(body.valorDividaPv));

        const precoValorizado = montanteInsumoReferencia / paridadeRealSacas;
        const valorizacaoNominal = precoValorizado - precoLiquido;
        const valorizacaoPercent = precoLiquido !== 0 ? valorizacaoNominal / precoLiquido : 0;

        const sacasTransfDealer = paridadeRealSacas / (1 + Number(body.feeOkenPct));
        const feeSacasFarmer = paridadeRealSacas - sacasTransfDealer;
        const feeSacasDealer = Number(body.feeDealerPct) * sacasTransfDealer;
        const walletDealer = sacasTransfDealer - feeSacasDealer;

        const montantePagoDealer = walletDealer * precoLiquido;
        const revenueOken = (feeSacasFarmer + feeSacasDealer) * precoLiquido;

        result = {
          periodoJurosAnos,
          valorPontaSemFee,
          valorPontaComFee,
          precoLiquido,
          periodoAteRepasseAnos,
          precoEntregaAjustado,
          paridadeRealSacas,
          montanteInsumoReferencia,
          precoValorizado,
          valorizacaoNominal,
          valorizacaoPercent,
          feeSacasFarmer,
          sacasTransfDealer,
          feeSacasDealer,
          walletDealer,
          montantePagoDealer,
          revenueOken,
          calculationVersion: body.calculationVersion || runtimeConfig.calculationVersionDefault,
        };

        if (body.operationId) {
          await supabase.from('order_pricing_snapshots').insert({
            operation_id: body.operationId,
            snapshot_type: runtimeConfig.snapshotTypeDebt,
            snapshot: {
              version: body.calculationVersion || runtimeConfig.calculationVersionDefault,
              ...buildFormulaMetadata('divida'),
              input: body,
              output: result,
            },
            created_by: user.id,
          });


          await supabase.from('operation_calculation_inputs').upsert({
            operation_id: body.operationId,
            scenario_type: 'divida',
            calculation_version: body.calculationVersion || runtimeConfig.calculationVersionDefault,
            juros_cet_aa: Number(body.jurosCetAa),
            fee_oken_pct: Number(body.feeOkenPct),
            incentivo_pct: Number(body.incentivoPct),
            commodity: String(body.commodity),
            periodo_entrega: String(body.periodoEntrega),
            local_entrega: String(body.localEntrega),
            preco_bruto_commodity: Number(body.precoBrutoCommodity),
            tem_imposto: Boolean(body.temImposto),
            desconto_impostos_pct: Number(body.descontoImpostosPct),
            data_concessao: String(body.dataConcessao),
            vencimento: String(body.vencimento),
            data_entrega: String(body.dataEntrega),
            data_pagamento: String(body.dataPagamento),
            data_repasse: String(body.dataRepasse),
            rendimento_antecipacao_aa: Number(body.rendimentoAntecipacaoAa),
            valor_divida_pv: Number(body.valorDividaPv),
            fee_dealer_pct: Number(body.feeDealerPct),
            formula_dependencies: buildFormulaMetadata('divida').dependencies,
            formula_resolved: buildFormulaMetadata('divida').formulas,
            input_audit_tags: body.inputAuditTags || {},
            regra_excecao_temporal: body.regraExcecaoTemporal || null,
            created_by: user.id,
          }, { onConflict: 'operation_id,scenario_type' });

          await supabase.from('operation_logs').insert({
            operation_id: body.operationId,
            user_id: user.id,
            action: 'server_debt_memory_calculated',
            details: { version: body.calculationVersion || runtimeConfig.calculationVersionDefault, scenario: 'divida' },
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
    const status = message.startsWith('Missing required fields:') ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
