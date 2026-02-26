import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// CORS: restrict to allowed origins via env, fallback to '*' in dev
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

function calcularDistanciaHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.3;
}

async function fetchYahooPrice(ticker: string): Promise<{ price: number; currency: string }> {
  // Validate ticker: only allow alphanumeric, =, ., ^, - (prevent injection)
  if (!/^[A-Za-z0-9=.\-^]{1,20}$/.test(ticker)) {
    throw new Error(`Invalid ticker format: ${ticker}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance error for ${ticker}: ${response.status}`);
    }

    const data = await response.json();
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data.chart?.result?.[0]?.meta?.currency || 'USD';

    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error(`Price not found for ${ticker}`);
    }

    return { price, currency };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExchangeRate(): Promise<number> {
  const { price } = await fetchYahooPrice('USDBRL=X');
  return price;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const urlPath = url.pathname.split('/').pop();
    const path = body.endpoint || (urlPath !== 'realtime-pricing' ? urlPath : null);

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
      case 'fetch-price': {
        // FIX 4: ticker comes from DB via commodityPricingId, NOT from client
        const { commodityPricingId, ticker: rawTicker, currency_unit } = body;

        let ticker = rawTicker;
        let currencyUnit = currency_unit || 'USc';

        if (commodityPricingId) {
          const { data: cpRow, error: cpErr } = await supabase
            .from('commodity_pricing')
            .select('ticker, currency_unit')
            .eq('id', commodityPricingId)
            .single();
          if (cpErr || !cpRow) throw new Error('commodity_pricing not found');
          ticker = cpRow.ticker;
          currencyUnit = cpRow.currency_unit || 'USc';
        }

        if (!ticker) throw new Error('ticker is required (provide commodityPricingId or ticker)');

        const { price, currency } = await fetchYahooPrice(ticker);

        let priceUSD = price;
        if (currencyUnit === 'USc') {
          priceUSD = price / 100;
        }

        result = {
          ticker,
          raw_price: price,
          price_usd: priceUSD,
          currency,
          currency_unit: currencyUnit,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      case 'fetch-exchange': {
        const cambio = await fetchExchangeRate();
        result = {
          pair: 'USD/BRL',
          rate: cambio,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      case 'calculate-distance': {
        const { origem_lat, origem_lng, destino_lat, destino_lng } = body;

        if (!origem_lat || !origem_lng || !destino_lat || !destino_lng) {
          throw new Error('origem_lat, origem_lng, destino_lat, destino_lng are required');
        }

        // Validate numeric ranges
        if (Math.abs(origem_lat) > 90 || Math.abs(destino_lat) > 90 ||
            Math.abs(origem_lng) > 180 || Math.abs(destino_lng) > 180) {
          throw new Error('Invalid coordinates');
        }

        // FIX 1.5: Use HTTPS for OSRM
        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origem_lng},${origem_lat};${destino_lng},${destino_lat}?overview=false`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch(osrmUrl, { signal: controller.signal });
            const data = await response.json();
            if (data.code === 'Ok' && data.routes?.length > 0) {
              const route = data.routes[0];
              result = {
                distancia_km: Math.round(route.distance / 10) / 100,
                metodo: 'osrm',
                duracao_horas: Math.round(route.duration / 36) / 100,
              };
              break;
            }
          } finally {
            clearTimeout(timeout);
          }
        } catch (_e) {
          // fallback to haversine
        }

        const distanciaKm = calcularDistanciaHaversine(origem_lat, origem_lng, destino_lat, destino_lng);
        result = {
          distancia_km: Math.round(distanciaKm * 100) / 100,
          metodo: 'haversine',
          aviso: 'Distância estimada em linha reta (+30%)',
        };
        break;
      }

      case 'calculate-parity-live': {
        // FIX: Accept commodityPricingId to fetch params from DB
        const { commodityPricingId, operationId } = body;

        let ticker: string;
        let currencyUnit: string;
        let bushelsTon: number;
        let pesoSaca: number;
        let premioValue: number;
        let freteValue: number;
        let basisValue: number;
        let deltaMarket: number;
        let deltaFreight: number;

        if (commodityPricingId) {
          const { data: cp, error: cpErr } = await supabase
            .from('commodity_pricing')
            .select('*')
            .eq('id', commodityPricingId)
            .single();
          if (cpErr || !cp) throw new Error('commodity_pricing not found');

          ticker = cp.ticker || '';
          currencyUnit = cp.currency_unit || 'USc';
          bushelsTon = cp.bushels_per_ton || 36.744;
          pesoSaca = cp.peso_saca_kg || 60;
          premioValue = 0; // from body if needed
          freteValue = body.frete_r_ton || 0;
          basisValue = body.basis_port != null ? body.basis_port : 0;
          deltaMarket = cp.security_delta_market || 0;
          deltaFreight = cp.security_delta_freight || 0;

          // Resolve basis from port name
          if (body.port_name && cp.basis_by_port) {
            const basisByPort = typeof cp.basis_by_port === 'string' ? JSON.parse(cp.basis_by_port) : cp.basis_by_port;
            basisValue = basisByPort[body.port_name] ?? basisValue;
          }
        } else {
          // Legacy fallback — still validate
          ticker = body.ticker;
          currencyUnit = body.currency_unit || 'USc';
          bushelsTon = body.bushels_per_ton || 36.744;
          pesoSaca = body.peso_saca_kg || 60;
          premioValue = body.premio_cents || 0;
          freteValue = body.frete_r_ton || 0;
          basisValue = body.basis_port || 0;
          deltaMarket = body.security_delta_market || 0;
          deltaFreight = body.security_delta_freight || 0;
        }

        if (!ticker) throw new Error('ticker is required');

        // Validate numeric bounds
        if (deltaMarket < 0 || deltaMarket > 100) throw new Error('security_delta_market must be 0-100');
        if (deltaFreight < 0 || deltaFreight > 100) throw new Error('security_delta_freight must be 0-100');
        if (freteValue < 0) throw new Error('frete_r_ton must be >= 0');

        const { price: rawPrice } = await fetchYahooPrice(ticker);
        let commodityPriceUSD = rawPrice;
        if (currencyUnit === 'USc') {
          commodityPriceUSD = rawPrice / 100;
        }

        const cambio = await fetchExchangeRate();
        const sacasPerTon = 1000 / pesoSaca;

        const commodityUSDTon = commodityPriceUSD * bushelsTon;
        const premioUSDTon = (premioValue / 100) * bushelsTon;
        const basisUSDTon = basisValue * bushelsTon;
        const fobUSDTon = commodityUSDTon + premioUSDTon + basisUSDTon;

        const paridadePortoBRL = fobUSDTon * cambio;
        const afterMarketDelta = paridadePortoBRL * (1 - deltaMarket / 100);
        const precoInteriorBRL = afterMarketDelta - freteValue;
        const afterFreightDelta = precoInteriorBRL * (1 - deltaFreight / 100);

        const precoSaca = Math.max(afterFreightDelta / sacasPerTon, 0.01);

        result = {
          commodity_raw_price: rawPrice,
          commodity_usd_bu: commodityPriceUSD,
          cambio_usd_brl: cambio,
          commodity_usd_ton: commodityUSDTon,
          fob_usd_ton: fobUSDTon,
          paridade_porto_r_ton: paridadePortoBRL,
          preco_interior_r_ton: afterFreightDelta,
          preco_produtor_r_saca: precoSaca,
          parametros: {
            ticker,
            bushels_per_ton: bushelsTon,
            peso_saca_kg: pesoSaca,
            premio_cents: premioValue,
            frete_r_ton: freteValue,
            basis_port: basisValue,
            delta_market: deltaMarket,
            delta_freight: deltaFreight,
          },
          timestamp: new Date().toISOString(),
        };

        if (operationId) {
          await supabase.from('operation_logs').insert({
            operation_id: operationId,
            user_id: user.id,
            action: 'realtime_parity_calculated',
            details: result,
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
    const corsHeaders = getCorsHeaders(req);
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('Realtime pricing error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
