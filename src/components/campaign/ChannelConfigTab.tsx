import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ChannelTypeRow } from '@/components/campaign/EligibilityTab';

export type ChannelSegmentRow = {
  channel_segment_name: string;
  margin_percent: number;
  price_adjustment_percent: number;
  active: boolean;
  channel_type: string;
};

export type DistributorRow = {
  short_name: string;
  full_name: string;
  cnpj: string;
  channel_type: string;
  channel_segment_name: string;
  active: boolean;
};

type Props = {
  channelSegments: ChannelSegmentRow[];
  onChannelSegmentsChange: (rows: ChannelSegmentRow[]) => void;
  distributors: DistributorRow[];
  onDistributorsChange: (rows: DistributorRow[]) => void;
  activeChannelTypes: ChannelTypeRow[];
};

export default function ChannelConfigTab({ channelSegments, onChannelSegmentsChange, distributors, onDistributorsChange, activeChannelTypes }: Props) {
  const addChannelSegment = () => onChannelSegmentsChange([...channelSegments, { channel_segment_name: '', margin_percent: 0, price_adjustment_percent: 0, active: true, channel_type: '' }]);
  const addDistributor = () => onDistributorsChange([...distributors, { short_name: '', full_name: '', cnpj: '', channel_type: '', channel_segment_name: '', active: true }]);

  const activeTypes = activeChannelTypes.filter(ct => ct.active && ct.channel_type_name.trim());

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Segmentos do Canal</Label>
          <Button variant="outline" size="sm" onClick={addChannelSegment}><Plus className="w-4 h-4 mr-1" />Adicionar segmento de canal</Button>
        </div>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo de Canal</TableHead>
                <TableHead>Segmento do Canal</TableHead>
                <TableHead>Margem %</TableHead>
                <TableHead>Ajuste %</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channelSegments.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select
                      value={row.channel_type || '__none__'}
                      onValueChange={v => {
                        const next = [...channelSegments];
                        next[i] = { ...row, channel_type: v === '__none__' ? '' : v };
                        onChannelSegmentsChange(next);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder={activeTypes.length === 0 ? 'Sem tipos ativos' : 'Selecione...'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{activeTypes.length === 0 ? 'Sem tipos ativos' : 'Nenhum'}</SelectItem>
                        {activeTypes.map(ct => (
                          <SelectItem key={ct.channel_type_name} value={ct.channel_type_name}>{ct.channel_type_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input value={row.channel_segment_name} onChange={e => { const next=[...channelSegments]; next[i]={...row,channel_segment_name:e.target.value}; onChannelSegmentsChange(next); }} /></TableCell>
                  <TableCell>
                    <NumericInput value={row.margin_percent} onChange={v => { const next=[...channelSegments]; next[i]={...row,margin_percent:v}; onChannelSegmentsChange(next); }} decimals={2} min={-100} max={100} />
                  </TableCell>
                  <TableCell>
                    <NumericInput value={row.price_adjustment_percent} onChange={v => { const next=[...channelSegments]; next[i]={...row,price_adjustment_percent:v}; onChannelSegmentsChange(next); }} decimals={2} min={-100} max={100} />
                  </TableCell>
                  <TableCell><Switch checked={row.active} onCheckedChange={v => { const next=[...channelSegments]; next[i]={...row,active:v}; onChannelSegmentsChange(next); }} /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => onChannelSegmentsChange(channelSegments.filter((_,j)=>j!==i))}><Trash2 className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Whitelist de Distribuidores/Canais</Label>
          <Button variant="outline" size="sm" onClick={addDistributor}><Plus className="w-4 h-4 mr-1" />Adicionar distribuidor</Button>
        </div>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Short</TableHead><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead><TableHead>Tipo de Canal</TableHead><TableHead>Segmento do Canal</TableHead><TableHead>Ativo</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {distributors.map((row, i) => {
                // Filter segments by the selected channel_type of this distributor
                const availableSegments = channelSegments.filter(cs =>
                  cs.channel_segment_name.trim() &&
                  cs.active &&
                  (!row.channel_type || !cs.channel_type || cs.channel_type === row.channel_type)
                );
                return (
                  <TableRow key={i}>
                    <TableCell><Input value={row.short_name} onChange={e => { const next=[...distributors]; next[i]={...row,short_name:e.target.value}; onDistributorsChange(next); }} /></TableCell>
                    <TableCell><Input value={row.full_name} onChange={e => { const next=[...distributors]; next[i]={...row,full_name:e.target.value}; onDistributorsChange(next); }} /></TableCell>
                    <TableCell><Input value={row.cnpj} onChange={e => { const next=[...distributors]; next[i]={...row,cnpj:e.target.value}; onDistributorsChange(next); }} /></TableCell>
                    <TableCell>
                      <Select
                        value={row.channel_type || '__none__'}
                        onValueChange={v => {
                          const next=[...distributors];
                          const newType = v === '__none__' ? '' : v;
                          // Clear segment if it no longer matches the new type
                          const segStillValid = channelSegments.some(cs =>
                            cs.channel_segment_name === row.channel_segment_name &&
                            cs.active &&
                            (!newType || !cs.channel_type || cs.channel_type === newType)
                          );
                          next[i]={...row, channel_type: newType, channel_segment_name: segStillValid ? row.channel_segment_name : ''};
                          onDistributorsChange(next);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder={activeTypes.length === 0 ? 'Sem tipos ativos' : 'Selecione...'} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Todos</SelectItem>
                          {activeTypes.map(ct => (
                            <SelectItem key={ct.channel_type_name} value={ct.channel_type_name}>{ct.channel_type_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.channel_segment_name || '__none__'}
                        onValueChange={v => {
                          const next=[...distributors];
                          next[i]={...row,channel_segment_name:v === '__none__' ? '' : v};
                          onDistributorsChange(next);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder={availableSegments.length === 0 ? 'Sem segmentos' : 'Selecione...'} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{availableSegments.length === 0 ? 'Sem segmentos' : 'Nenhum'}</SelectItem>
                          {availableSegments.map(cs => <SelectItem key={cs.channel_segment_name} value={cs.channel_segment_name}>{cs.channel_segment_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Switch checked={row.active} onCheckedChange={v => { const next=[...distributors]; next[i]={...row,active:v}; onDistributorsChange(next); }} /></TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => onDistributorsChange(distributors.filter((_,j)=>j!==i))}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
