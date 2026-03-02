import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolvePolicy, recordPolicyDecisionAudit } from "../_shared/policy.ts";

// CORS: restrict to allowed origins via env
function getCorsHeaders(req: Request) {
  const allowedRaw = Deno.env.get('ALLOWED_ORIGINS') || '*';
  const origin = req.headers.get('Origin') || '';
  let allowOrigin = '*';
  if (allowedRaw !== '*') {
    const allowed = allowedRaw.split(',').map(s => s.trim());
    allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Vary': 'Origin',
  };
}

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



type CreditLinePolicy = {
  id: string;
  name: string;
  fundingCostAa: number;
  spreadAa: number;
  priority: number;
  maxShare: number | null;
};

type CreditLineRequirementPolicy = {
  creditLineId: string;
  riskLevels?: string[];
  profiles?: string[];
  operationTypes?: string[];
};

type SelectedCreditSourcePolicy = {
  creditLineId: string;
  creditLineName: string;
  share: number;
  fundingCostAa: number;
  spreadAa: number;
  cetAa: number;
};

function matchesRequirement(value: string | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!value) return false;
  return allowed.includes(value);
}

function selectCreditSourcesPolicy(
  lines: CreditLinePolicy[],
  requirements: CreditLineRequirementPolicy[],
  riskLevel?: string,
  profile?: string,
  operationType?: string,
): SelectedCreditSourcePolicy[] {
  const reqMap = new Map<string, CreditLineRequirementPolicy[]>();
  for (const req of requirements) {
    const bucket = reqMap.get(req.creditLineId) || [];
    bucket.push(req);
    reqMap.set(req.creditLineId, bucket);
  }

  const eligible = lines
    .sort((a, b) => (a.priority || 999) - (b.priority || 999))
    .filter((line) => {
      const reqs = reqMap.get(line.id) || [];
      if (reqs.length === 0) return true;
      return reqs.some((req) => (
        matchesRequirement(riskLevel, req.riskLevels)
        && matchesRequirement(profile, req.profiles)
        && matchesRequirement(operationType, req.operationTypes)
      ));
    });

  let remaining = 1;
  const selected: SelectedCreditSourcePolicy[] = [];
  for (const line of eligible) {
    if (remaining <= 0) break;
    const maxShare = line.maxShare == null ? 1 : Math.max(0, Math.min(1, line.maxShare));
    const share = Math.min(maxShare, remaining);
    if (share <= 0) continue;
    selected.push({
      creditLineId: line.id,
      creditLineName: line.name,
      share,
      fundingCostAa: line.fundingCostAa,
      spreadAa: line.spreadAa,
      cetAa: line.fundingCostAa + line.spreadAa,
    });
    remaining -= share;
  }

  if (selected.length > 0 && remaining > 0) {
    selected[selected.length - 1].share += remaining;
  }

  return selected;
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

  if (concessao > vencimento) throw new Error('Temporal: dataConcessao must be <= vencimento');
  if (entrega > pagamento) throw new Error('Temporal: dataEntrega must be <= dataPagamento');
  if (repasse !== null && pagamento > repasse && !excecao) {
    throw new Error('Temporal: dataPagamento must be <= dataRepasse (or provide regraExcecaoTemporal)');
  }
}


