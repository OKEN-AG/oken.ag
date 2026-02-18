import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useCampaign, useCreateCampaign, useUpdateCampaign } from '@/hooks/useCampaigns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAllMunicipios } from '@/data/municipios';
import GeneralTab, { type ClientRow } from '@/components/campaign/GeneralTab';
import FinancialTab, { type PaymentMethodRow, type DueDateRow } from '@/components/campaign/FinancialTab';
import EligibilityTab, { type SegmentRow } from '@/components/campaign/EligibilityTab';
import ProductsTab from '@/components/campaign/ProductsTab';
import CombosTab from '@/components/campaign/CombosTab';
import CommoditiesTab from '@/components/campaign/CommoditiesTab';

const JOURNEY_MODULES = [
  { value: 'adesao', label: 'Termo de Adesão' },
  { value: 'simulacao', label: 'Simulação' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'barter', label: 'Barter' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'pedido', label: 'Pedido' },
  { value: 'formalizacao', label: 'Formalização' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'garantias', label: 'Garantias' },
];

type FormData = {
  name: string;
  season: string;
  currency: string;
  target: 'produtor' | 'distribuidor' | 'venda_direta';
  active: boolean;
  commodities: string[];
  exchange_rate_products: number;
  exchange_rate_barter: number;
  interest_rate: number;
  max_discount_internal: number;
  max_discount_reseller: number;
  active_modules: string[];
  price_list_format: string;
};

const emptyForm: FormData = {
  name: '',
  season: '',
  currency: 'USD',
  target: 'produtor',
  active: true,
  commodities: [],
  exchange_rate_products: 5.45,
  exchange_rate_barter: 5.40,
  interest_rate: 1.5,
  max_discount_internal: 8,
  max_discount_reseller: 5,
  active_modules: [],
  price_list_format: 'usd_vista',
};

