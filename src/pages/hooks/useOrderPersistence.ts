import { useEffect } from 'react';
import { getAllMunicipios } from '@/data/municipios';
import type { ChannelSegment } from '@/types/barter';

const normalizeKey = (v: string) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function useOrderPersistence(params: {
  existingOp: any;
  existingItems: any[] | undefined;
  products: any[];
  activeCampaigns: any[] | undefined;
  selectedCampaignId: string;
  setSelectedCampaignId: (v: string) => void;
  isNewOperation: boolean;
  setClientName: (v: string) => void;
  setClientDocument: (v: string) => void;
  setClientCity: (v: string) => void;
  setClientState: (v: string) => void;
  setClientCityCode: (v: string) => void;
  setChannelEnum: (v: ChannelSegment) => void;
  setSelectedDistributorId: (v: string) => void;
  setChannelSegmentName: (v: string) => void;
  setSegment: (v: string) => void;
  setArea: (v: number) => void;
  setSelectedCommodity: (v: string) => void;
  setDueMonths: (v: number) => void;
  setSelectedProducts: (v: Map<string, number>) => void;
  setFreeQuantities: (v: Map<string, number>) => void;
  setPackagingSplits: (v: Map<string, { productId: string; qty: number }[]>) => void;
  setComboQty: (v: number) => void;
}) {
  useEffect(() => {
    const existingOp = params.existingOp;
    if (existingOp) {
      params.setSelectedCampaignId(existingOp.campaign_id);
      params.setClientName(existingOp.client_name || '');
      params.setClientDocument(existingOp.client_document || '');
      params.setClientCity(existingOp.city || '');
      params.setClientState(existingOp.state || '');
      if (existingOp.city && existingOp.state) {
        const cityMatch = getAllMunicipios().find(m => m.uf === existingOp.state && normalizeKey(m.name) === normalizeKey(existingOp.city || ''));
        params.setClientCityCode(cityMatch?.ibge || '');
      }
      params.setChannelEnum((existingOp.channel || 'distribuidor') as ChannelSegment);
      params.setSelectedDistributorId((existingOp as any).distributor_id || '');
      params.setChannelSegmentName((existingOp as any).channel_segment_name || '');
      params.setSegment((existingOp as any).commercial_segment_name || '');
      params.setArea(existingOp.area_hectares || 500);
      if (existingOp.commodity) params.setSelectedCommodity(existingOp.commodity);
      if (existingOp.due_months) params.setDueMonths(existingOp.due_months);
    }
  }, [params.existingOp]);

  useEffect(() => {
    if (params.existingItems && params.existingItems.length > 0 && params.products.length > 0) {
      const map = new Map<string, number>();
      for (const item of params.existingItems) map.set(item.product_id, item.dose_per_hectare);
      params.setSelectedProducts(map);
    }
  }, [params.existingItems, params.products]);

  useEffect(() => {
    if (!params.selectedCampaignId && params.activeCampaigns?.length) params.setSelectedCampaignId(params.activeCampaigns[0].id);
  }, [params.activeCampaigns, params.selectedCampaignId]);

  useEffect(() => {
    if (!params.isNewOperation) return;
    params.setClientState('');
    params.setClientCity('');
    params.setClientCityCode('');
    params.setSelectedProducts(new Map());
    params.setFreeQuantities(new Map());
    params.setPackagingSplits(new Map());
    params.setComboQty(1);
  }, [params.selectedCampaignId, params.isNewOperation]);
}
