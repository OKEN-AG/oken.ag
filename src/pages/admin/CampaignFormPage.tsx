import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useCampaign, useCreateCampaign, useUpdateCampaign } from '@/hooks/useCampaigns';
import { useChannelMargins, useSaveChannelMargins } from '@/hooks/useChannelMargins';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { TablesInsert } from '@/integrations/supabase/types';

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

const PRICE_FORMATS = [
  { value: 'brl_vista', label: 'BRL à Vista' },
  { value: 'brl_prazo', label: 'BRL a Prazo' },
  { value: 'usd_vista', label: 'USD à Vista' },
  { value: 'usd_prazo', label: 'USD a Prazo' },
  { value: 'brl_vista_com_margem', label: 'BRL à Vista c/ Margem' },
  { value: 'brl_prazo_com_margem', label: 'BRL a Prazo c/ Margem' },
  { value: 'usd_vista_com_margem', label: 'USD à Vista c/ Margem' },
  { value: 'usd_prazo_com_margem', label: 'USD a Prazo c/ Margem' },
];

const TARGETS = [
  { value: 'produtor', label: 'Produtor' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'venda_direta', label: 'Venda Direta' },
];

type FormData = {
  name: string;
  season: string;
  target: 'produtor' | 'distribuidor' | 'venda_direta';
  price_list_format: string;
  exchange_rate_products: number;
  exchange_rate_barter: number;
  interest_rate: number;
  max_discount_internal: number;
  max_discount_reseller: number;
  active: boolean;
  active_modules: string[];
  eligible_states: string[];
  eligible_mesoregions: string[];
  eligible_cities: string[];
  eligible_distributor_segments: ('direto' | 'distribuidor' | 'cooperativa')[];
  eligible_client_segments: string[];
  available_due_dates: string[];
};

type MarginsData = {
  direto: number;
  distribuidor: number;
  cooperativa: number;
};

const emptyForm: FormData = {
  name: '',
  season: '',
  target: 'produtor',
  price_list_format: 'usd_vista',
  exchange_rate_products: 5.45,
  exchange_rate_barter: 5.40,
  interest_rate: 1.5,
  max_discount_internal: 8,
  max_discount_reseller: 5,
  active: true,
  active_modules: [],
  eligible_states: [],
  eligible_mesoregions: [],
  eligible_cities: [],
  eligible_distributor_segments: [],
  eligible_client_segments: [],
  available_due_dates: [],
};