async function resolveCreditComposition(
  supabase: any,
  campaignId: string | null,
  jurosCetAaFallback: number,
  riskLevel?: string,
  profile?: string,
  operationType?: string,
) {
  if (!campaignId) {
    return {
      effectiveCetAa: jurosCetAaFallback,
      weightedFundingCostAa: 0,
      weightedSpreadAa: jurosCetAaFallback,
      selectedSources: [],
    };
  }

  const [{ data: linesData }, { data: reqData }] = await Promise.all([
    supabase
      .from('credit_lines')
      .select('id,name,funding_cost_aa,spread_aa,priority,max_share,active,campaign_id')
      .eq('campaign_id', campaignId)
      .eq('active', true),
    supabase
      .from('credit_line_requirements')
      .select('credit_line_id,risk_levels,profiles,operation_types'),
  ]);

  const lines: CreditLinePolicy[] = (linesData || []).map((line: any) => ({
    id: line.id,
    name: line.name,
    fundingCostAa: Number(line.funding_cost_aa || 0),
    spreadAa: Number(line.spread_aa || 0),
    priority: Number(line.priority || 999),
    maxShare: line.max_share == null ? null : Number(line.max_share),
  }));

  const reqs: CreditLineRequirementPolicy[] = (reqData || []).map((req: any) => ({
    creditLineId: req.credit_line_id,
    riskLevels: Array.isArray(req.risk_levels) ? req.risk_levels : undefined,
    profiles: Array.isArray(req.profiles) ? req.profiles : undefined,
    operationTypes: Array.isArray(req.operation_types) ? req.operation_types : undefined,
  }));

  const selectedSources = selectCreditSourcesPolicy(lines, reqs, riskLevel, profile, operationType);

  if (selectedSources.length === 0) {
    return {
      effectiveCetAa: jurosCetAaFallback,
      weightedFundingCostAa: 0,
      weightedSpreadAa: jurosCetAaFallback,
      selectedSources,
    };
  }

  const weightedFundingCostAa = selectedSources.reduce((sum, s) => sum + (s.fundingCostAa * s.share), 0);
  const weightedSpreadAa = selectedSources.reduce((sum, s) => sum + (s.spreadAa * s.share), 0);

  return {
    effectiveCetAa: weightedFundingCostAa + weightedSpreadAa,
    weightedFundingCostAa,
    weightedSpreadAa,
    selectedSources,
  };
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
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const body = await req.json();

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = (body?.tenantId || user.user_metadata?.tenant_id || null) as string | null;

    const calcPolicy = await resolvePolicy(supabase, 'calculate_engine', tenantId);

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
      // =====================================================================
      // FIX 1.1: SERVER-AUTHORITATIVE PRICING
      // No longer accepts pricePerUnit/currency/includesMargin from client.
      // Fetches product prices from DB.
      // =====================================================================
      case 'calculate-pricing': {
        const { operationId, campaignId, segment, dueMonths, selections } = body;

        // Validate required
        if (!campaignId) throw new Error('campaignId is required');
        if (!segment) throw new Error('segment is required');
        if (dueMonths == null) throw new Error('dueMonths is required');

        // Fetch campaign
        const { data: campaign, error: cErr } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .single();
        if (cErr || !campaign) throw new Error('Campaign not found');

        // Fetch margins
        const { data: margins } = await supabase
          .from('channel_margins')
          .select('*')
          .eq('campaign_id', campaignId);

        // Determine product list: from selections or operation_items
        let productEntries: { productId: string; quantity: number }[] = [];

        if (selections && Array.isArray(selections) && selections.length > 0) {
          productEntries = selections.map((s: { productId: string; quantity: number }) => ({
            productId: s.productId,
            quantity: s.quantity,
          }));
        } else if (operationId) {
          const { data: opItems } = await supabase
            .from('operation_items')
            .select('product_id, rounded_quantity')
            .eq('operation_id', operationId);
          productEntries = (opItems || []).map((item: { product_id: string; rounded_quantity: number }) => ({
            productId: item.product_id,
            quantity: item.rounded_quantity || 0,
          }));
        }

        if (productEntries.length === 0) {
          throw new Error('No products found — provide selections or operationId with items');
        }

        // Fetch product prices from DB (authoritative source)
        const productIds = productEntries.map(p => p.productId);
        const { data: products, error: pErr } = await supabase
          .from('products')
          .select('id, price_per_unit, price_cash, price_term, currency, price_type, includes_margin')
          .in('id', productIds);
        if (pErr) throw pErr;

        const productMap = new Map((products || []).map((p: any) => [p.id, p]));

        // Validate all products exist in campaign
        const { data: campaignProducts } = await supabase
          .from('campaign_products')
          .select('product_id')
          .eq('campaign_id', campaignId);
        const validProductIds = new Set((campaignProducts || []).map((cp: any) => cp.product_id));

        const pricingResults = productEntries.map(entry => {
          const product = productMap.get(entry.productId);
          if (!product) throw new Error(`Product ${entry.productId} not found in DB`);
          if (!validProductIds.has(entry.productId)) {
            throw new Error(`Product ${entry.productId} is not part of campaign ${campaignId}`);
          }

          // Use authoritative price from DB
          let price = product.price_per_unit;
          if (product.price_type === 'prazo' && product.price_term) {
            price = product.price_term;
          } else if (product.price_type === 'vista' && product.price_cash) {
            price = product.price_cash;
          }

          // Currency conversion
          if (product.currency === 'USD') {
            price *= campaign.exchange_rate_products;
          }

          // Interest
          const interestMultiplier = product.price_type === 'vista' && dueMonths > 0
            ? Math.pow(1 + campaign.interest_rate / 100, dueMonths) - 1
            : 0;

          // Margin
          const margin = (margins || []).find((m: { segment: string }) => m.segment === segment);
          const marginPercent = (!product.includes_margin && margin && segment !== 'direto')
            ? margin.margin_percent / 100
            : 0;

          const basePrice = price;
          const priceWithInterest = basePrice * (1 + interestMultiplier);
          const normalizedPrice = priceWithInterest * (1 + marginPercent);

          return {
            productId: entry.productId,
            basePrice,
            normalizedPrice,
            interestComponent: basePrice * interestMultiplier,
            marginComponent: priceWithInterest * marginPercent,
            commercialPrice: normalizedPrice,
            quantity: entry.quantity,
            subtotal: normalizedPrice * entry.quantity,
          };
        });

        const grossRevenue = pricingResults.reduce((s: number, p: { subtotal: number }) => s + p.subtotal, 0);
        const totalInterest = pricingResults.reduce((s: number, p: { interestComponent: number; quantity: number }) => s + p.interestComponent * p.quantity, 0);
        const totalMargin = pricingResults.reduce((s: number, p: { marginComponent: number; quantity: number }) => s + p.marginComponent * p.quantity, 0);

        result = { pricingResults, grossRevenue, totalInterest, totalMargin };

        if (operationId) {
          await supabase.from('operation_logs').insert({
            operation_id: operationId,
            user_id: user.id,
            action: 'server_pricing_calculated',
            details: { segment, dueMonths, grossRevenue, productsCount: productEntries.length },
          });
        }
        break;
      }

      // =====================================================================
      // FIX 1.2: SERVER-AUTHORITATIVE PARITY
      // Fetches commodity_pricing and freight from DB, not from client.
      // =====================================================================
      case 'calculate-parity': {
        const { operationId, commodityPricingId, portName, freightReducerId, totalAmountBRL, userOverridePrice, grossAmountBRL } = body;

        if (!totalAmountBRL || totalAmountBRL <= 0) throw new Error('totalAmountBRL must be > 0');

        let pricing: any;
        let freightReducer: any = null;

        if (commodityPricingId) {
          const { data: cp, error: cpErr } = await supabase
            .from('commodity_pricing')
            .select('*')
            .eq('id', commodityPricingId)
            .single();
          if (cpErr || !cp) throw new Error('commodity_pricing not found');
          pricing = cp;
        } else if (body.commodityPricing) {
          // Legacy fallback — log warning
          console.warn('DEPRECATED: calculate-parity received commodityPricing from client. Use commodityPricingId.');
          pricing = body.commodityPricing;
        } else {
          throw new Error('commodityPricingId is required');
        }

        if (freightReducerId) {
          const { data: fr, error: frErr } = await supabase
            .from('freight_reducers')
            .select('*')
            .eq('id', freightReducerId)
            .single();
          if (frErr || !fr) throw new Error('freight_reducer not found');
          freightReducer = fr;
        } else if (body.freightReducer) {
          console.warn('DEPRECATED: calculate-parity received freightReducer from client. Use freightReducerId.');
          freightReducer = body.freightReducer;
        }

        const port = portName || body.port || '';
        const basisByPort = typeof pricing.basis_by_port === 'string' ? JSON.parse(pricing.basis_by_port) : (pricing.basis_by_port || {});
        const basisPrice = basisByPort[port] ?? 0;
        const grossPrice = (pricing.exchange_price + basisPrice) * pricing.exchange_rate_bolsa;
        const afterMarketDelta = grossPrice * (1 - (pricing.security_delta_market || 0) / 100);

        let freightCost = 0;
        if (freightReducer) {
          freightCost = freightReducer.total_reducer || 0;
          freightCost *= (1 + (pricing.security_delta_freight || 0) / 100);
        }

        const commodityNetPrice = userOverridePrice || Math.max(afterMarketDelta - freightCost, Number(runtimeConfig.minimumCommodityPrice));
        const quantitySacas = totalAmountBRL / commodityNetPrice;
        const referencePrice = grossAmountBRL ? grossAmountBRL / quantitySacas : totalAmountBRL / quantitySacas;
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

        if (operationId) {
          await supabase.from('operation_logs').insert({
            operation_id: operationId,
            user_id: user.id,
            action: 'server_parity_calculated',
            details: { totalAmountBRL, commodityNetPrice, quantitySacas, valorization },
          });
        }
        break;
      }

      // === calculate-input-memory (unchanged logic, just CORS fix) ===
      case 'calculate-input-memory': {
        requireFields(body, [
          'precoFornecedor', 'markupPct', 'descontoPct', 'jurosCetAa',
          'dataConcessao', 'vencimento', 'feeOkenPct', 'incentivoPct',
          'commodity', 'periodoEntrega', 'localEntrega', 'precoBrutoCommodity',
          'temImposto', 'descontoImpostosPct', 'dataEntrega', 'dataPagamento',
          'dataRepasse', 'rendimentoAntecipacaoAa', 'feeMerchantPct',
        ]);

        const creditComposition = await resolveCreditComposition(
          supabase,
          body.campaignId || null,
          Number(body.jurosCetAa),
          body.riskLevel,
          body.profile,
          body.operationType || body.scenarioType || 'insumo',
        );

        const periodoJurosAnos = yearsBetween(body.dataConcessao, body.vencimento);
        const valorPresenteCredito = Number(body.precoFornecedor) * (1 + Number(body.markupPct) - Number(body.descontoPct));
        const valorPontaSemFee = fv(creditComposition.effectiveCetAa, periodoJurosAnos, valorPresenteCredito) * (1 - Number(body.incentivoPct));
        const valorPontaComFee = valorPontaSemFee * (1 + Number(body.feeOkenPct));

        validateTemporalRules(body);
        const descontoImpostosEfetivo = body.temImposto ? Number(body.descontoImpostosPct) : 0;
        const precoLiquido = Number(body.precoBrutoCommodity) * (1 + descontoImpostosEfetivo);
        const periodoAteRepasseAnos = yearsBetween(body.dataRepasse, body.dataPagamento);
        const precoEntregaAjustado = pv(Number(body.rendimentoAntecipacaoAa), periodoAteRepasseAnos, precoLiquido);

        const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;
        const montanteInsumoReferencia = fv(
          creditComposition.effectiveCetAa, periodoJurosAnos,
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
          valorPresenteCredito, periodoJurosAnos, valorPontaSemFee, valorPontaComFee,
          precoLiquido, periodoAteRepasseAnos, precoEntregaAjustado,
          paridadeRealSacas, montanteInsumoReferencia, precoValorizado,
          valorizacaoNominal, valorizacaoPercent, feeSacasFarmer,
          sacasTransfMerchant, feeSacasMerchant, walletMerchant,
          montantePagoMerchant, revenueOken,
          creditComposition,
          calculationVersion: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault),
        };

        if (body.operationId) {
          await supabase.from('order_pricing_snapshots').insert({
            operation_id: body.operationId,
            snapshot_type: runtimeConfig.snapshotTypeInput,
            snapshot: {
              version: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault),
              ...buildFormulaMetadata('insumo'),
              input: body, output: result,
            },
            created_by: user.id,
          });

          await supabase.from('operation_calculation_inputs').upsert({
            operation_id: body.operationId, scenario_type: 'insumo',
            calculation_version: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault),
            juros_cet_aa: Number(body.jurosCetAa), fee_oken_pct: Number(body.feeOkenPct),
            incentivo_pct: Number(body.incentivoPct), commodity: String(body.commodity),
            periodo_entrega: String(body.periodoEntrega), local_entrega: String(body.localEntrega),
            preco_bruto_commodity: Number(body.precoBrutoCommodity),
            tem_imposto: Boolean(body.temImposto), desconto_impostos_pct: Number(body.descontoImpostosPct),
            data_concessao: String(body.dataConcessao), vencimento: String(body.vencimento),
            data_entrega: String(body.dataEntrega), data_pagamento: String(body.dataPagamento),
            data_repasse: String(body.dataRepasse), rendimento_antecipacao_aa: Number(body.rendimentoAntecipacaoAa),
            preco_fornecedor: Number(body.precoFornecedor), markup_pct: Number(body.markupPct),
            desconto_pct: Number(body.descontoPct), fee_merchant_pct: Number(body.feeMerchantPct),
            formula_dependencies: buildFormulaMetadata('insumo').dependencies,
            formula_resolved: buildFormulaMetadata('insumo').formulas,
            input_audit_tags: body.inputAuditTags || {},
            regra_excecao_temporal: body.regraExcecaoTemporal || null,
            created_by: user.id,
          }, { onConflict: 'operation_id,scenario_type' });

          await supabase.from('operation_logs').insert({
            operation_id: body.operationId, user_id: user.id,
            action: 'server_input_memory_calculated',
            details: { version: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault), scenario: 'insumo' },
          });
        }
        break;
      }

      // === calculate-commodity-debt-memory (unchanged logic, just CORS fix) ===
      case 'calculate-commodity-debt-memory': {
        requireFields(body, [
          'valorDividaPv', 'jurosCetAa', 'dataConcessao', 'vencimento',
          'feeOkenPct', 'incentivoPct', 'commodity', 'periodoEntrega',
          'localEntrega', 'precoBrutoCommodity', 'temImposto', 'descontoImpostosPct',
          'dataEntrega', 'dataPagamento', 'dataRepasse', 'rendimentoAntecipacaoAa', 'feeDealerPct',
        ]);

        const creditComposition = await resolveCreditComposition(
          supabase,
          body.campaignId || null,
          Number(body.jurosCetAa),
          body.riskLevel,
          body.profile,
          body.operationType || body.scenarioType || 'divida',
        );

        const periodoJurosAnos = yearsBetween(body.dataConcessao, body.vencimento);
        const valorPontaSemFee = fv(creditComposition.effectiveCetAa, periodoJurosAnos, Number(body.valorDividaPv)) * (1 - Number(body.incentivoPct));
        const valorPontaComFee = valorPontaSemFee * (1 + Number(body.feeOkenPct));

        validateTemporalRules(body);
        const descontoImpostosEfetivo = body.temImposto ? Number(body.descontoImpostosPct) : 0;
        const precoLiquido = Number(body.precoBrutoCommodity) * (1 + descontoImpostosEfetivo);
        const periodoAteRepasseAnos = yearsBetween(body.dataRepasse, body.dataPagamento);
        const precoEntregaAjustado = pv(Number(body.rendimentoAntecipacaoAa), periodoAteRepasseAnos, precoLiquido);

        const paridadeRealSacas = valorPontaComFee / precoEntregaAjustado;
        const montanteInsumoReferencia = fv(creditComposition.effectiveCetAa, periodoJurosAnos, Number(body.valorDividaPv));

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
          periodoJurosAnos, valorPontaSemFee, valorPontaComFee,
          precoLiquido, periodoAteRepasseAnos, precoEntregaAjustado,
          paridadeRealSacas, montanteInsumoReferencia, precoValorizado,
          valorizacaoNominal, valorizacaoPercent, feeSacasFarmer,
          sacasTransfDealer, feeSacasDealer, walletDealer,
          montantePagoDealer, revenueOken,
          creditComposition,
          calculationVersion: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault),
        };

        if (body.operationId) {
          await supabase.from('order_pricing_snapshots').insert({
            operation_id: body.operationId,
            snapshot_type: runtimeConfig.snapshotTypeDebt,
            snapshot: {
              version: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault),
              ...buildFormulaMetadata('divida'),
              input: body, output: result,
            },
            created_by: user.id,
          });

          await supabase.from('operation_calculation_inputs').upsert({
            operation_id: body.operationId, scenario_type: 'divida',
            calculation_version: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault),
            juros_cet_aa: Number(body.jurosCetAa), fee_oken_pct: Number(body.feeOkenPct),
            incentivo_pct: Number(body.incentivoPct), commodity: String(body.commodity),
            periodo_entrega: String(body.periodoEntrega), local_entrega: String(body.localEntrega),
            preco_bruto_commodity: Number(body.precoBrutoCommodity),
            tem_imposto: Boolean(body.temImposto), desconto_impostos_pct: Number(body.descontoImpostosPct),
            data_concessao: String(body.dataConcessao), vencimento: String(body.vencimento),
            data_entrega: String(body.dataEntrega), data_pagamento: String(body.dataPagamento),
            data_repasse: String(body.dataRepasse), rendimento_antecipacao_aa: Number(body.rendimentoAntecipacaoAa),
            valor_divida_pv: Number(body.valorDividaPv), fee_dealer_pct: Number(body.feeDealerPct),
            formula_dependencies: buildFormulaMetadata('divida').dependencies,
            formula_resolved: buildFormulaMetadata('divida').formulas,
            input_audit_tags: body.inputAuditTags || {},
            regra_excecao_temporal: body.regraExcecaoTemporal || null,
            created_by: user.id,
          }, { onConflict: 'operation_id,scenario_type' });

          await supabase.from('operation_logs').insert({
            operation_id: body.operationId, user_id: user.id,
            action: 'server_debt_memory_calculated',
            details: { version: String(calcPolicy.policyPayload.calculationVersionDefault || runtimeConfig.calculationVersionDefault), scenario: 'divida' },
          });
        }
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    await recordPolicyDecisionAudit(supabase, {
      tenantId,
      domainRef: 'calculate_engine',
      domainId: body.operationId || null,
      policyKey: 'calculate_engine',
      resolvedPolicy: calcPolicy,
      appliedRule: path || 'unknown',
      decisionInputs: body || {},
      decisionOutput: result,
      rationale: 'Edge function executed with server-resolved policy',
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message.startsWith('Missing required fields:') ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
