import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ParityEngineInput {
  campaignId: string;
  commodityCode: string;
  port?: string;
  freightOrigin?: string;
  deliveryLocationId?: string;
  amount: number;
  grossAmount?: number;
  hasContract?: boolean;
  userOverridePrice?: number;
  showInsurance?: boolean;
  buyerId?: string;
  contractPriceType?: string;
  livePrice?: number | null;
  liveExchangeRate?: number | null;
}

export interface ParityEngineResult {
  parity: {
    totalAmountBRL: number;
    commodityPricePerUnit: number;
    quantitySacas: number;
    referencePrice: number;
    valorization: number;
    userOverridePrice: number | null;
    hasExistingContract: boolean;
  };
  insurance: {
    premiumPerSaca: number;
    additionalSacas: number;
    totalSacas: number;
    volatility: number;
    strikePercent: number;
    maturityDays: number;
  } | null;
  commodityNetPrice: number;
  effectiveCommodityPrice: number;
  valorizationBonus: number;
  ivp: number;
  ports: string[];
  freightOrigins: { origin: string; destination: string }[];
  deliveryLocations: { id: string; warehouseName: string; city: string; state: string; latitude: number; longitude: number }[];
  buyers: { id: string; buyerName: string; fee: number }[];
  commodityPricingRow: {
    exchange: string; contract: string;
    exchangePrice: number; exchangeRateBolsa: number;
    optionCost: number; securityDeltaMarket: number;
    securityDeltaFreight: number; stopLoss: number;
    bushelsPerTon: number; pesoSacaKg: number;
    volatility: number; riskFreeRate: number;
    ticker: string; currencyUnit: string;
  };
  timestamp: string;
}

export function useParityEngine() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParityEngineResult | null>(null);

  const calculate = useCallback(async (input: ParityEngineInput): Promise<ParityEngineResult> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('simulation-engine', {
        body: { endpoint: 'calculate-parity', ...input },
      });
      if (fnError) throw new Error(fnError.message || 'Edge function error');
      if (data?.error) throw new Error(data.error);
      setResult(data as ParityEngineResult);
      return data as ParityEngineResult;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, calculate };
}