export default function CampaignFormPage() {
  const { id } = useParams();
  const isNew = id === 'nova';
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: existing } = useCampaign(isNew ? undefined : id);
  const { data: existingMargins } = useChannelMargins(isNew ? undefined : id);

  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();
  const saveMarginsMutation = useSaveChannelMargins();

  const [form, setForm] = useState<FormData>(emptyForm);
  const [margins, setMargins] = useState<MarginsData>({ direto: 0, distribuidor: 12, cooperativa: 10 });
  const [stateInput, setStateInput] = useState('');
  const [mesoInput, setMesoInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [segmentInput, setSegmentInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        season: existing.season,
        target: existing.target,
        price_list_format: existing.price_list_format,
        exchange_rate_products: Number(existing.exchange_rate_products),
        exchange_rate_barter: Number(existing.exchange_rate_barter),
        interest_rate: Number(existing.interest_rate),
        max_discount_internal: Number(existing.max_discount_internal),
        max_discount_reseller: Number(existing.max_discount_reseller),
        active: existing.active,
        active_modules: existing.active_modules || [],
        eligible_states: existing.eligible_states || [],
        eligible_mesoregions: existing.eligible_mesoregions || [],
        eligible_cities: existing.eligible_cities || [],
        eligible_distributor_segments: (existing.eligible_distributor_segments || []) as ('direto' | 'distribuidor' | 'cooperativa')[],
        eligible_client_segments: existing.eligible_client_segments || [],
        available_due_dates: existing.available_due_dates || [],
      });
    }
  }, [existing]);

  useEffect(() => {
    if (existingMargins) {
      const m: MarginsData = { direto: 0, distribuidor: 0, cooperativa: 0 };
      existingMargins.forEach(em => {
        m[em.segment] = Number(em.margin_percent);
      });
      setMargins(m);
    }
  }, [existingMargins]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const addToArray = (key: keyof FormData, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const arr = form[key] as string[];
    if (!arr.includes(value.trim())) {
      set(key, [...arr, value.trim()] as any);
    }
    setter('');
  };

  const removeFromArray = (key: keyof FormData, value: string) => {
    set(key, (form[key] as string[]).filter(v => v !== value) as any);
  };

  const handleSave = async () => {
    if (!form.name || !form.season) {
      toast.error('Nome e Safra são obrigatórios');
      return;
    }

    try {
      let campaignId = id;

      if (isNew) {
        const insert: TablesInsert<'campaigns'> = {
          ...form,
          price_list_format: form.price_list_format as any,
          created_by: user?.id || null,
        };
        const result = await createMutation.mutateAsync(insert);
        campaignId = result.id;
        toast.success('Campanha criada com sucesso!');
      } else {
        await updateMutation.mutateAsync({ id: id!, ...form, price_list_format: form.price_list_format as any });
        toast.success('Campanha atualizada!');
      }

      // Save margins
      await saveMarginsMutation.mutateAsync({
        campaignId: campaignId!,
        margins: [
          { segment: 'direto', margin_percent: margins.direto },
          { segment: 'distribuidor', margin_percent: margins.distribuidor },
          { segment: 'cooperativa', margin_percent: margins.cooperativa },
        ],
      });

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
          <TabsTrigger value="margens">Margens</TabsTrigger>
          <TabsTrigger value="modulos">Módulos</TabsTrigger>
        </TabsList>

        {/* === GERAL === */}
        <TabsContent value="geral" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Campanha</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Safra 2025/26 Barter Soja" />
            </div>
            <div className="space-y-2">
              <Label>Safra</Label>
              <Input value={form.season} onChange={e => set('season', e.target.value)} placeholder="Ex: 2025/26" />
            </div>
            <div className="space-y-2">
              <Label>Público Alvo</Label>
              <Select value={form.target} onValueChange={v => set('target', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGETS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Formato Lista de Preços</Label>
              <Select value={form.price_list_format} onValueChange={v => set('price_list_format', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICE_FORMATS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={v => set('active', v)} />
              <Label>Campanha Ativa</Label>
            </div>
          </div>
        </TabsContent>

        {/* === FINANCEIRO === */}
        <TabsContent value="financeiro" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Câmbio Produtos (R$/USD)</Label>
              <Input type="number" step="0.01" value={form.exchange_rate_products} onChange={e => set('exchange_rate_products', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Câmbio Barter (R$/USD)</Label>
              <Input type="number" step="0.01" value={form.exchange_rate_barter} onChange={e => set('exchange_rate_barter', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Juros (% a.m.)</Label>
              <Input type="number" step="0.01" value={form.interest_rate} onChange={e => set('interest_rate', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Desc. Máx. Interno (%)</Label>
              <Input type="number" step="0.1" value={form.max_discount_internal} onChange={e => set('max_discount_internal', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Desc. Máx. Revenda (%)</Label>
              <Input type="number" step="0.1" value={form.max_discount_reseller} onChange={e => set('max_discount_reseller', Number(e.target.value))} />
            </div>
          </div>

          {/* Due dates */}
          <div className="space-y-2">
            <Label>Datas de Vencimento</Label>
            <div className="flex gap-2">
              <Input type="date" value={dueDateInput} onChange={e => setDueDateInput(e.target.value)} />
              <Button variant="outline" onClick={() => addToArray('available_due_dates', dueDateInput, setDueDateInput)}>Adicionar</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.available_due_dates.map(d => (
                <Badge key={d} variant="secondary" className="cursor-pointer" onClick={() => removeFromArray('available_due_dates', d)}>
                  {new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')} ✕
                </Badge>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* === ELEGIBILIDADE === */}
        <TabsContent value="elegibilidade" className="mt-4 space-y-4">
          <TagField label="Estados" value={stateInput} onChange={setStateInput} tags={form.eligible_states} onAdd={() => addToArray('eligible_states', stateInput, setStateInput)} onRemove={v => removeFromArray('eligible_states', v)} placeholder="Ex: SP, MT, PR" />
          <TagField label="Mesorregiões" value={mesoInput} onChange={setMesoInput} tags={form.eligible_mesoregions} onAdd={() => addToArray('eligible_mesoregions', mesoInput, setMesoInput)} onRemove={v => removeFromArray('eligible_mesoregions', v)} placeholder="Ex: Norte Central" />
          <TagField label="Municípios" value={cityInput} onChange={setCityInput} tags={form.eligible_cities} onAdd={() => addToArray('eligible_cities', cityInput, setCityInput)} onRemove={v => removeFromArray('eligible_cities', v)} placeholder="Ex: Londrina" />

          <div className="space-y-2">
            <Label>Segmentos de Distribuidor</Label>
            <div className="flex gap-4">
              {(['direto', 'distribuidor', 'cooperativa'] as const).map(seg => (
                <label key={seg} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={form.eligible_distributor_segments.includes(seg)}
                    onCheckedChange={checked => {
                      set('eligible_distributor_segments', checked
                        ? [...form.eligible_distributor_segments, seg]
                        : form.eligible_distributor_segments.filter(s => s !== seg));
                    }}
                  />
                  {seg}
                </label>
              ))}
            </div>
          </div>

          <TagField label="Segmentos de Cliente" value={segmentInput} onChange={setSegmentInput} tags={form.eligible_client_segments} onAdd={() => addToArray('eligible_client_segments', segmentInput, setSegmentInput)} onRemove={v => removeFromArray('eligible_client_segments', v)} placeholder="Ex: grande, medio, pequeno" />
        </TabsContent>

        {/* === MARGENS === */}
        <TabsContent value="margens" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['direto', 'distribuidor', 'cooperativa'] as const).map(seg => (
              <div key={seg} className="glass-card p-4 space-y-2">
                <Label className="capitalize">{seg}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={margins[seg]}
                  onChange={e => setMargins(prev => ({ ...prev, [seg]: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">% sobre preço base</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* === MÓDULOS === */}
        <TabsContent value="modulos" className="mt-4">
          <div className="glass-card p-4 space-y-3">
            <Label>Módulos Ativos na Jornada</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {JOURNEY_MODULES.map(mod => (
                <label key={mod.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.active_modules.includes(mod.value)}
                    onCheckedChange={checked => {
                      set('active_modules', checked
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
      </Tabs>
    </div>
  );
}

function TagField({ label, value, onChange, tags, onAdd, onRemove, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  tags: string[]; onAdd: () => void; onRemove: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAdd())}
        />
        <Button variant="outline" onClick={onAdd}>Adicionar</Button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {tags.map(t => (
          <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => onRemove(t)}>
            {t} ✕
          </Badge>
        ))}
      </div>
    </div>
  );
}
