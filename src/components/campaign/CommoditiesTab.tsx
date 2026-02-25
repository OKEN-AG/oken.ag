import { useEffect, useMemo, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, Upload, ClipboardPaste, Wifi, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCommodityPricing, useUpsertCommodityPricing, useFreightReducers, useUpsertFreightReducer, useDeleteFreightReducer } from '@/hooks/useCommodityPricing';
import { useCommodityOptions } from '@/hooks/useCommoditiesMasterData';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const PRICE_TYPES = [
  { value: 'pre_existente', label: 'Pré-Existente' },
  { value: 'fixo_no_ato', label: 'Fixo no Ato' },
  { value: 'a_fixar', label: 'A Fixar' },
];

const COUNTERPARTY_TYPES = [
  { value: 'terceiros_pre_aprovados', label: 'Terceiros Pré-Aprovados' },
  { value: 'terceiros_sob_demanda', label: 'Terceiros Aprovados Sob Demanda' },
  { value: 'nomeados_credor', label: 'Nomeados Pelo Credor' },
  { value: 'originacao_propria', label: 'Originação Própria' },
];

const INCENTIVE_TYPES = [
  { value: 'desconto_direto', label: 'Desconto Direto' },
  { value: 'credito_apos_liberacao', label: 'Crédito Após Liberação' },
  { value: 'credito_apos_liquidacao', label: 'Crédito Após Liquidação' },
];

type Props = { campaignId?: string; campaignCommodities?: string[] };
type BasisPort = { port: string; basis: number };
type DeliveryLocation = {
  id?: string; cda: string; warehouse_name: string; address: string; city: string; state: string;
  phone: string; email: string; location_type: string; capacity_tons: number; latitude: number; longitude: number;
};
type IndicativePrice = {
  id?: string; culture: string; price_type: string; month: string; state: string; market_place: string;
  price_per_saca: number; variation_percent: number; direction: string; updated_at: string; tax_rate: number;
};
type Valorization = { id?: string; commodity: string; nominal_value: number; percent_value: number; use_percent: boolean };
type Buyer = { id?: string; buyer_name: string; fee: number };

