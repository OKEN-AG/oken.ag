import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getAllMunicipios, getUFs, getMesosByUF, getMunicipiosByMeso } from '@/data/municipios';
import { NumericInput } from '@/components/NumericInput';
import { formatPtBrCurrency } from '@/lib/ptbr';

export type SegmentRow = {
  segment_name: string;
  active: boolean;
  price_adjustment_percent: number;
};

export type ChannelMarginRow = {
  segment: 'direto' | 'distribuidor' | 'cooperativa';
  margin_percent: number;
};

export type ChannelTypeRow = {
  channel_type_name: string;
  model: string; // B2B, B2C, B2B2C or custom
  active: boolean;
  price_adjustment_percent: number;
};

const MODEL_OPTIONS = [
  { value: 'B2C', label: 'B2C', target: 'venda_direta_consumidor' },
  { value: 'B2B', label: 'B2B', target: 'venda_canal_distribuicao' },
  { value: 'B2B2C', label: 'B2B2C', target: 'venda_indireta_consumidor' },
];

const CLIENT_TYPES = [
  { value: 'pf', label: 'Pessoa Física (PF)' },
  { value: 'pj', label: 'Pessoa Jurídica (PJ)' },
];

type Props = {
  selectedCities: string[];
  onSelectedCitiesChange: (cities: string[]) => void;
  segments: SegmentRow[];
  onSegmentsChange: (segments: SegmentRow[]) => void;
  channelMargins: ChannelMarginRow[];
  onChannelMarginsChange: (margins: ChannelMarginRow[]) => void;
  channelTypes: ChannelTypeRow[];
  onChannelTypesChange: (types: ChannelTypeRow[]) => void;
  campaignTarget: string;
  clientType: string[];
  onClientTypeChange: (types: string[]) => void;
  minOrderAmount: number;
  onMinOrderAmountChange: (v: number) => void;
  currency: string;
};

