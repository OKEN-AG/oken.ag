import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LivePriceResult {
  ticker: string;
  raw_price: number;
  price_usd: number;
  currency: string;
  timestamp: string;
}

interface ExchangeRateResult {
  pair: string;
  rate: number;
  timestamp: string;
}

interface DistanceResult {
  distancia_km: number;
  metodo: string;
  duracao_horas?: number;
  aviso?: string;
}

interface LiveParityResult {
  commodity_raw_price: number;
  commodity_usd_bu: number;
  cambio_usd_brl: number;
  commodity_usd_ton: number;
  fob_usd_ton: number;
  paridade_porto_r_ton: number;
  preco_interior_r_ton: number;
  preco_produtor_r_saca: number;
  timestamp: string;
}

export function useRealtimePricing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = async <T>(endpoint: string, body: Record<string, unknown>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('realtime-pricing', {
        body: { ...body, _endpoint: endpoint },
        headers: { 'x-endpoint': endpoint },
      });

      // The edge function routes by path, but supabase.functions.invoke doesn't support paths well.
      // We'll use a direct fetch instead.
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'iezoyqbrcfebdzwjxfbd';
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/realtime-pricing/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Error ${response.status}`);
      }

      return await response.json() as T;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const fetchLivePrice = (ticker: string, currencyUnit = 'USc') =>
    invoke<LivePriceResult>('fetch-price', { ticker, currency_unit: currencyUnit });

  const fetchExchangeRate = () =>
    invoke<ExchangeRateResult>('fetch-exchange', {});

  const calculateDistance = (origemLat: number, origemLng: number, destinoLat: number, destinoLng: number) =>
    invoke<DistanceResult>('calculate-distance', {
      origem_lat: origemLat, origem_lng: origemLng,
      destino_lat: destinoLat, destino_lng: destinoLng,
    });

  const calculateLiveParity = (params: {
    ticker: string;
    currency_unit?: string;
    bushels_per_ton?: number;
    peso_saca_kg?: number;
    frete_r_ton?: number;
    premio_cents?: number;
    basis_port?: number;
    security_delta_market?: number;
    security_delta_freight?: number;
    operationId?: string;
  }) => invoke<LiveParityResult>('calculate-parity-live', params);

  return {
    loading,
    error,
    fetchLivePrice,
    fetchExchangeRate,
    calculateDistance,
    calculateLiveParity,
  };
}
