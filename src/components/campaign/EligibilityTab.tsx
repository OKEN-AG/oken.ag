import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getAllMunicipios, getUFs, getMesosByUF, getMunicipiosByMeso } from '@/data/municipios';
import { parsePtBrNumber, formatPtBrCurrency } from '@/lib/ptbr';

export type SegmentRow = {
  segment_name: string;
  active: boolean;
  price_adjustment_percent: number;
};

const CLIENT_TYPES = [
  { value: 'pf', label: 'Pessoa Física (PF)' },
  { value: 'pj', label: 'Pessoa Jurídica (PJ)' },
];

type Props = {
  selectedCities: string[];
  onSelectedCitiesChange: (cities: string[]) => void;
  segments: SegmentRow[];
  onSegmentsChange: (segments: SegmentRow[]) => void;
  clientType: string[];
  onClientTypeChange: (types: string[]) => void;
  minOrderAmount: number;
  onMinOrderAmountChange: (v: number) => void;
  currency: string;
};

export default function EligibilityTab({
  selectedCities, onSelectedCitiesChange,
  segments, onSegmentsChange,
  clientType, onClientTypeChange,
  minOrderAmount, onMinOrderAmountChange,
  currency,
}: Props) {
  const [expandedUFs, setExpandedUFs] = useState<Set<string>>(new Set());
  const [expandedMesos, setExpandedMesos] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [newSegment, setNewSegment] = useState('');

  const ufs = useMemo(() => getUFs(), []);
  const allMunicipios = useMemo(() => getAllMunicipios(), []);

  const toggleExpand = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

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
          <Input
            type="text"
            inputMode="decimal"
            value={minOrderAmount}
            onChange={e => onMinOrderAmountChange(parsePtBrNumber(e.target.value))}
            placeholder="0,00"
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">Valor formatado: {formatPtBrCurrency(minOrderAmount, currency === 'USD' ? 'USD' : 'BRL')}</p>
        </div>
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
                      <Input type="text" inputMode="decimal" value={s.price_adjustment_percent} onChange={e => updateSegment(i, 'price_adjustment_percent', parsePtBrNumber(e.target.value))} className="h-8" />
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
            Nenhum segmento criado.
          </p>
        )}
      </div>
    </div>
  );
}