// Hooks for new tables
function useDeliveryLocations(campaignId?: string) {
  return useQuery({ queryKey: ['delivery-locations', campaignId], enabled: !!campaignId,
    queryFn: async () => { const { data, error } = await (supabase as any).from('campaign_delivery_locations').select('*').eq('campaign_id', campaignId!); if (error) throw error; return data as DeliveryLocation[]; },
  });
}
function useIndicativePrices(campaignId?: string) {
  return useQuery({ queryKey: ['indicative-prices', campaignId], enabled: !!campaignId,
    queryFn: async () => { const { data, error } = await (supabase as any).from('campaign_indicative_prices').select('*').eq('campaign_id', campaignId!); if (error) throw error; return data as IndicativePrice[]; },
  });
}
function useValorizations(campaignId?: string) {
  return useQuery({ queryKey: ['valorizations', campaignId], enabled: !!campaignId,
    queryFn: async () => { const { data, error } = await (supabase as any).from('campaign_commodity_valorizations').select('*').eq('campaign_id', campaignId!); if (error) throw error; return data as Valorization[]; },
  });
}
function useBuyers(campaignId?: string) {
  return useQuery({ queryKey: ['buyers', campaignId], enabled: !!campaignId,
    queryFn: async () => { const { data, error } = await (supabase as any).from('campaign_buyers').select('*').eq('campaign_id', campaignId!); if (error) throw error; return data as Buyer[]; },
  });
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const date = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal text-xs", !date && "text-muted-foreground")}>
            {date ? format(date, 'dd/MM/yyyy') : 'Selecionar'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={d => onChange(d ? format(d, 'yyyy-MM-dd') : '')} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function parseCSVRows<T>(text: string, mapper: (parts: string[]) => T): T[] {
  return text.trim().split('\n').slice(1).map(line => {
    const parts = line.split(/[;\t,]/).map(p => p.trim());
    return mapper(parts);
  });
}

export default function CommoditiesTab({ campaignId, campaignCommodities = [] }: Props) {
  const qc = useQueryClient();
  const { data: pricingList } = useCommodityPricing(campaignId);
  const { data: freightList, isLoading: loadingFreight } = useFreightReducers(campaignId);
  const { data: deliveryLocations = [] } = useDeliveryLocations(campaignId);
  const { data: indicativePrices = [] } = useIndicativePrices(campaignId);
  const { data: valorizations = [] } = useValorizations(campaignId);
  const { data: buyers = [] } = useBuyers(campaignId);
  const upsertPricing = useUpsertCommodityPricing();
  const upsertFreight = useUpsertFreightReducer();
  const deleteFreight = useDeleteFreightReducer();

  const [selectedCommodity, setSelectedCommodity] = useState(campaignCommodities[0] || 'soja');
  const { options: commodityOptions } = useCommodityOptions(campaignCommodities);

  useEffect(() => {
    if (!commodityOptions.length) return;
    if (!commodityOptions.some(option => option.value === selectedCommodity)) {
      setSelectedCommodity(commodityOptions[0].value);
    }
  }, [commodityOptions, selectedCommodity]);

  const commodityLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of commodityOptions) map.set(option.value, option.label);
    return map;
  }, [commodityOptions]);
  const [pricingForm, setPricingForm] = useState<any>(null);
  const [basisPorts, setBasisPorts] = useState<BasisPort[]>([]);
  const [newPort, setNewPort] = useState('');
  const [newBasis, setNewBasis] = useState(0);
  const [newFreight, setNewFreight] = useState({ origin: '', destination: '', distance_km: 0, cost_per_km: 0.10, adjustment: 0 });

  // Campaign-level fields (stored on campaigns table via parent form, but also locally for commodity config)
  const [deliveryStart, setDeliveryStart] = useState('');
  const [deliveryEnd, setDeliveryEnd] = useState('');
  const [priceTypes, setPriceTypes] = useState<string[]>([]);
  const [counterparties, setCounterparties] = useState<string[]>([]);
  const [earlyDiscount, setEarlyDiscount] = useState(false);
  const [incentiveType, setIncentiveType] = useState('desconto_direto');
  const [incentive1, setIncentive1] = useState(0);
  const [incentive2, setIncentive2] = useState(0);
  const [incentive3, setIncentive3] = useState(0);

  // New buyer
  const [newBuyerName, setNewBuyerName] = useState('');
  const [newBuyerFee, setNewBuyerFee] = useState(0);

  // New delivery location manual entry
  const emptyLoc = { cda: '', warehouse_name: '', address: '', city: '', state: '', phone: '', email: '', location_type: '', capacity_tons: 0, latitude: 0, longitude: 0 };
  const [newLoc, setNewLoc] = useState(emptyLoc);
  const [showAddLoc, setShowAddLoc] = useState(false);

  // Paste/import modes
  const [locPasteMode, setLocPasteMode] = useState(false);
  const [locPasteText, setLocPasteText] = useState('');
  const [pricePasteMode, setPricePasteMode] = useState(false);
  const [pricePasteText, setPricePasteText] = useState('');
  const [freightPasteMode, setFreightPasteMode] = useState(false);
  const [freightPasteText, setFreightPasteText] = useState('');
  const locFileRef = useRef<HTMLInputElement>(null);
  const priceFileRef = useRef<HTMLInputElement>(null);

  // Load campaign-level commodity settings
  useEffect(() => {
    if (campaignId) {
      (supabase as any).from('campaigns').select('delivery_start_date,delivery_end_date,price_types,accepted_counterparties,early_discount_enabled,global_incentive_type,global_incentive_1,global_incentive_2,global_incentive_3').eq('id', campaignId).single().then(({ data }: any) => {
        if (data) {
          setDeliveryStart(data.delivery_start_date || '');
          setDeliveryEnd(data.delivery_end_date || '');
          setPriceTypes(data.price_types || []);
          setCounterparties(data.accepted_counterparties || []);
          setEarlyDiscount(data.early_discount_enabled || false);
          setIncentiveType(data.global_incentive_type || 'desconto_direto');
          setIncentive1(Number(data.global_incentive_1 || 0));
          setIncentive2(Number(data.global_incentive_2 || 0));
          setIncentive3(Number(data.global_incentive_3 || 0));
        }
      });
    }
  }, [campaignId]);

  // API config state
  const [apiConfig, setApiConfig] = useState({ ticker: '', ticker_b3: '', api_source: 'yahoo', bushels_per_ton: 36.744, peso_saca_kg: 60, currency_unit: 'USc', unit_measure: 'bushel', market: 'CBOT' });
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<any>(null);

  useEffect(() => {
    if (pricingList) {
      const existing = pricingList.find((p: any) => p.commodity === selectedCommodity);
      if (existing) {
        setPricingForm({ id: existing.id, exchange: existing.exchange, contract: existing.contract, exchange_price: existing.exchange_price, exchange_rate_bolsa: existing.exchange_rate_bolsa, exchange_rate_option: existing.exchange_rate_option, option_cost: existing.option_cost, security_delta_market: existing.security_delta_market, security_delta_freight: existing.security_delta_freight, stop_loss: existing.stop_loss, volatility: existing.volatility, risk_free_rate: (existing as any).risk_free_rate ?? 0.1175 });
        const bp = existing.basis_by_port as any;
        setBasisPorts(bp && typeof bp === 'object' ? Object.entries(bp).map(([port, basis]) => ({ port, basis: Number(basis) })) : []);
        setApiConfig({
          ticker: (existing as any).ticker || '', ticker_b3: (existing as any).ticker_b3 || '',
          api_source: (existing as any).api_source || 'yahoo', bushels_per_ton: Number((existing as any).bushels_per_ton || 36.744),
          peso_saca_kg: Number((existing as any).peso_saca_kg || 60), currency_unit: (existing as any).currency_unit || 'USc',
          unit_measure: (existing as any).unit_measure || 'bushel', market: (existing as any).market || 'CBOT',
        });
      } else { setPricingForm(null); setBasisPorts([]); setApiConfig({ ticker: '', ticker_b3: '', api_source: 'yahoo', bushels_per_ton: 36.744, peso_saca_kg: 60, currency_unit: 'USc', unit_measure: 'bushel', market: 'CBOT' }); }
    }
  }, [pricingList, selectedCommodity]);

  const onPricingField = (k: string, v: any) => setPricingForm((p: any) => ({ ...p, [k]: v }));

  const savePricing = async () => {
    if (!campaignId) return;
    const basisObj: any = {};
    basisPorts.forEach(bp => { basisObj[bp.port] = bp.basis; });
    try {
      await upsertPricing.mutateAsync({ ...pricingForm, campaign_id: campaignId, commodity: selectedCommodity, basis_by_port: basisObj });
      toast.success('Precificação salva');
    } catch (e: any) { toast.error(e.message); }
  };

  const saveCampaignCommoditySettings = async () => {
    if (!campaignId) return;
    try {
      await (supabase as any).from('campaigns').update({
        delivery_start_date: deliveryStart || null, delivery_end_date: deliveryEnd || null,
        price_types: priceTypes, accepted_counterparties: counterparties, early_discount_enabled: earlyDiscount,
        global_incentive_type: incentiveType, global_incentive_1: incentive1, global_incentive_2: incentive2, global_incentive_3: incentive3,
      }).eq('id', campaignId);
      toast.success('Configurações salvas');
    } catch (e: any) { toast.error(e.message); }
  };

  const addBasisPort = () => { if (!newPort.trim()) return; setBasisPorts(prev => [...prev, { port: newPort.trim(), basis: newBasis }]); setNewPort(''); setNewBasis(0); };

  const addFreightReducer = async () => {
    if (!newFreight.origin || !newFreight.destination || !campaignId) return;
    const total = newFreight.distance_km * newFreight.cost_per_km + (newFreight.adjustment || 0);
    try {
      await upsertFreight.mutateAsync({ ...newFreight, campaign_id: campaignId, total_reducer: total });
      setNewFreight({ origin: '', destination: '', distance_km: 0, cost_per_km: 0.10, adjustment: 0 });
      toast.success('Frete adicionado');
    } catch (e: any) { toast.error(e.message); }
  };

  // Parse and import pasted freight data (vertical "De:/Para:" or ESALQ horizontal)
  const parseAndImportFreight = async (text: string) => {
    if (!campaignId || !text.trim()) return;
    const parseLocalNum = (s: string) => {
      if (!s) return 0;
      const cleaned = s.replace(/[^\d.,-]/g, '').replace(',', '.');
      return parseFloat(cleaned) || 0;
    };

    const defaultCostPerKm = 0.10;
    const rows: { origin: string; destination: string; distance_km: number; cost_per_km: number; adjustment: number; total_reducer: number }[] = [];

    const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Detect ESALQ freight format: contains "Freight" and "KM" and tickers like SRS-RDO
    const isEsalqFreight = rawLines.some(l => /Freight/i.test(l) && /\bKM\b/i.test(l));

    // Detect vertical "De:" / "Para:" format
    const isVerticalFreight = rawLines.some(l => /^De:$/i.test(l)) && rawLines.some(l => /^Para:$/i.test(l));

    if (isEsalqFreight) {
      // ESALQ format: continuous text, split by ticker pattern
      const joined = rawLines.join(' ');
      // Split at each record that has a ticker like "SRS-RDO" followed by arrow/space and distance
      const recordTexts = joined.split(/(?=ESALQ\s)/i).map(s => s.trim()).filter(Boolean);

      for (const rec of recordTexts) {
        // Extract origin "To" destination pattern: "... From ... <Origin> To <Destination> ..."
        const routeMatch = rec.match(/(?:Truck|Roads)\s+(.+?)\s+To\s+(.+?)\s+(?:Soybean|Corn|Coffee|Cotton|Sugar)/i);
        if (!routeMatch) continue;

        let origin = routeMatch[1].trim();
        let destination = routeMatch[2].trim();

        // Extract distance and price: "670 KM 187,4" or "670 KM 187.4"
        const dataMatch = rec.match(/([\d.,]+)\s*KM\s+([\d.,]+)/i);
        if (!dataMatch) continue;

        const distanceKm = parseLocalNum(dataMatch[1]);
        const totalReducer = parseLocalNum(dataMatch[2]);
        const costPerKm = distanceKm > 0 ? totalReducer / distanceKm : defaultCostPerKm;

        rows.push({
          origin, destination, distance_km: distanceKm,
          cost_per_km: Math.round(costPerKm * 10000) / 10000,
          adjustment: 0, total_reducer: totalReducer,
        });
      }
    } else if (isVerticalFreight) {
      // Vertical format:
      // De:
      // <City>(UF)
      // Para:
      // <City> (UF)
      // R$ <price>/tonelada
      let i = 0;
      while (i < rawLines.length) {
        const line = rawLines[i];
        if (/^De:$/i.test(line) && i + 3 < rawLines.length) {
          const originLine = rawLines[i + 1];
          const paraLine = rawLines[i + 2];
          if (/^Para:$/i.test(paraLine)) {
            const destLine = rawLines[i + 3];
            // Find price line: "R$ 214,30/tonelada"
            let priceLine = '';
            for (let j = i + 4; j < Math.min(i + 8, rawLines.length); j++) {
              if (/R\$\s*[\d.,]+\s*\/\s*tonelada/i.test(rawLines[j])) {
                priceLine = rawLines[j];
                i = j + 1;
                break;
              }
            }
            if (!priceLine) { i++; continue; }

            const origin = originLine.replace(/\(([A-Z]{2})\)/i, ', $1').trim();
            const destination = destLine.replace(/\(([A-Z]{2})\)/i, ', $1').trim();
            const priceMatch = priceLine.match(/R\$\s*([\d.,]+)/i);
            const totalReducer = priceMatch ? parseLocalNum(priceMatch[1]) : 0;

            rows.push({
              origin, destination, distance_km: 0,
              cost_per_km: defaultCostPerKm,
              adjustment: 0, total_reducer: totalReducer,
            });
            continue;
          }
        }
        i++;
      }
    } else {
      // Try generic tab-separated: origin \t destination \t distance \t cost_per_km \t total
      for (const line of rawLines) {
        const parts = line.split(/\t|;/).map(s => s.trim());
        if (parts.length >= 3) {
          const origin = parts[0];
          const destination = parts[1];
          const distance = parseLocalNum(parts[2]);
          const cost = parts[3] ? parseLocalNum(parts[3]) : defaultCostPerKm;
          const adj = parts[4] ? parseLocalNum(parts[4]) : 0;
          const total = parts[5] ? parseLocalNum(parts[5]) : (distance * cost + adj);
          if (origin && destination) {
            rows.push({ origin, destination, distance_km: distance, cost_per_km: cost, adjustment: adj, total_reducer: total });
          }
        }
      }
    }

    if (rows.length === 0) {
      toast.error('Nenhum frete identificado no texto colado');
      return;
    }

    // Dedup against existing
    const existingKeys = new Set((freightList || []).map((f: any) => `${f.origin.toLowerCase()}|${f.destination.toLowerCase()}`));
    const unique = rows.filter(r => !existingKeys.has(`${r.origin.toLowerCase()}|${r.destination.toLowerCase()}`));
    const dupes = rows.length - unique.length;

    if (unique.length > 0) {
      for (let i = 0; i < unique.length; i += 50) {
        const batch = unique.slice(i, i + 50);
        await (supabase as any).from('freight_reducers').insert(batch.map(r => ({ ...r, campaign_id: campaignId })));
      }
    }
    qc.invalidateQueries({ queryKey: ['freight-reducers', campaignId] });
    setFreightPasteText('');
    setFreightPasteMode(false);
    toast.success(`${unique.length} fretes importados${dupes > 0 ? `, ${dupes} duplicatas ignoradas` : ''}`);
  };

  const deleteAllFreight = async () => {
    if (!campaignId) return;
    await (supabase as any).from('freight_reducers').delete().eq('campaign_id', campaignId);
    qc.invalidateQueries({ queryKey: ['freight-reducers', campaignId] });
    toast.success('Todos os fretes removidos');
  };

  const removeDuplicateFreight = async () => {
    if (!campaignId || !(freightList || []).length) return;
    const seen = new Map<string, string>();
    const dupeIds: string[] = [];
    for (const fr of (freightList || []) as any[]) {
      const key = `${(fr.origin || '').toLowerCase().trim()}|${(fr.destination || '').toLowerCase().trim()}`;
      if (seen.has(key)) dupeIds.push(fr.id);
      else seen.set(key, fr.id);
    }
    if (dupeIds.length === 0) { toast.info('Nenhuma duplicata encontrada'); return; }
    for (let i = 0; i < dupeIds.length; i += 50) {
      await (supabase as any).from('freight_reducers').delete().in('id', dupeIds.slice(i, i + 50));
    }
    qc.invalidateQueries({ queryKey: ['freight-reducers', campaignId] });
    toast.success(`${dupeIds.length} duplicatas removidas`);
  };

  // CRUD helpers
  const addBuyer = async () => {
    if (!newBuyerName.trim() || !campaignId) return;
    await (supabase as any).from('campaign_buyers').insert({ campaign_id: campaignId, buyer_name: newBuyerName.trim(), fee: newBuyerFee });
    setNewBuyerName(''); setNewBuyerFee(0);
    qc.invalidateQueries({ queryKey: ['buyers', campaignId] });
  };
  const deleteBuyer = async (id: string) => {
    await (supabase as any).from('campaign_buyers').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['buyers', campaignId] });
  };

  const addValorization = async (commodity: string) => {
    if (!campaignId) return;
    await (supabase as any).from('campaign_commodity_valorizations').insert({ campaign_id: campaignId, commodity });
    qc.invalidateQueries({ queryKey: ['valorizations', campaignId] });
  };
  const updateValorization = async (id: string, field: string, value: any) => {
    await (supabase as any).from('campaign_commodity_valorizations').update({ [field]: value }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['valorizations', campaignId] });
  };
  const deleteValorization = async (id: string) => {
    await (supabase as any).from('campaign_commodity_valorizations').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['valorizations', campaignId] });
  };

  const bulkInsertLocations = async (locations: Omit<DeliveryLocation, 'id'>[]) => {
    if (!campaignId || locations.length === 0) return;
    // Fetch existing CDAs for dedup
    const existingCdas = new Set(deliveryLocations.filter((l: any) => l.cda).map((l: any) => l.cda));
    const unique = locations.filter(l => !l.cda || !existingCdas.has(l.cda));
    const dupes = locations.length - unique.length;
    if (unique.length > 0) {
      await (supabase as any).from('campaign_delivery_locations').insert(unique.map(l => ({ ...l, campaign_id: campaignId })));
    }
    qc.invalidateQueries({ queryKey: ['delivery-locations', campaignId] });
    toast.success(`${unique.length} armazéns importados${dupes > 0 ? `, ${dupes} duplicatas ignoradas` : ''}`);
  };
  const deleteLocation = async (id: string) => {
    await (supabase as any).from('campaign_delivery_locations').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['delivery-locations', campaignId] });
  };
  const deleteAllLocations = async () => {
    if (!campaignId) return;
    await (supabase as any).from('campaign_delivery_locations').delete().eq('campaign_id', campaignId);
    qc.invalidateQueries({ queryKey: ['delivery-locations', campaignId] });
    toast.success('Todos os locais de entrega removidos');
  };
  const removeDuplicateLocations = async () => {
    if (!campaignId || !deliveryLocations.length) return;
    const seen = new Map<string, string>();
    const dupeIds: string[] = [];
    for (const loc of deliveryLocations as any[]) {
      const key = (loc.cda || '').trim() || `${(loc.warehouse_name || '').trim()}_${(loc.city || '').trim()}_${(loc.state || '').trim()}`;
      if (seen.has(key)) {
        dupeIds.push(loc.id);
      } else {
        seen.set(key, loc.id);
      }
    }
    if (dupeIds.length === 0) { toast.info('Nenhuma duplicata encontrada'); return; }
    for (let i = 0; i < dupeIds.length; i += 50) {
      const batch = dupeIds.slice(i, i + 50);
      await (supabase as any).from('campaign_delivery_locations').delete().in('id', batch);
    }
    qc.invalidateQueries({ queryKey: ['delivery-locations', campaignId] });
    toast.success(`${dupeIds.length} duplicatas removidas`);
  };

  // CONAB XLS column detection and parsing
  const parseConabCapacity = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return Number(val.replace(/\./g, '').replace(',', '.')) || 0;
    return 0;
  };

  const scaleToCoord = (raw: number): number | null => {
    if (raw === 0) return null;
    const sign = raw < 0 ? -1 : 1;
    const abs = Math.abs(raw);
    if (abs <= 90) return raw; // already valid
    // Try dividing by powers of 10 to find valid coordinate range
    for (let div = 10; div <= 10000000; div *= 10) {
      const candidate = abs / div;
      if (candidate >= 1 && candidate <= 75) return sign * candidate;
    }
    return null;
  };

  const parseConabCoord = (val: any): number | null => {
    if (val == null || val === '') return null;
    // If it's already a number, scale if needed
    if (typeof val === 'number') {
      return scaleToCoord(val);
    }
    let str = String(val).trim();
    if (!str || str === '0') return null;
    // Replace comma with dot for decimal
    str = str.replace(',', '.');
    // Count dots to detect thousand separator vs decimal
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount <= 1) {
      const num = parseFloat(str);
      if (!isNaN(num) && num !== 0) {
        const scaled = scaleToCoord(num);
        if (scaled !== null) return scaled;
      }
    }
    // Multiple dots = Brazilian thousand separator format (e.g. "-3.483.854")
    const sign = str.startsWith('-') ? -1 : 1;
    const digits = str.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const asInt = parseInt(digits, 10);
    return scaleToCoord(sign * asInt);
  };

  const isValidBrazilCoord = (lat: number | null, lng: number | null): boolean => {
    if (lat === null || lng === null) return false;
    // Brazil bounds: lat ~[-34, +6], lng ~[-74, -34]
    return lat >= -35 && lat <= 7 && lng >= -75 && lng <= -34;
  };

  // CONAB coordinates often have wrong signs or missing negatives
  // Brazil: lat is always negative (except extreme north ~+5), lng is always negative
  const fixBrazilCoords = (lat: number | null, lng: number | null): { lat: number | null; lng: number | null } => {
    if (lat === null || lng === null) return { lat, lng };
    // If lng is positive and in range 34-75, it's missing the negative sign
    if (lng > 0 && lng >= 34 && lng <= 75) lng = -lng;
    // If lat is positive and > 6, it might be swapped with lng or missing sign
    if (lat > 6 && lat >= 34 && lat <= 75) {
      // Likely swapped: lat has lng value
      const tmp = lat;
      lat = lng;
      lng = -Math.abs(tmp);
    }
    return { lat, lng };
  };

  const parseConabRow = (row: Record<string, any>, headers?: string[]): Omit<DeliveryLocation, 'id'> | null => {
    const keys = Object.keys(row);
    const find = (patterns: string[]) => keys.find(k => patterns.some(p => k.toLowerCase().includes(p.toLowerCase())));
    
    // Try key-based matching first
    const cdaKey = find(['CDA']);
    const nameKey = find(['Armazenador', 'armaz']);
    const addrKey = find(['Endere']);
    const cityKey = find(['Munic', 'Cidade']);
    const stateKey = find(['UF']);
    const phoneKey = find(['Telefone', 'Fone']);
    const emailKey = find(['mail']);
    const typeKey = find(['Tipo']);
    const capKey = find(['CAP', 'Capacidade']);
    const latKey = find(['Latitude', 'Lat']);
    const lngKey = find(['Longitude', 'Long']);

    // If key matching seems broken (common with encoding issues), fall back to positional
    // Standard CONAB order: CDA(0) Armazenador(1) Endereço(2) Município(3) UF(4) Telefone(5) E-mail(6) Tipo(7) CAP(8) Lat(9) Lng(10)
    const usePositional = !nameKey || !cityKey || !stateKey;
    
    if (usePositional && headers && headers.length >= 5) {
      const vals = headers.map(h => row[h]);
      const name = String(vals[1] || '').trim();
      if (!name) return null;
      let lat = parseConabCoord(vals[9]);
      let lng = parseConabCoord(vals[10]);
      const fixed = fixBrazilCoords(lat, lng);
      lat = fixed.lat; lng = fixed.lng;
      const validCoords = isValidBrazilCoord(lat, lng);
      return {
        cda: String(vals[0] || '').trim(),
        warehouse_name: name,
        address: String(vals[2] || '').trim(),
        city: String(vals[3] || '').trim(),
        state: String(vals[4] || '').trim(),
        phone: String(vals[5] || '').trim(),
        email: String(vals[6] || '').trim(),
        location_type: String(vals[7] || '').trim(),
        capacity_tons: parseConabCapacity(vals[8]),
        latitude: validCoords ? lat : null,
        longitude: validCoords ? lng : null,
      };
    }

    if (!nameKey) return null;

    let lat = latKey ? parseConabCoord(row[latKey]) : null;
    let lng = lngKey ? parseConabCoord(row[lngKey]) : null;
    const fixed = fixBrazilCoords(lat, lng);
    lat = fixed.lat; lng = fixed.lng;
    const validCoords = isValidBrazilCoord(lat, lng);

    return {
      cda: String(row[cdaKey!] || '').trim(),
      warehouse_name: String(row[nameKey] || '').trim(),
      address: String(row[addrKey!] || '').trim(),
      city: String(row[cityKey!] || '').trim(),
      state: String(row[stateKey!] || '').trim(),
      phone: String(row[phoneKey!] || '').trim(),
      email: String(row[emailKey!] || '').trim(),
      location_type: String(row[typeKey!] || '').trim(),
      capacity_tons: parseConabCapacity(row[capKey!]),
      latitude: validCoords ? lat : null,
      longitude: validCoords ? lng : null,
    };
  };

  const conabFileRef = useRef<HTMLInputElement>(null);

  // Helper: read XLS/CSV and find CONAB header row, return parsed rows
  // CONAB files may have data on Sheet2 (Sheet1 = metadata), so scan ALL sheets
  const parseConabSheet = (wb: XLSX.WorkBook): Omit<DeliveryLocation, 'id'>[] => {
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      // Find header row: scan first 30 rows for one containing "CDA" AND "Armazenador"
      let headerIdx = -1;
      for (let i = 0; i < Math.min(raw.length, 30); i++) {
        const cells = (raw[i] || []).map(c => String(c || '').toLowerCase());
        if (cells.some(c => c.includes('cda')) && cells.some(c => c.includes('armazenador') || c.includes('armaz'))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) continue; // try next sheet
      const headers = (raw[headerIdx] || []).map(h => String(h || '').trim());
      
      // CONAB XLS files are often HTML tables saved as .xls.
      // The xlsx lib may merge "Endereço" and "Município" into a single garbled header.
      // We detect this and force the standard 11-column CONAB layout.
      const CONAB_11_HEADERS = ['CDA','Armazenador','Endereço','Município','UF','Telefone','E-mail','Tipo','CAP.(t)','Latitude','Longitude'];

      // Check if headers contain a merged "Endere...Munic" pattern
      const hasMergedAddrCity = headers.some(h => {
        const low = h.toLowerCase();
        return low.includes('endere') && low.includes('munic');
      });

      // Count non-empty headers
      const nonEmptyHeaders = headers.filter(h => h !== '');
      
      // Determine actual data width from first data row
      const firstDataRow = raw[headerIdx + 1] || [];
      const dataWidth = firstDataRow.length;

      let colMap: { headerName: string; dataIndices: number[] }[];

      if (hasMergedAddrCity || (nonEmptyHeaders.length < 11 && dataWidth >= 11)) {
        // Force standard 11-column positional mapping
        colMap = CONAB_11_HEADERS.map((name, i) => ({ headerName: name, dataIndices: [i] }));
      } else {
        // Normal: group empty-header columns with previous named column
        colMap = [];
        for (let i = 0; i < headers.length; i++) {
          if (headers[i]) {
            colMap.push({ headerName: headers[i], dataIndices: [i] });
          } else if (colMap.length > 0) {
            colMap[colMap.length - 1].dataIndices.push(i);
          }
        }
      }
      // Build clean header list for positional fallback
      const cleanHeaders = colMap.map(c => c.headerName);
      
      const dataRows = raw.slice(headerIdx + 1);
      const jsonRows: Record<string, any>[] = dataRows
        .filter(r => r && r.length > 1 && r.some(c => c != null && String(c).trim() !== ''))
        .map(r => {
          const obj: Record<string, any> = {};
          colMap.forEach(({ headerName, dataIndices }) => {
            if (dataIndices.length === 1) {
              obj[headerName] = r[dataIndices[0]];
            } else {
              // Concatenate values from merged columns
              obj[headerName] = dataIndices.map(i => String(r[i] || '').trim()).filter(Boolean).join(' ');
            }
          });
          return obj;
        });
      console.log('[CONAB-DEBUG] Sheet:', sheetName, 'cleanHeaders:', cleanHeaders, 'colMap:', JSON.stringify(colMap.map(c => ({h:c.headerName, idx:c.dataIndices}))));
      if (jsonRows.length > 0) console.log('[CONAB-DEBUG] Row0:', JSON.stringify(jsonRows[0]));
      const parsed = jsonRows.map(r => parseConabRow(r, cleanHeaders)).filter(Boolean) as Omit<DeliveryLocation, 'id'>[];
      if (parsed.length > 0) {
        console.log('[CONAB-DEBUG] Parsed0:', JSON.stringify(parsed[0]));
        return parsed;
      }
    }
    return []; // no CONAB data found in any sheet
  };

  const handleConabImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    let allRows: Omit<DeliveryLocation, 'id'>[] = [];
    const readFile = (file: File): Promise<Omit<DeliveryLocation, 'id'>[]> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          resolve(parseConabSheet(wb));
        };
        reader.readAsArrayBuffer(file);
      });
    };
    for (const file of Array.from(files)) {
      const rows = await readFile(file);
      allRows = [...allRows, ...rows];
    }
    if (allRows.length > 0) {
      await bulkInsertLocations(allRows);
    } else {
      toast.error('Nenhum armazém encontrado nos arquivos');
    }
    e.target.value = '';
  };

  const handleLocFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      reader.onload = (ev) => {
        // Try parsing CSV as if it were CONAB tab-separated
        const text = ev.target?.result as string;
        const lines = text.trim().split('\n');
        let headerIdx = -1;
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const lower = lines[i]?.toLowerCase() || '';
          if (lower.includes('cda') && (lower.includes('armazenador') || lower.includes('armaz'))) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx >= 0) {
          // CONAB CSV/TXT format
          const parsed: Omit<DeliveryLocation, 'id'>[] = [];
          for (let i = headerIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split('\t').map(p => p.trim());
            if (!parts[1]) continue;
            const lat = parseConabCoord(parts[9]);
            const lng = parseConabCoord(parts[10]);
            const validCoords = isValidBrazilCoord(lat, lng);
            parsed.push({
              cda: parts[0] || '', warehouse_name: parts[1] || '', address: parts[2] || '', city: parts[3] || '', state: parts[4] || '',
              phone: parts[5] || '', email: parts[6] || '', location_type: parts[7] || '',
              capacity_tons: parseConabCapacity(parts[8]),
              latitude: validCoords ? lat! : 0, longitude: validCoords ? lng! : 0,
            });
          }
          bulkInsertLocations(parsed);
        } else {
          // Fallback generic CSV
          const rows = parseCSVRows(text, parts => ({
            cda: parts[0] || '', warehouse_name: parts[1] || '', address: parts[2] || '', city: parts[3] || '', state: parts[4] || '',
            phone: parts[5] || '', email: parts[6] || '', location_type: parts[7] || '', capacity_tons: Number(parts[8] || 0),
            latitude: Number(parts[9] || 0), longitude: Number(parts[10] || 0),
          }));
          bulkInsertLocations(rows);
        }
      };
      reader.readAsText(file);
    } else {
      // XLS/XLSX: use CONAB-aware sheet parser
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const parsed = parseConabSheet(wb);
        if (parsed.length > 0) {
          bulkInsertLocations(parsed);
        } else {
          // Fallback to positional
          const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
          const rows = raw.slice(1).map(r => ({
            cda: String(r[0] || ''), warehouse_name: String(r[1] || ''), address: String(r[2] || ''), city: String(r[3] || ''), state: String(r[4] || ''),
            phone: String(r[5] || ''), email: String(r[6] || ''), location_type: String(r[7] || ''), capacity_tons: Number(r[8] || 0),
            latitude: Number(r[9] || 0), longitude: Number(r[10] || 0),
          }));
          bulkInsertLocations(rows);
        }
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  };

  const bulkInsertPrices = async (prices: Omit<IndicativePrice, 'id'>[]) => {
    if (!campaignId) return;
    await (supabase as any).from('campaign_indicative_prices').insert(prices.map(p => ({ ...p, campaign_id: campaignId })));
    qc.invalidateQueries({ queryKey: ['indicative-prices', campaignId] });
  };
  const deletePrice = async (id: string) => {
    await (supabase as any).from('campaign_indicative_prices').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['indicative-prices', campaignId] });
  };
  const deleteAllPrices = async () => {
    if (!campaignId) return;
    await (supabase as any).from('campaign_indicative_prices').delete().eq('campaign_id', campaignId);
    qc.invalidateQueries({ queryKey: ['indicative-prices', campaignId] });
    toast.success('Todos os preços indicativos removidos');
  };
  const removeDuplicatePrices = async () => {
    if (!campaignId || !indicativePrices.length) return;
    const seen = new Set<string>();
    const dupeIds: string[] = [];
    for (const p of indicativePrices) {
      const key = `${p.culture}|${p.price_type}|${p.state}|${p.market_place}|${p.price_per_saca}`;
      if (seen.has(key)) { dupeIds.push(p.id); } else { seen.add(key); }
    }
    if (dupeIds.length === 0) { toast.info('Nenhuma duplicata encontrada'); return; }
    for (const id of dupeIds) {
      await (supabase as any).from('campaign_indicative_prices').delete().eq('id', id);
    }
    qc.invalidateQueries({ queryKey: ['indicative-prices', campaignId] });
    toast.success(`${dupeIds.length} duplicatas removidas`);
  };

  const handlePriceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      reader.onload = (ev) => {
        const rows = parseCSVRows(ev.target?.result as string, parts => ({
          culture: parts[0] || '', price_type: parts[1] || '', month: parts[2] || '', state: parts[3] || '', market_place: parts[4] || '',
          price_per_saca: Number(parts[5] || 0), variation_percent: Number(parts[6] || 0), direction: parts[7] || '',
          updated_at: parts[8] || '', tax_rate: Number(parts[9] || 0),
        }));
        bulkInsertPrices(rows);
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const rows = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][]).slice(1).map(r => ({
          culture: String(r[0] || ''), price_type: String(r[1] || ''), month: String(r[2] || ''), state: String(r[3] || ''), market_place: String(r[4] || ''),
          price_per_saca: Number(r[5] || 0), variation_percent: Number(r[6] || 0), direction: String(r[7] || ''),
          updated_at: String(r[8] || ''), tax_rate: Number(r[9] || 0),
        }));
        bulkInsertPrices(rows);
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = '';
  };

  if (!campaignId) return <p className="text-center py-8 text-muted-foreground">Salve a campanha primeiro para configurar commodities.</p>;

  const defaultForm = { exchange: 'CBOT', contract: 'K', exchange_price: 0, exchange_rate_bolsa: 5.40, exchange_rate_option: 5.40, option_cost: 0, security_delta_market: 2, security_delta_freight: 15, stop_loss: 0, volatility: 25, risk_free_rate: 0.1175 };
  const f = pricingForm || defaultForm;

  return (
    <div className="space-y-6">
      {/* Commodity Selector */}
      <div className="flex items-center gap-4">
        <Label className="text-base font-semibold">Commodity:</Label>
        <div className="flex gap-2">
          {commodityOptions.map(option => (
            <Button key={option.value} variant={selectedCommodity === option.value ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCommodity(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="precificacao" className="w-full">
        <TabsList className="bg-muted border border-border flex-wrap h-auto">
          <TabsTrigger value="precificacao">Precificação</TabsTrigger>
          <TabsTrigger value="configuracao">Configuração</TabsTrigger>
          <TabsTrigger value="valorizacao">Valorização</TabsTrigger>
          <TabsTrigger value="incentivos">Incentivos</TabsTrigger>
          <TabsTrigger value="compradores">Compradores</TabsTrigger>
          <TabsTrigger value="locais">Locais de Entrega</TabsTrigger>
          <TabsTrigger value="precos_indicativos">Preços Indicativos</TabsTrigger>
          <TabsTrigger value="fretes">Fretes</TabsTrigger>
          <TabsTrigger value="consulta_api">Consulta API</TabsTrigger>
        </TabsList>

        {/* Pricing Tab */}
        <TabsContent value="precificacao" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <Label className="font-semibold">Precificação - {commodityLabelByValue.get(selectedCommodity) || selectedCommodity}</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Bolsa', 'exchange', f.exchange, 'text'],
                ['Contrato', 'contract', f.contract, 'text'],
                ['Preço Bolsa (USD)', 'exchange_price', f.exchange_price, 'number'],
                ['Câmbio Bolsa', 'exchange_rate_bolsa', f.exchange_rate_bolsa, 'number'],
                ['Câmbio Opção', 'exchange_rate_option', f.exchange_rate_option, 'number'],
                ['Custo Opção', 'option_cost', f.option_cost, 'number'],
                ['Delta Mercado (%)', 'security_delta_market', f.security_delta_market, 'number'],
                ['Delta Frete (R$/sc)', 'security_delta_freight', f.security_delta_freight, 'number'],
                ['Stop Loss (%)', 'stop_loss', f.stop_loss, 'number'],
                ['Volatilidade (%)', 'volatility', f.volatility, 'number'],
                ['Taxa Livre Risco (SELIC)', 'risk_free_rate', f.risk_free_rate ?? 0.1175, 'number'],
              ].map(([label, key, val, type]) => (
                <div key={key as string} className="space-y-1">
                  <Label className="text-xs">{label as string}</Label>
                  <Input type={type as string} step="0.01" value={val as any} onChange={e => onPricingField(key as string, type === 'number' ? Number(e.target.value) : e.target.value)} />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Basis por Porto</Label>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1"><Label className="text-xs">Porto</Label><Input value={newPort} onChange={e => setNewPort(e.target.value)} placeholder="Ex: Paranaguá" /></div>
                <div className="w-32 space-y-1"><Label className="text-xs">Basis (R$/sc)</Label><Input type="number" step="0.1" value={newBasis} onChange={e => setNewBasis(Number(e.target.value))} /></div>
                <Button variant="outline" size="sm" onClick={addBasisPort}><Plus className="w-3 h-3" /></Button>
              </div>
              {basisPorts.length > 0 && <div className="flex gap-2 flex-wrap">{basisPorts.map((bp, i) => (<Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setBasisPorts(prev => prev.filter((_, j) => j !== i))}>{bp.port}: R${bp.basis}/sc ×</Badge>))}</div>}
            </div>
            <Button onClick={savePricing} disabled={upsertPricing.isPending}><Save className="w-4 h-4 mr-1" /> Salvar Precificação</Button>
          </div>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuracao" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <Label className="font-semibold">Configuração de Commodity</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DateField label="Período de Entrega - Início" value={deliveryStart} onChange={setDeliveryStart} />
              <DateField label="Período de Entrega - Fim" value={deliveryEnd} onChange={setDeliveryEnd} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tipos de Preço</Label>
              <div className="flex gap-4 flex-wrap">
                {PRICE_TYPES.map(pt => (
                  <label key={pt.value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={priceTypes.includes(pt.value)} onCheckedChange={() => setPriceTypes(prev => prev.includes(pt.value) ? prev.filter(v => v !== pt.value) : [...prev, pt.value])} />
                    {pt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Contrapartes Aceitas</Label>
              <div className="flex gap-4 flex-wrap">
                {COUNTERPARTY_TYPES.map(ct => (
                  <label key={ct.value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={counterparties.includes(ct.value)} onCheckedChange={() => setCounterparties(prev => prev.includes(ct.value) ? prev.filter(v => v !== ct.value) : [...prev, ct.value])} />
                    {ct.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={earlyDiscount} onCheckedChange={setEarlyDiscount} />
              <Label>Desconto de Antecipação Habilitado</Label>
            </div>
            <Button onClick={saveCampaignCommoditySettings}><Save className="w-4 h-4 mr-1" /> Salvar Configuração</Button>
          </div>
        </TabsContent>

        {/* Valorization Tab */}
        <TabsContent value="valorizacao" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Valorização Padrão por Commodity</Label>
            </div>
            {commodityOptions.map(option => {
              const comm = option.value;
              const val = valorizations.find((v: any) => v.commodity === comm);
              return (
                <div key={comm} className="flex items-center gap-3 p-3 border border-border rounded-md">
                  <span className="font-medium text-sm w-24">{option.label}</span>
                  {val ? (
                    <>
                      <div className="space-y-1"><Label className="text-xs">Nominal</Label><Input type="number" step="0.01" value={val.nominal_value} onChange={e => updateValorization(val.id!, 'nominal_value', Number(e.target.value))} className="w-28 h-8" disabled={val.use_percent} /></div>
                      <div className="space-y-1"><Label className="text-xs">%</Label><Input type="number" step="0.1" value={val.percent_value} onChange={e => updateValorization(val.id!, 'percent_value', Number(e.target.value))} className="w-24 h-8" disabled={!val.use_percent} /></div>
                      <label className="flex items-center gap-1 text-xs"><Switch checked={val.use_percent} onCheckedChange={v => updateValorization(val.id!, 'use_percent', v)} />Usar %</label>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteValorization(val.id!)}><Trash2 className="w-3 h-3" /></Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => addValorization(comm)}><Plus className="w-3 h-3 mr-1" /> Configurar</Button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Incentives Tab */}
        <TabsContent value="incentivos" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <Label className="font-semibold">Incentivos Globais</Label>
            <div className="space-y-2">
              <Label className="text-sm">Tipo de Incentivo Selecionado</Label>
              <Select value={incentiveType} onValueChange={setIncentiveType}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{INCENTIVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1"><Label className="text-xs">Incentivo 1 (%)</Label><Input type="number" step="0.1" value={incentive1} onChange={e => setIncentive1(Number(e.target.value))} /></div>
              <div className="space-y-1"><Label className="text-xs">Incentivo 2 (%)</Label><Input type="number" step="0.1" value={incentive2} onChange={e => setIncentive2(Number(e.target.value))} /></div>
              <div className="space-y-1"><Label className="text-xs">Incentivo 3 (%)</Label><Input type="number" step="0.1" value={incentive3} onChange={e => setIncentive3(Number(e.target.value))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Esses % serão aplicados sobre o montante do pedido.</p>
            <Button onClick={saveCampaignCommoditySettings}><Save className="w-4 h-4 mr-1" /> Salvar Incentivos</Button>
          </div>
        </TabsContent>

        {/* Buyers Tab */}
        <TabsContent value="compradores" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <Label className="font-semibold">Compradores Pré-Cadastrados</Label>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1"><Label className="text-xs">Nome do Comprador</Label><Input value={newBuyerName} onChange={e => setNewBuyerName(e.target.value)} /></div>
              <div className="w-32 space-y-1"><Label className="text-xs">Fee (%)</Label><Input type="number" step="0.1" value={newBuyerFee} onChange={e => setNewBuyerFee(Number(e.target.value))} /></div>
              <Button onClick={addBuyer}><Plus className="w-4 h-4" /></Button>
            </div>
            {buyers.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Comprador</TableHead><TableHead>Fee (%)</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
                <TableBody>
                  {buyers.map((b: any) => (
                    <TableRow key={b.id}><TableCell>{b.buyer_name}</TableCell><TableCell>{b.fee}%</TableCell><TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteBuyer(b.id)}><Trash2 className="w-3 h-3" /></Button></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Delivery Locations Tab */}
        <TabsContent value="locais" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Locais de Entrega (Armazéns)</Label>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" onClick={() => setShowAddLoc(!showAddLoc)}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>
                <Button variant="outline" size="sm" onClick={() => setLocPasteMode(!locPasteMode)}><ClipboardPaste className="w-3 h-3 mr-1" /> Colar</Button>
                <Button variant="outline" size="sm" onClick={() => locFileRef.current?.click()}><Upload className="w-3 h-3 mr-1" /> Importar</Button>
                <Button variant="default" size="sm" onClick={() => conabFileRef.current?.click()}><Upload className="w-3 h-3 mr-1" /> Importar Base CONAB</Button>
                <input ref={locFileRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={handleLocFileUpload} />
                <input ref={conabFileRef} type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={handleConabImport} />
                {deliveryLocations.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={removeDuplicateLocations}>Remover Duplicados</Button>
                    <Button variant="destructive" size="sm" onClick={() => { if (confirm(`Apagar todos os ${deliveryLocations.length} locais de entrega?`)) deleteAllLocations(); }}><Trash2 className="w-3 h-3 mr-1" /> Apagar Todos</Button>
                  </>
                )}
              </div>
            </div>
            {locPasteMode && (
              <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
                <Label className="text-xs text-muted-foreground">Formato: CDA;Armazenador;Endereço;Município;UF;Telefone;E-mail;Tipo;CAP.(t);Latitude;Longitude</Label>
                <Textarea value={locPasteText} onChange={e => setLocPasteText(e.target.value)} rows={4} />
                <Button size="sm" onClick={() => {
                  const lines = locPasteText.trim().split('\n');
                  // CONAB XLS: headers on line 14, data from line 15
                  // Find the header row (contains "CDA" + "Armazenador") and start after it
                  let startIdx = 0;
                  for (let i = 0; i < Math.min(lines.length, 20); i++) {
                    const lower = lines[i]?.toLowerCase() || '';
                    if (lower.includes('cda') && (lower.includes('armazenador') || lower.includes('armaz'))) {
                      startIdx = i + 1;
                      break;
                    }
                  }
                  const parsed: Omit<DeliveryLocation, 'id'>[] = [];
                  for (let i = startIdx; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue; // skip blank lines
                    const parts = line.split('\t').map(p => p.trim());
                    if (!parts[1]) continue; // skip empty rows
                    const lat = parseConabCoord(parts[9]);
                    const lng = parseConabCoord(parts[10]);
                    const validCoords = isValidBrazilCoord(lat, lng);
                    parsed.push({
                      cda: parts[0] || '', warehouse_name: parts[1] || '', address: parts[2] || '', city: parts[3] || '', state: parts[4] || '',
                      phone: parts[5] || '', email: parts[6] || '', location_type: parts[7] || '',
                      capacity_tons: parseConabCapacity(parts[8]),
                      latitude: validCoords ? lat! : 0, longitude: validCoords ? lng! : 0,
                    });
                  }
                  bulkInsertLocations(parsed); setLocPasteText(''); setLocPasteMode(false);
                }}>Importar</Button>
              </div>
            )}
            {showAddLoc && (
              <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
                <Label className="text-sm font-medium">Novo Local de Entrega</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    ['CDA', 'cda'], ['Armazenador', 'warehouse_name'], ['Endereço', 'address'], ['Município', 'city'],
                    ['UF', 'state'], ['Telefone', 'phone'], ['E-mail', 'email'], ['Tipo', 'location_type'],
                  ].map(([label, key]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input value={(newLoc as any)[key]} onChange={e => setNewLoc(prev => ({ ...prev, [key]: e.target.value }))} className="h-8 text-xs" />
                    </div>
                  ))}
                  {[
                    ['Cap.(t)', 'capacity_tons'], ['Latitude', 'latitude'], ['Longitude', 'longitude'],
                  ].map(([label, key]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input type="number" step="any" value={(newLoc as any)[key]} onChange={e => setNewLoc(prev => ({ ...prev, [key]: Number(e.target.value) }))} className="h-8 text-xs" />
                    </div>
                  ))}
                </div>
                <Button size="sm" disabled={!newLoc.warehouse_name} onClick={async () => {
                  if (!campaignId) return;
                  await (supabase as any).from('campaign_delivery_locations').insert({ ...newLoc, campaign_id: campaignId });
                  qc.invalidateQueries({ queryKey: ['delivery-locations', campaignId] });
                  setNewLoc(emptyLoc);
                  toast.success('Local adicionado');
                }}>Adicionar</Button>
              </div>
            )}
            {deliveryLocations.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CDA</TableHead><TableHead>Armazenador</TableHead><TableHead>Endereço</TableHead><TableHead>Município</TableHead><TableHead>UF</TableHead><TableHead>Telefone</TableHead><TableHead>E-mail</TableHead><TableHead>Tipo</TableHead><TableHead>Cap.(t)</TableHead><TableHead>Lat</TableHead><TableHead>Long</TableHead><TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryLocations.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.cda}</TableCell><TableCell>{l.warehouse_name}</TableCell><TableCell className="text-xs">{l.address}</TableCell><TableCell>{l.city}</TableCell><TableCell>{l.state}</TableCell><TableCell className="text-xs">{l.phone}</TableCell><TableCell className="text-xs">{l.email}</TableCell><TableCell>{l.location_type}</TableCell><TableCell>{l.capacity_tons}</TableCell>
                        <TableCell className="text-xs">{l.latitude || '—'}</TableCell><TableCell className="text-xs">{l.longitude || '—'}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLocation(l.id)}><Trash2 className="w-3 h-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">Nenhum local de entrega. Importe via CSV/XLS ou cole texto.</p>}
          </div>
        </TabsContent>

        {/* Indicative Prices Tab */}
        <TabsContent value="precos_indicativos" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Base de Preços Indicativos</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPricePasteMode(!pricePasteMode)}><ClipboardPaste className="w-3 h-3 mr-1" /> Colar</Button>
                <Button variant="outline" size="sm" onClick={() => priceFileRef.current?.click()}><Upload className="w-3 h-3 mr-1" /> Importar</Button>
                <input ref={priceFileRef} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={handlePriceFileUpload} />
                {indicativePrices.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={removeDuplicatePrices}><Trash2 className="w-3 h-3 mr-1" /> Remover Duplicados</Button>
                    <Button variant="destructive" size="sm" onClick={() => { if (confirm('Excluir TODOS os preços indicativos?')) deleteAllPrices(); }}><Trash2 className="w-3 h-3 mr-1" /> Excluir Tudo</Button>
                  </>
                )}
              </div>
            </div>
            {pricePasteMode && (
              <div className="space-y-2 p-3 border border-border rounded-md bg-muted/30">
                <Label className="text-xs text-muted-foreground">
                  Formato aceito (TAB ou ponto-e-vírgula):<br/>
                  <span className="font-mono">Cultura ; Tipo ; Estado ; Praça ; Preço(R$/sc) ; Variação(%) ; Direção ; Data ; Alíquota(%)</span>
                </Label>
                <Textarea value={pricePasteText} onChange={e => setPricePasteText(e.target.value)} rows={6} placeholder="Cole aqui os dados de preços indicativos..." />
                <Button size="sm" onClick={() => {
                  const parseLocalNum = (s: string): number => {
                    if (!s) return 0;
                    let v = s.trim().replace(/[%+\s]/g, '');
                    const lastComma = v.lastIndexOf(',');
                    const lastDot = v.lastIndexOf('.');
                    if (lastComma > lastDot) {
                      v = v.replace(/\./g, '').replace(',', '.');
                    } else {
                      v = v.replace(/,/g, '');
                    }
                    return parseFloat(v) || 0;
                  };

                  const rawLines = pricePasteText.trim().split('\n').map(l => l.trim());
                  
                  // Detect format: if most lines have tabs with 5+ fields -> horizontal
                  // Otherwise assume vertical (each field on its own line)
                  const tabLines = rawLines.filter(l => l.split('\t').length >= 5);
                  const isHorizontal = tabLines.length > rawLines.length * 0.3;

                  const rows: Omit<IndicativePrice, 'id'>[] = [];

                  // --- ESALQ format detection ---
                  // Format: "12:00:00 AM TICKER ESALQ Commodity Grower Location Brazil [⇩⇧] price var1 var2 refPrice BRL DD/MM/YYYY"
                  // Records may be on one long line separated by date+time patterns
                  const isEsalq = rawLines.some(l => /ESALQ/i.test(l) && /\b(SB-|CORN-|COFFEE-|COTTON-)/i.test(l));

                  if (isEsalq) {
                    // Join everything, then split into individual records at "12:00:00 AM" boundaries
                    const joined = rawLines.join(' ');
                    const recordTexts = joined.split(/(?=12:00:00\s*AM\b)/i).map(s => s.trim()).filter(Boolean);

                    for (const rec of recordTexts) {
                      // Extract ticker to determine culture
                      const tickerMatch = rec.match(/\b(SB|CORN|COFFEE|COTTON)-\S+/i);
                      if (!tickerMatch) continue;
                      const ticker = tickerMatch[1].toUpperCase();
                      const culture = ticker === 'SB' ? 'Soja' : ticker === 'CORN' ? 'Milho' : ticker === 'COFFEE' ? 'Café' : ticker === 'COTTON' ? 'Algodão' : ticker;

                      // Extract location: between "Grower" and the arrow/numbers section
                      // Pattern: ... Grower <LOCATION> Brazil [Export Price]? [⇩⇧]? <numbers>
                      const locMatch = rec.match(/Grower\s+(.+?)\s+(?:Brazil\s+(?:Export\s+Price\s+)?)?(?:[⇩⇧↑↓]\s*)?(\d[\d.,]*)\s+/i);
                      let marketPlace = '';
                      if (locMatch) {
                        marketPlace = locMatch[1]
                          .replace(/\bBrazil\b/gi, '')
                          .replace(/\bExport\s+Price\b/gi, '')
                          .replace(/\bRegion\b/gi, '')
                          .replace(/\b[A-Z]{2}\s+State\b/gi, '')
                          .trim()
                          .replace(/\s+/g, ' ');
                      }

                      // Known ESALQ location -> state/city mapping
                      const esalqLocationMap: Record<string, { state: string; city: string }> = {
                        'triangulo mineiro': { state: 'MG', city: 'Uberlândia' },
                        'sorriso': { state: 'MT', city: 'Sorriso' },
                        'sorocabana': { state: 'SP', city: 'Presidente Prudente' },
                        'rio verde': { state: 'GO', city: 'Rio Verde' },
                        'ponta grossa': { state: 'PR', city: 'Ponta Grossa' },
                        'passa fundo': { state: 'RS', city: 'Passo Fundo' },
                        'passo fundo': { state: 'RS', city: 'Passo Fundo' },
                        'oeste do parana': { state: 'PR', city: 'Cascavel' },
                        'norte do parana': { state: 'PR', city: 'Londrina' },
                        'mogiana': { state: 'SP', city: 'Ribeirão Preto' },
                        'ijui': { state: 'RS', city: 'Ijuí' },
                        'cascavel': { state: 'PR', city: 'Cascavel' },
                        'chapeco': { state: 'SC', city: 'Chapecó' },
                        'southwest of parana': { state: 'PR', city: 'Pato Branco' },
                        'barreiras ba': { state: 'BA', city: 'Barreiras' },
                        'dourados ms': { state: 'MS', city: 'Dourados' },
                        'ijui rs': { state: 'RS', city: 'Ijuí' },
                        'recife pe': { state: 'PE', city: 'Recife' },
                        'campo grande': { state: 'MS', city: 'Campo Grande' },
                        'rondonopolis': { state: 'MT', city: 'Rondonópolis' },
                        'primavera do leste': { state: 'MT', city: 'Primavera do Leste' },
                        'maringa': { state: 'PR', city: 'Maringá' },
                        'guarapuava': { state: 'PR', city: 'Guarapuava' },
                        'campo novo do parecis': { state: 'MT', city: 'Campo Novo do Parecis' },
                        'lucas do rio verde': { state: 'MT', city: 'Lucas do Rio Verde' },
                        'campo verde': { state: 'MT', city: 'Campo Verde' },
                        'alto araguaia': { state: 'MT', city: 'Alto Araguaia' },
                        'agua boa': { state: 'MT', city: 'Água Boa' },
                        'nova mutum': { state: 'MT', city: 'Nova Mutum' },
                      };

                      // Extract direction arrow
                      const dirArrow = rec.match(/[⇩⇧↑↓]/);
                      const direction = dirArrow ? (dirArrow[0] === '⇧' || dirArrow[0] === '↑' ? 'subiu' : 'caiu') : 'estavel';

                      // Extract numbers: price, var1, var2, refPrice after arrow or location
                      const numSection = rec.match(/(?:[⇩⇧↑↓]\s+)?(\d[\d.,]*)\s+([+-]?[\d.,]+)\s+([+-]?[\d.,]+)\s+([\d.,]+)\s+BRL\s+(\d{2}\/\d{2}\/\d{4})/i);
                      if (!numSection) continue;

                      const price = parseLocalNum(numSection[1]);
                      const variation = parseLocalNum(numSection[2]);
                      const dateStr = numSection[5]; // DD/MM/YYYY
                      const [dd, mm, yyyy] = dateStr.split('/');
                      const isoDate = `${yyyy}-${mm}-${dd}`;

                      // Derive state from explicit "XX State" pattern first
                      let state = '';
                      const stateMatch = rec.match(/\b([A-Z]{2})\s+State\b/i);
                      if (stateMatch) {
                        state = stateMatch[1].toUpperCase();
                      }

                      // Try mapping from known locations
                      const mpLow = marketPlace.toLowerCase().trim();
                      const mapped = esalqLocationMap[mpLow];
                      if (mapped) {
                        if (!state) state = mapped.state;
                        marketPlace = mapped.city;
                      } else {
                        // Try partial match: "Barreiras Ba" -> check substrings
                        for (const [key, val] of Object.entries(esalqLocationMap)) {
                          if (mpLow.includes(key) || key.includes(mpLow)) {
                            if (!state) state = val.state;
                            marketPlace = val.city;
                            break;
                          }
                        }
                      }

                      rows.push({
                        culture, price_type: 'FOB', state, market_place: marketPlace,
                        price_per_saca: price, variation_percent: variation,
                        direction, updated_at: isoDate, tax_rate: 0, month: '',
                      });
                    }
                  } else if (isHorizontal) {
                    // Original horizontal parsing (tab/semicolon/regex)
                    const lines = rawLines.filter(l => l);
                    for (const line of lines) {
                      let parts = line.split('\t').map(p => p.trim());
                      if (parts.length < 5) parts = line.split(';').map(p => p.trim());
                      if (parts.length < 5) {
                        const m = line.match(/^(\S+)\s+(\S+)\s+([A-Z]{2})\s+(.+?)\s+(\d[\d.,]*)\s+([+-]?[\d.,]+%?)\s*(\S+)\s+(\d{4}-\d{2}-\d{2})\s+([\d.,]+)\s*$/);
                        if (m) {
                          const dir = m[7].replace(/^%/, '');
                          parts = [m[1], m[2], m[3], m[4].trim(), m[5], m[6], dir, m[8], m[9]];
                        }
                      }
                      if (parts.length < 5) continue;
                      const first = parts[0].toLowerCase();
                      if (first === 'cultura' || first === '#' || first === 'culture') continue;
                      rows.push({
                        culture: parts[0] || '', price_type: parts[1] || '', state: parts[2] || '',
                        market_place: parts[3] || '', price_per_saca: parseLocalNum(parts[4]),
                        variation_percent: parts[5] ? parseLocalNum(parts[5]) : 0,
                        direction: parts[6] || '', updated_at: parts[7] || '',
                        tax_rate: parts[8] ? parseLocalNum(parts[8]) : 0, month: '',
                      });
                    }
                  } else {
                    // Vertical format: each field on its own line, records separated by field patterns
                    // Filter non-empty lines, skip known headers
                    const lines = rawLines.filter(l => l && !(/^(cultura|#|culture|ações|acoes|preço|variação)/i.test(l)));
                    // Skip header-like lines that contain multiple column names
                    const cleanLines = lines.filter(l => !(l.toLowerCase().includes('cultura') && l.toLowerCase().includes('estado')));
                    
                    // Detect record boundaries: culture names start a new record
                    const cultureNames = ['soja', 'milho', 'cafe', 'café', 'algodao', 'algodão', 'trigo', 'sorgo'];
                    const records: string[][] = [];
                    let current: string[] = [];
                    
                    for (const line of cleanLines) {
                      const low = line.toLowerCase();
                      if (cultureNames.includes(low) && current.length > 0) {
                        records.push(current);
                        current = [line];
                      } else {
                        current.push(line);
                      }
                    }
                    if (current.length > 0) records.push(current);
                    
                    for (const rec of records) {
                      if (rec.length < 5) continue;
                      // Map: [0]=Cultura [1]=Tipo [2]=Estado [3]=Praça [4]=Preço [5]=Variação [6]=Direção [7]=Data [8]=Alíquota
                      rows.push({
                        culture: rec[0] || '', price_type: rec[1] || '', state: rec[2] || '',
                        market_place: rec[3] || '', price_per_saca: parseLocalNum(rec[4]),
                        variation_percent: rec[5] ? parseLocalNum(rec[5]) : 0,
                        direction: rec[6] || '', updated_at: rec[7] || '',
                        tax_rate: rec[8] ? parseLocalNum(rec[8]) : 0, month: '',
                      });
                    }
                  }

                  if (rows.length === 0) { toast.error('Nenhum dado válido encontrado'); return; }
                  bulkInsertPrices(rows);
                  toast.success(`${rows.length} preços importados`);
                  setPricePasteText(''); setPricePasteMode(false);
                }}>Importar</Button>
              </div>
            )}
            {indicativePrices.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cultura</TableHead><TableHead>Tipo</TableHead><TableHead>Mês</TableHead><TableHead>Estado</TableHead><TableHead>Praça</TableHead>
                      <TableHead>R$/sc</TableHead><TableHead>Var.(%)</TableHead><TableHead>Dir.</TableHead><TableHead>Alíq.(%)</TableHead><TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {indicativePrices.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.culture}</TableCell><TableCell>{p.price_type}</TableCell><TableCell>{p.month}</TableCell><TableCell>{p.state}</TableCell><TableCell>{p.market_place}</TableCell>
                        <TableCell>R$ {Number(p.price_per_saca).toFixed(2)}</TableCell><TableCell>{p.variation_percent}%</TableCell><TableCell>{p.direction}</TableCell><TableCell>{p.tax_rate}%</TableCell>
                        <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePrice(p.id)}><Trash2 className="w-3 h-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">Nenhum preço indicativo. Importe via CSV/XLS ou cole texto.</p>}
          </div>
        </TabsContent>

        {/* Freight Tab */}
        <TabsContent value="fretes" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="font-semibold">Redutores de Frete</Label>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setFreightPasteMode(!freightPasteMode)}>
                  <ClipboardPaste className="w-3 h-3 mr-1" /> Colar
                </Button>
                {(freightList || []).length > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={removeDuplicateFreight}>Remover Duplicados</Button>
                    <Button variant="destructive" size="sm" onClick={deleteAllFreight}><Trash2 className="w-3 h-3 mr-1" /> Excluir Tudo</Button>
                  </>
                )}
              </div>
            </div>

            {freightPasteMode && (
              <div className="border border-dashed border-primary/30 rounded-md p-3 space-y-2 bg-primary/5">
                <p className="text-xs text-muted-foreground">Cole dados de frete nos formatos: vertical (De:/Para:/R$), ESALQ (Freight ... To ... KM) ou tab-separated (origem;destino;distância;custo_km;ajuste;total).</p>
                <Textarea rows={8} value={freightPasteText} onChange={e => setFreightPasteText(e.target.value)} placeholder="Cole aqui os dados de frete..." className="font-mono text-xs" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => parseAndImportFreight(freightPasteText)} disabled={!freightPasteText.trim()}>
                    <Upload className="w-3 h-3 mr-1" /> Importar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setFreightPasteMode(false); setFreightPasteText(''); }}>Cancelar</Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 items-end flex-wrap">
              <div className="space-y-1"><Label className="text-xs">Origem</Label><Input value={newFreight.origin} onChange={e => setNewFreight(p => ({ ...p, origin: e.target.value }))} className="w-36" /></div>
              <div className="space-y-1"><Label className="text-xs">Destino</Label><Input value={newFreight.destination} onChange={e => setNewFreight(p => ({ ...p, destination: e.target.value }))} className="w-36" /></div>
              <div className="space-y-1"><Label className="text-xs">Dist.(km)</Label><Input type="number" value={newFreight.distance_km} onChange={e => setNewFreight(p => ({ ...p, distance_km: Number(e.target.value) }))} className="w-28" /></div>
              <div className="space-y-1"><Label className="text-xs">R$/km</Label><Input type="number" step="0.01" value={newFreight.cost_per_km} onChange={e => setNewFreight(p => ({ ...p, cost_per_km: Number(e.target.value) }))} className="w-24" /></div>
              <div className="space-y-1"><Label className="text-xs">Ajuste</Label><Input type="number" step="0.1" value={newFreight.adjustment} onChange={e => setNewFreight(p => ({ ...p, adjustment: Number(e.target.value) }))} className="w-24" /></div>
              <Button onClick={addFreightReducer} disabled={upsertFreight.isPending}><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            {loadingFreight ? <p className="text-sm text-muted-foreground">Carregando...</p> : (freightList || []).length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Origem</TableHead><TableHead>Destino</TableHead><TableHead>Dist.</TableHead><TableHead>R$/km</TableHead><TableHead>Ajuste</TableHead><TableHead>Total</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(freightList || []).map((fr: any) => (
                    <TableRow key={fr.id}><TableCell>{fr.origin}</TableCell><TableCell>{fr.destination}</TableCell><TableCell>{fr.distance_km}km</TableCell><TableCell>R${Number(fr.cost_per_km).toFixed(2)}</TableCell><TableCell>R${Number(fr.adjustment || 0).toFixed(2)}</TableCell><TableCell className="font-medium">R${Number(fr.total_reducer).toFixed(2)}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteFreight.mutate(fr.id)}><Trash2 className="w-3 h-3" /></Button></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">Nenhum redutor de frete.</p>}
            <div className="text-xs text-muted-foreground">{(freightList || []).length} registro(s)</div>
          </div>
        </TabsContent>

        {/* API Configuration Tab */}
        <TabsContent value="consulta_api" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-4">
            <Label className="font-semibold flex items-center gap-2"><Wifi className="w-4 h-4" /> Consulta API - {commodityLabelByValue.get(selectedCommodity) || selectedCommodity}</Label>
            <p className="text-xs text-muted-foreground">Configure os parâmetros para consulta de preços em tempo real via APIs públicas (Yahoo Finance, B3, etc).</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fonte da API</Label>
                <Select value={apiConfig.api_source} onValueChange={v => setApiConfig(prev => ({ ...prev, api_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yahoo">Yahoo Finance</SelectItem>
                    <SelectItem value="b3">B3 (via Yahoo)</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ticker Yahoo</Label>
                <Input value={apiConfig.ticker} onChange={e => setApiConfig(prev => ({ ...prev, ticker: e.target.value }))} placeholder="Ex: ZS=F, ZC=F, KC=F" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ticker B3</Label>
                <Input value={apiConfig.ticker_b3} onChange={e => setApiConfig(prev => ({ ...prev, ticker_b3: e.target.value }))} placeholder="Ex: CCM, SJC, ICF" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mercado</Label>
                <Input value={apiConfig.market} onChange={e => setApiConfig(prev => ({ ...prev, market: e.target.value }))} placeholder="Ex: CBOT, ICE, B3" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade de Moeda</Label>
                <Select value={apiConfig.currency_unit} onValueChange={v => setApiConfig(prev => ({ ...prev, currency_unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USc">USc (Centavos USD)</SelectItem>
                    <SelectItem value="USD">USD (Dólares)</SelectItem>
                    <SelectItem value="BRL">BRL (Reais)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade de Medida</Label>
                <Input value={apiConfig.unit_measure} onChange={e => setApiConfig(prev => ({ ...prev, unit_measure: e.target.value }))} placeholder="Ex: bushel, libra, saca" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bushels/Ton (fator conversão)</Label>
                <Input type="number" step="0.001" value={apiConfig.bushels_per_ton} onChange={e => setApiConfig(prev => ({ ...prev, bushels_per_ton: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Peso Saca (kg)</Label>
                <Input type="number" value={apiConfig.peso_saca_kg} onChange={e => setApiConfig(prev => ({ ...prev, peso_saca_kg: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Reference defaults */}
            <div className="bg-muted/50 rounded p-3 space-y-1">
              <Label className="text-xs font-medium">Referência de Tickers</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div><strong>Soja:</strong> ZS=F (36.744 bu/ton)</div>
                <div><strong>Milho:</strong> ZC=F (39.368 bu/ton)</div>
                <div><strong>Café:</strong> KC=F (132.277 lb/ton)</div>
                <div><strong>Algodão:</strong> CT=F (22.046 lb/ton)</div>
                <div><strong>Câmbio:</strong> USDBRL=X</div>
                <div><strong>Milho B3:</strong> CCM=F</div>
                <div><strong>Soja B3:</strong> SJC=F</div>
                <div><strong>Café B3:</strong> ICF=F</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={async () => {
                if (!campaignId) return;
                const basisObj: any = {};
                basisPorts.forEach(bp => { basisObj[bp.port] = bp.basis; });
                try {
                  await upsertPricing.mutateAsync({ ...pricingForm, campaign_id: campaignId, commodity: selectedCommodity, basis_by_port: basisObj, ...apiConfig });
                  toast.success('Configuração de API salva');
                } catch (e: any) { toast.error(e.message); }
              }} disabled={upsertPricing.isPending}>
                <Save className="w-4 h-4 mr-1" /> Salvar Configuração
              </Button>

              <Button variant="outline" disabled={!apiConfig.ticker || testingApi} onClick={async () => {
                setTestingApi(true);
                setApiTestResult(null);
                try {
                  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'iezoyqbrcfebdzwjxfbd';
                  const session = await supabase.auth.getSession();
                  const token = session.data.session?.access_token;
                  const response = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/realtime-pricing/fetch-price`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                      },
                      body: JSON.stringify({ ticker: apiConfig.ticker, currency_unit: apiConfig.currency_unit }),
                    }
                  );
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setApiTestResult(data);
                  toast.success(`Preço obtido: ${data.price_usd} USD`);
                } catch (e: any) {
                  toast.error('Erro na consulta: ' + e.message);
                  setApiTestResult({ error: e.message });
                } finally {
                  setTestingApi(false);
                }
              }}>
                {testingApi ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
                Testar Consulta
              </Button>
            </div>

            {apiTestResult && (
              <div className={`rounded p-3 text-xs font-mono ${apiTestResult.error ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-foreground'}`}>
                <pre className="whitespace-pre-wrap">{JSON.stringify(apiTestResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