export default function CampaignFormPage() {
  const { id } = useParams();
  const isNew = id === 'nova';
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: existing } = useCampaign(isNew ? undefined : id);
  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();

  const [form, setForm] = useState<FormData>(emptyForm);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [dueDates, setDueDates] = useState<DueDateRow[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        season: existing.season,
        currency: (existing as any).currency || 'USD',
        target: existing.target,
        active: existing.active,
        commodities: (existing as any).commodities || [],
        exchange_rate_products: Number(existing.exchange_rate_products),
        exchange_rate_barter: Number(existing.exchange_rate_barter),
        interest_rate: Number(existing.interest_rate),
        max_discount_internal: Number(existing.max_discount_internal),
        max_discount_reseller: Number(existing.max_discount_reseller),
        active_modules: existing.active_modules || [],
        price_list_format: existing.price_list_format,
      });
      setSelectedCities(existing.eligible_cities || []);
      loadSubData(existing.id);
    }
  }, [existing]);

  const loadSubData = async (campaignId: string) => {
    const [clientsRes, methodsRes, segmentsRes, datesRes] = await Promise.all([
      (supabase as any).from('campaign_clients').select('*').eq('campaign_id', campaignId),
      (supabase as any).from('campaign_payment_methods').select('*').eq('campaign_id', campaignId),
      (supabase as any).from('campaign_segments').select('*').eq('campaign_id', campaignId),
      (supabase as any).from('campaign_due_dates').select('*').eq('campaign_id', campaignId),
    ]);
    if (clientsRes.data) setClients(clientsRes.data.map((c: any) => ({ document: c.document, name: c.name })));
    if (methodsRes.data) setPaymentMethods(methodsRes.data.map((m: any) => ({
      method_name: m.method_name, markup_percent: Number(m.markup_percent),
      active: m.active, annual_interest_rate: Number(m.annual_interest_rate),
    })));
    if (segmentsRes.data) setSegments(segmentsRes.data.map((s: any) => ({
      segment_name: s.segment_name, active: s.active,
      price_adjustment_percent: Number(s.price_adjustment_percent),
    })));
    if (datesRes.data) setDueDates(datesRes.data.map((d: any) => ({
      region_type: d.region_type, region_value: d.region_value, due_date: d.due_date,
    })));
  };

  const onFieldChange = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name || !form.season) {
      toast.error('Nome e Safra são obrigatórios');
      return;
    }

    try {
      // Derive states and mesos from selected cities
      const allMunicipios = getAllMunicipios();
      const selectedMunicipios = allMunicipios.filter(m => selectedCities.includes(m.ibge));
      const states = [...new Set(selectedMunicipios.map(m => m.uf))];
      const mesos = [...new Set(selectedMunicipios.map(m => m.mesoName))];

      const priceFormat = form.currency === 'BRL' ? 'brl_vista' : 'usd_vista';

      const campaignData: any = {
        name: form.name,
        season: form.season,
        target: form.target,
        active: form.active,
        exchange_rate_products: form.exchange_rate_products,
        exchange_rate_barter: form.exchange_rate_barter,
        interest_rate: form.interest_rate,
        max_discount_internal: form.max_discount_internal,
        max_discount_reseller: form.max_discount_reseller,
        active_modules: form.active_modules,
        eligible_cities: selectedCities,
        eligible_states: states,
        eligible_mesoregions: mesos,
        price_list_format: priceFormat,
        currency: form.currency,
        commodities: form.commodities,
      };

      let campaignId = id;

      if (isNew) {
        const result = await createMutation.mutateAsync({
          ...campaignData,
          created_by: user?.id || null,
        });
        campaignId = result.id;
        toast.success('Campanha criada!');
      } else {
        await updateMutation.mutateAsync({ id: id!, ...campaignData });
        toast.success('Campanha atualizada!');
      }

      // Save sub-tables: delete all + re-insert
      await Promise.all([
        (supabase as any).from('campaign_clients').delete().eq('campaign_id', campaignId!),
        (supabase as any).from('campaign_payment_methods').delete().eq('campaign_id', campaignId!),
        (supabase as any).from('campaign_segments').delete().eq('campaign_id', campaignId!),
        (supabase as any).from('campaign_due_dates').delete().eq('campaign_id', campaignId!),
      ]);

      const inserts = [];
      if (clients.length > 0) inserts.push(
        (supabase as any).from('campaign_clients').insert(clients.map(c => ({ ...c, campaign_id: campaignId! })))
      );
      if (paymentMethods.length > 0) inserts.push(
        (supabase as any).from('campaign_payment_methods').insert(paymentMethods.map(m => ({ ...m, campaign_id: campaignId! })))
      );
      if (segments.length > 0) inserts.push(
        (supabase as any).from('campaign_segments').insert(segments.map(s => ({ ...s, campaign_id: campaignId! })))
      );
      if (dueDates.length > 0) inserts.push(
        (supabase as any).from('campaign_due_dates').insert(dueDates.map(d => ({ ...d, campaign_id: campaignId! })))
      );
      await Promise.all(inserts);

      navigate('/admin/campanhas');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/campanhas')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{isNew ? 'Nova Campanha' : 'Editar Campanha'}</h1>
          <p className="text-sm text-muted-foreground">Preencha os dados abaixo</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="bg-muted border border-border flex-wrap h-auto">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="elegibilidade">Elegibilidade</TabsTrigger>
          <TabsTrigger value="modulos">Módulos</TabsTrigger>
          <TabsTrigger value="produtos" disabled={isNew}>Produtos</TabsTrigger>
          <TabsTrigger value="combos" disabled={isNew}>Combos</TabsTrigger>
          <TabsTrigger value="commodities" disabled={isNew}>Commodities</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-4">
          <GeneralTab form={form} onFieldChange={onFieldChange} clients={clients} onClientsChange={setClients} />
        </TabsContent>

        <TabsContent value="financeiro" className="mt-4">
          <FinancialTab
            form={form}
            onFieldChange={onFieldChange}
            paymentMethods={paymentMethods}
            onPaymentMethodsChange={setPaymentMethods}
            dueDates={dueDates}
            onDueDatesChange={setDueDates}
          />
        </TabsContent>

        <TabsContent value="elegibilidade" className="mt-4">
          <EligibilityTab
            selectedCities={selectedCities}
            onSelectedCitiesChange={setSelectedCities}
            segments={segments}
            onSegmentsChange={setSegments}
          />
        </TabsContent>

        <TabsContent value="modulos" className="mt-4">
          <div className="border border-border rounded-md p-4 space-y-3">
            <Label className="text-base font-semibold">Módulos Ativos na Jornada</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {JOURNEY_MODULES.map(mod => (
                <label key={mod.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.active_modules.includes(mod.value)}
                    onCheckedChange={checked => {
                      onFieldChange('active_modules', checked
                        ? [...form.active_modules, mod.value]
                        : form.active_modules.filter(m => m !== mod.value));
                    }}
                  />
                  {mod.label}
                </label>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="produtos" className="mt-4">
          <ProductsTab campaignId={isNew ? undefined : id} />
        </TabsContent>

        <TabsContent value="combos" className="mt-4">
          <CombosTab campaignId={isNew ? undefined : id} />
        </TabsContent>

        <TabsContent value="commodities" className="mt-4">
          <CommoditiesTab campaignId={isNew ? undefined : id} campaignCommodities={form.commodities} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