export default function EligibilityTab({
  selectedCities, onSelectedCitiesChange,
  segments, onSegmentsChange,
  channelMargins, onChannelMarginsChange,
  channelTypes, onChannelTypesChange,
  campaignTarget,
  clientType, onClientTypeChange,
  minOrderAmount, onMinOrderAmountChange,
  currency,
}: Props) {
  const [expandedUFs, setExpandedUFs] = useState<Set<string>>(new Set());
  const [expandedMesos, setExpandedMesos] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [newSegment, setNewSegment] = useState('');
  const [newChannelTypeName, setNewChannelTypeName] = useState('');

  const ufs = useMemo(() => getUFs(), []);
  const allMunicipios = useMemo(() => getAllMunicipios(), []);

  const toggleExpand = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  // === City selection helpers ===
  const isUFFullySelected = (uf: string) => {
    const cities = allMunicipios.filter(m => m.uf === uf);
    return cities.length > 0 && cities.every(c => selectedCities.includes(c.ibge));
  };
  const isUFPartiallySelected = (uf: string) => {
    const cities = allMunicipios.filter(m => m.uf === uf);
    const count = cities.filter(c => selectedCities.includes(c.ibge)).length;
    return count > 0 && count < cities.length;
  };
  const toggleUFSelection = (uf: string) => {
    const ibges = allMunicipios.filter(m => m.uf === uf).map(c => c.ibge);
    if (isUFFullySelected(uf)) {
      onSelectedCitiesChange(selectedCities.filter(c => !ibges.includes(c)));
    } else {
      onSelectedCitiesChange([...new Set([...selectedCities, ...ibges])]);
    }
  };
  const isMesoFullySelected = (mesoCode: string) => {
    const cities = getMunicipiosByMeso(mesoCode);
    return cities.length > 0 && cities.every(c => selectedCities.includes(c.ibge));
  };
  const isMesoPartiallySelected = (mesoCode: string) => {
    const cities = getMunicipiosByMeso(mesoCode);
    const count = cities.filter(c => selectedCities.includes(c.ibge)).length;
    return count > 0 && count < cities.length;
  };
  const toggleMesoSelection = (mesoCode: string) => {
    const ibges = getMunicipiosByMeso(mesoCode).map(c => c.ibge);
    if (isMesoFullySelected(mesoCode)) {
      onSelectedCitiesChange(selectedCities.filter(c => !ibges.includes(c)));
    } else {
      onSelectedCitiesChange([...new Set([...selectedCities, ...ibges])]);
    }
  };
  const toggleCity = (ibge: string) => {
    if (selectedCities.includes(ibge)) {
      onSelectedCitiesChange(selectedCities.filter(c => c !== ibge));
    } else {
      onSelectedCitiesChange([...selectedCities, ibge]);
    }
  };

  const search = searchTerm.toLowerCase();
  const filteredUFs = search
    ? ufs.filter(uf =>
        uf.toLowerCase().includes(search) ||
        allMunicipios.filter(m => m.uf === uf).some(m =>
          m.name.toLowerCase().includes(search) || m.mesoName.toLowerCase().includes(search)
        )
      )
    : ufs;

  // === Segment helpers ===
  const addSegment = () => {
    if (!newSegment.trim()) return;
    onSegmentsChange([...segments, { segment_name: newSegment.trim(), active: true, price_adjustment_percent: 0 }]);
    setNewSegment('');
  };
  const updateSegment = (idx: number, field: keyof SegmentRow, value: any) => {
    const updated = [...segments];
    updated[idx] = { ...updated[idx], [field]: value };
    onSegmentsChange(updated);
  };

  const toggleClientType = (val: string) => {
    onClientTypeChange(
      clientType.includes(val) ? clientType.filter(v => v !== val) : [...clientType, val]
    );
  };

  // === Channel Type helpers ===
  const canActivateModel = (model: string) => {
    const modelDef = MODEL_OPTIONS.find(m => m.value === model);
    if (!modelDef) return true; // custom types can always be activated
    return modelDef.target === campaignTarget;
  };

  const addChannelTypeFromModel = (model: string) => {
    const modelDef = MODEL_OPTIONS.find(m => m.value === model);
    const name = modelDef ? modelDef.label : model;
    onChannelTypesChange([...channelTypes, {
      channel_type_name: name,
      model,
      active: canActivateModel(model),
      price_adjustment_percent: 0,
    }]);
  };

  const addCustomChannelType = () => {
    if (!newChannelTypeName.trim()) return;
    onChannelTypesChange([...channelTypes, {
      channel_type_name: newChannelTypeName.trim(),
      model: '',
      active: true,
      price_adjustment_percent: 0,
    }]);
    setNewChannelTypeName('');
  };

  const updateChannelType = (idx: number, field: keyof ChannelTypeRow, value: any) => {
    const updated = [...channelTypes];
    updated[idx] = { ...updated[idx], [field]: value };
    onChannelTypesChange(updated);
  };

  const usedModels = new Set(channelTypes.map(ct => ct.model).filter(Boolean));
  const availableModels = MODEL_OPTIONS.filter(m => !usedModels.has(m.value));

  // === Legacy channel margin helpers (kept for backward compat) ===
  const CHANNEL_SEGMENTS: { value: 'direto' | 'distribuidor' | 'cooperativa'; label: string }[] = [
    { value: 'direto', label: 'Direto' },
    { value: 'distribuidor', label: 'Distribuidor' },
    { value: 'cooperativa', label: 'Cooperativa' },
  ];
  const addChannelMargin = (seg: 'direto' | 'distribuidor' | 'cooperativa') => {
    if (channelMargins.some(m => m.segment === seg)) return;
    onChannelMarginsChange([...channelMargins, { segment: seg, margin_percent: 0 }]);
  };
  const updateChannelMargin = (idx: number, value: number) => {
    const updated = [...channelMargins];
    updated[idx] = { ...updated[idx], margin_percent: value };
    onChannelMarginsChange(updated);
  };
  const removeChannelMargin = (idx: number) => {
    onChannelMarginsChange(channelMargins.filter((_, i) => i !== idx));
  };
  const availableChannels = CHANNEL_SEGMENTS.filter(cs => !channelMargins.some(m => m.segment === cs.value));

  return (
    <div className="space-y-6">
      {/* Client Type & Min Order */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-base font-semibold">Tipo de Cliente</Label>
          <div className="flex gap-4">
            {CLIENT_TYPES.map(ct => (
              <label key={ct.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={clientType.includes(ct.value)} onCheckedChange={() => toggleClientType(ct.value)} />
                {ct.label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-base font-semibold">Montante Mínimo de Pedido ({currency})</Label>
          <NumericInput value={minOrderAmount} onChange={onMinOrderAmountChange} decimals={2} min={0} className="max-w-xs" />
          <p className="text-xs text-muted-foreground">Valor formatado: {formatPtBrCurrency(minOrderAmount, currency === 'USD' ? 'USD' : 'BRL')}</p>
        </div>
      </div>

      {/* Channel Types (B2B / B2C / B2B2C + custom) */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Tipo de Canal de Acesso - GTM</Label>
        <p className="text-xs text-muted-foreground">
          Defina os tipos de canal. Apenas os modelos correspondentes ao Público Alvo da campanha podem ser ativados.
        </p>
        <div className="flex gap-2 flex-wrap">
          {availableModels.length > 0 && (
            <Select onValueChange={addChannelTypeFromModel}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Adicionar modelo..." /></SelectTrigger>
              <SelectContent>
                {availableModels.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-1">
            <Input
              placeholder="Tipo livre..."
              value={newChannelTypeName}
              onChange={e => setNewChannelTypeName(e.target.value)}
              className="w-[180px]"
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomChannelType())}
            />
            <Button variant="outline" size="icon" onClick={addCustomChannelType}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
        {channelTypes.length > 0 ? (
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de Canal</TableHead>
                  <TableHead className="w-28">Modelo</TableHead>
                  <TableHead className="w-20 text-center">Ativo</TableHead>
                  <TableHead className="w-44">Ajuste Lista (%)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelTypes.map((ct, i) => {
                  const modelMatch = MODEL_OPTIONS.find(m => m.value === ct.model);
                  const canActivate = canActivateModel(ct.model);
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={ct.channel_type_name}
                          onChange={e => updateChannelType(i, 'channel_type_name', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={modelMatch ? 'default' : 'outline'}>
                          {ct.model || 'Livre'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={ct.active}
                          disabled={!!ct.model && !canActivate}
                          onCheckedChange={v => updateChannelType(i, 'active', v)}
                        />
                        {!!ct.model && !canActivate && (
                          <p className="text-[10px] text-destructive mt-0.5">Público alvo incompatível</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <NumericInput
                          value={ct.price_adjustment_percent}
                          onChange={v => updateChannelType(i, 'price_adjustment_percent', v)}
                          decimals={2} min={-100} max={100} className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onChannelTypesChange(channelTypes.filter((_, j) => j !== i))}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
            Nenhum tipo de canal configurado. Adicione modelos (B2B, B2C, B2B2C) ou tipos livres.
          </p>
        )}
      </div>

      {/* Municipality Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Municípios Elegíveis</Label>
          <div className="flex gap-2 items-center">
            <Badge variant="secondary">{selectedCities.length} selecionados</Badge>
            {selectedCities.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onSelectedCitiesChange([])}>Limpar</Button>
            )}
          </div>
        </div>
        <Input placeholder="Buscar UF, mesorregião ou município..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <div className="max-h-[400px] overflow-y-auto border border-border rounded-md p-2 space-y-0.5">
          {filteredUFs.map(uf => {
            const ufCityCount = allMunicipios.filter(m => m.uf === uf).length;
            const ufSelectedCount = allMunicipios.filter(m => m.uf === uf && selectedCities.includes(m.ibge)).length;
            return (
              <div key={uf}>
                <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded">
                  <Checkbox
                    checked={isUFFullySelected(uf)}
                    // @ts-ignore
                    indeterminate={isUFPartiallySelected(uf)}
                    onCheckedChange={() => toggleUFSelection(uf)}
                  />
                  <button
                    onClick={() => toggleExpand(expandedUFs, uf, setExpandedUFs)}
                    className="flex items-center gap-1 flex-1 text-sm font-medium text-left"
                  >
                    {expandedUFs.has(uf) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {uf}
                    <span className="text-xs text-muted-foreground ml-1">({ufSelectedCount}/{ufCityCount})</span>
                  </button>
                </div>
                {expandedUFs.has(uf) && getMesosByUF(uf).map(meso => {
                  const mesoCities = getMunicipiosByMeso(meso.code);
                  const mesoSelectedCount = mesoCities.filter(c => selectedCities.includes(c.ibge)).length;
                  const showMeso = !search || meso.name.toLowerCase().includes(search) ||
                    mesoCities.some(c => c.name.toLowerCase().includes(search));
                  if (!showMeso) return null;
                  return (
                    <div key={meso.code} className="ml-6">
                      <div className="flex items-center gap-2 py-1 px-2 hover:bg-muted/30 rounded">
                        <Checkbox checked={isMesoFullySelected(meso.code)} onCheckedChange={() => toggleMesoSelection(meso.code)} />
                        <button
                          onClick={() => toggleExpand(expandedMesos, meso.code, setExpandedMesos)}
                          className="flex items-center gap-1 flex-1 text-sm text-left"
                        >
                          {expandedMesos.has(meso.code) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {meso.name}
                          <span className="text-xs text-muted-foreground ml-1">({mesoSelectedCount}/{mesoCities.length})</span>
                        </button>
                      </div>
                      {expandedMesos.has(meso.code) && mesoCities
                        .filter(c => !search || c.name.toLowerCase().includes(search))
                        .map(city => (
                          <div key={city.ibge} className="ml-6 flex items-center gap-2 py-0.5 px-2 hover:bg-muted/20 rounded">
                            <Checkbox checked={selectedCities.includes(city.ibge)} onCheckedChange={() => toggleCity(city.ibge)} />
                            <span className="text-sm">{city.name}</span>
                            <span className="text-xs text-muted-foreground">{city.ibge}</span>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Segmentos Comerciais */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Segmentos Comerciais</Label>
        <p className="text-xs text-muted-foreground">Ágio/desconto comercial, separado da margem do canal.</p>
        <div className="flex gap-2">
          <Input placeholder="Nome do segmento" value={newSegment} onChange={e => setNewSegment(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSegment())} />
          <Button variant="outline" onClick={addSegment}><Plus className="w-4 h-4" /></Button>
        </div>
        {segments.length > 0 ? (
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="w-20 text-center">Ativo</TableHead>
                  <TableHead className="w-44">Ajuste Preço (%)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.segment_name}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={s.active} onCheckedChange={v => updateSegment(i, 'active', v)} />
                    </TableCell>
                    <TableCell>
                      <NumericInput value={s.price_adjustment_percent} onChange={v => updateSegment(i, 'price_adjustment_percent', v)} decimals={2} min={-100} max={100} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSegmentsChange(segments.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
            Nenhum segmento de cliente criado.
          </p>
        )}
      </div>
    </div>
  );
}
