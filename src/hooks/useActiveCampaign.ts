import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Product, ComboDefinition, CommodityPricing, FreightReducer, Campaign, ChannelMargin } from '@/types/barter';

export function useActiveCampaigns() {
  return useQuery({
    queryKey: ['active-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCampaignData(campaignId?: string) {
  const campaignQuery = useQuery({
    queryKey: ['campaign-full', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const productsQuery = useQuery({
    queryKey: ['campaign-products-full', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_products')
        .select('*, product:products(*)')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return (data || []).map((cp: any) => cp.product).filter(Boolean);
    },
  });

  const combosQuery = useQuery({
    queryKey: ['campaign-combos-full', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data: combos, error } = await supabase
        .from('combos')
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('discount_percent', { ascending: false });
      if (error) throw error;
      
      // Fetch combo products for each combo (with product ref)
      const result: ComboDefinition[] = [];
      for (const combo of combos || []) {
        const { data: prods } = await supabase
          .from('combo_products')
          .select('*, product:products(id, ref, name)')
          .eq('combo_id', combo.id);
        result.push({
          id: combo.id,
          name: combo.name,
          discountPercent: combo.discount_percent,
          priority: combo.discount_percent,
          isComplementary: /^COMPLEMENTAR/i.test(combo.name),
          products: (prods || []).map(p => ({
            ref: ((p as any).product?.ref || (p as any).product?.name || '').toUpperCase(),
            productId: p.product_id,
            minDosePerHa: p.min_dose_per_ha,
            maxDosePerHa: p.max_dose_per_ha,
          })),
        });
      }
      return result;
    },
  });

  const marginsQuery = useQuery({
    queryKey: ['campaign-margins-full', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_margins')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return data;
    },
  });

  const commodityQuery = useQuery({
    queryKey: ['campaign-commodity-full', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commodity_pricing')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const cp = data[0];
      return {
        commodity: cp.commodity as any,
        exchange: cp.exchange,
        contract: cp.contract,
        exchangePrice: cp.exchange_price,
        optionCost: cp.option_cost || 0,
        exchangeRateBolsa: cp.exchange_rate_bolsa,
        exchangeRateOption: cp.exchange_rate_option || cp.exchange_rate_bolsa,
        basisByPort: (cp.basis_by_port || {}) as Record<string, number>,
        securityDeltaMarket: cp.security_delta_market || 2,
        securityDeltaFreight: cp.security_delta_freight || 15,
        stopLoss: cp.stop_loss || 0,
      } as CommodityPricing;
    },
  });

  const freightQuery = useQuery({
    queryKey: ['campaign-freight-full', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freight_reducers')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return (data || []).map(f => ({
        origin: f.origin,
        destination: f.destination,
        distanceKm: f.distance_km,
        costPerKm: f.cost_per_km,
        adjustment: f.adjustment || 0,
        totalReducer: f.total_reducer,
      })) as FreightReducer[];
    },
  });

  const deliveryLocationsQuery = useQuery({
    queryKey: ['campaign-delivery-locations', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_delivery_locations')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return data || [];
    },
  });

  const rawCommodityQuery = useQuery({
    queryKey: ['campaign-commodity-raw', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commodity_pricing')
        .select('*')
        .eq('campaign_id', campaignId!);
      if (error) throw error;
      return data || [];
    },
  });

  // Map DB campaign to engine Campaign type
  const campaign = campaignQuery.data;
  const margins = marginsQuery.data;
  const engineCampaign: Campaign | null = campaign ? {
    id: campaign.id,
    name: campaign.name,
    season: campaign.season,
    active: campaign.active,
    target: campaign.target as any,
    eligibility: {
      states: campaign.eligible_states || [],
      mesoregions: campaign.eligible_mesoregions || [],
      cities: campaign.eligible_cities || [],
      distributorSegments: (campaign.eligible_distributor_segments || []) as any[],
      clientSegments: campaign.eligible_client_segments || [],
    },
    margins: (margins || []).map(m => ({ segment: m.segment as any, marginPercent: m.margin_percent })),
    interestRate: campaign.interest_rate,
    exchangeRateProducts: campaign.exchange_rate_products,
    exchangeRateBarter: campaign.exchange_rate_barter,
    maxDiscountInternal: campaign.max_discount_internal,
    maxDiscountReseller: campaign.max_discount_reseller,
    priceListFormat: campaign.price_list_format as any,
    activeModules: (campaign.active_modules || []) as any[],
    availableDueDates: (campaign.available_due_dates || []),
    createdAt: campaign.created_at,
  } : null;

  // Map DB products to engine Product type
  const products: Product[] = (productsQuery.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    ref: (p.ref || '').toUpperCase(),
    category: p.category,
    activeIngredient: p.active_ingredient || '',
    unitType: p.unit_type as any,
    packageSizes: p.package_sizes || [1],
    unitsPerBox: p.units_per_box,
    boxesPerPallet: p.boxes_per_pallet,
    palletsPerTruck: p.pallets_per_truck,
    dosePerHectare: p.dose_per_hectare,
    minDose: p.min_dose,
    maxDose: p.max_dose,
    pricePerUnit: p.price_per_unit,
    currency: p.currency as any,
    priceType: p.price_type as any,
    includesMargin: p.includes_margin,
  }));

  const isLoading = campaignQuery.isLoading || productsQuery.isLoading || combosQuery.isLoading || marginsQuery.isLoading;

  return {
    campaign: engineCampaign,
    rawCampaign: campaignQuery.data,
    products,
    combos: combosQuery.data || [],
    commodityPricing: commodityQuery.data,
    rawCommodityPricing: rawCommodityQuery.data || [],
    freightReducers: freightQuery.data || [],
    deliveryLocations: deliveryLocationsQuery.data || [],
    isLoading,
  };
}
