import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * REALTIME PRICING ENGINE
 * 
 * Endpoints:
 * POST /fetch-price     - Fetch live commodity price from Yahoo Finance or B3
 * POST /fetch-exchange   - Fetch live USD/BRL exchange rate
 * POST /calculate-distance - Calculate distance between two coordinates (OSRM + Haversine fallback)
 * POST /calculate-parity-live - Full parity calculation with live prices
 */

function calcularDistanciaHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.3; // +30% for road vs straight line
}

async function fetchYahooPrice(ticker: string): Promise<{ price: number; currency: string }> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Yahoo Finance error for ${ticker}: ${response.status}`);
  }

  const data = await response.json();
  const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
  const currency = data.chart?.result?.[0]?.meta?.currency || 'USD';

  if (!price) {
    throw new Error(`Price not found for ${ticker}`);
  }

  return { price, currency };
}

async function fetchExchangeRate(): Promise<number> {
  const { price } = await fetchYahooPrice('USDBRL=X');
  return price;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const body = await req.json();
    // Support both URL path routing and body.endpoint for supabase.functions.invoke
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
        const { ticker, currency_unit } = body;
        if (!ticker) throw new Error('ticker is required');

        const { price, currency } = await fetchYahooPrice(ticker);

        // Convert based on currency unit
        let priceUSD = price;
        if (currency_unit === 'USc') {
          priceUSD = price / 100; // cents to dollars
        }

        result = {
          ticker,
          raw_price: price,
          price_usd: priceUSD,
          currency,
          currency_unit: currency_unit || 'USD',
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

        // Try OSRM first (free public API)
        try {
          const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${origem_lng},${origem_lat};${destino_lng},${destino_lat}?overview=false`;
          const response = await fetch(osrmUrl);
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
        const {
          ticker, currency_unit, bushels_per_ton, peso_saca_kg,
          frete_r_ton, premio_cents, basis_port,
          security_delta_market, security_delta_freight,
        } = body;

        if (!ticker) throw new Error('ticker is required');

        // 1. Fetch live commodity price
        const { price: rawPrice } = await fetchYahooPrice(ticker);
        let commodityPriceUSD = rawPrice;
        if (currency_unit === 'USc') {
          commodityPriceUSD = rawPrice / 100;
        }

        // 2. Fetch live exchange rate
        const cambio = await fetchExchangeRate();

        // 3. Calculate parity
        const bushelsTon = bushels_per_ton || 36.744;
        const pesoSaca = peso_saca_kg || 60;
        const sacasPerTon = 1000 / pesoSaca;
        const premioValue = premio_cents || 0;
        const freteValue = frete_r_ton || 0;
        const basisValue = basis_port || 0;
        const deltaMarket = security_delta_market || 0;
        const deltaFreight = security_delta_freight || 0;

        // USD/ton
        const commodityUSDTon = commodityPriceUSD * bushelsTon;
        const premioUSDTon = (premioValue / 100) * bushelsTon;
        const basisUSDTon = basisValue * bushelsTon;
        const fobUSDTon = commodityUSDTon + premioUSDTon + basisUSDTon;

        // BRL/ton
        const paridadePortoBRL = fobUSDTon * cambio;
        const afterMarketDelta = paridadePortoBRL * (1 - deltaMarket / 100);
        const precoInteriorBRL = afterMarketDelta - freteValue;
        const afterFreightDelta = precoInteriorBRL * (1 - deltaFreight / 100);

        // BRL/saca
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

        // Log
        if (body.operationId) {
          await supabase.from('operation_logs').insert({
            operation_id: body.operationId,
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
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('Realtime pricing error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
