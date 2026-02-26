import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { NumericInput } from '@/components/NumericInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ChannelSegmentRow = {
  channel_segment_name: string;
  margin_percent: number;
  price_adjustment_percent: number;
  active: boolean;
};

export type DistributorRow = {
  short_name: string;
  full_name: string;
  cnpj: string;
  channel_segment_name: string;
  active: boolean;
};

type Props = {
  channelSegments: ChannelSegmentRow[];
  onChannelSegmentsChange: (rows: ChannelSegmentRow[]) => void;
  distributors: DistributorRow[];
  onDistributorsChange: (rows: DistributorRow[]) => void;
};

export default function ChannelConfigTab({ channelSegments, onChannelSegmentsChange, distributors, onDistributorsChange }: Props) {
  const addChannelSegment = () => onChannelSegmentsChange([...channelSegments, { channel_segment_name: '', margin_percent: 0, price_adjustment_percent: 0, active: true }]);
  const addDistributor = () => onDistributorsChange([...distributors, { short_name: '', full_name: '', cnpj: '', channel_segment_name: '', active: true }]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Segmentos do Canal</Label>
          <Button variant="outline" size="sm" onClick={addChannelSegment}><Plus className="w-4 h-4 mr-1" />Adicionar segmento de canal</Button>
        </div>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Segmento do Canal</TableHead><TableHead>Margem %</TableHead><TableHead>Ajuste %</TableHead><TableHead>Ativo</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {channelSegments.map((row, i) => (
                <TableRow key={i}>
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
            <TableHeader><TableRow><TableHead>Short</TableHead><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead><TableHead>Segmento do Canal</TableHead><TableHead>Ativo</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {distributors.map((row, i) => (
                <TableRow key={i}>
                  <TableCell><Input value={row.short_name} onChange={e => { const next=[...distributors]; next[i]={...row,short_name:e.target.value}; onDistributorsChange(next); }} /></TableCell>
                  <TableCell><Input value={row.full_name} onChange={e => { const next=[...distributors]; next[i]={...row,full_name:e.target.value}; onDistributorsChange(next); }} /></TableCell>
                  <TableCell><Input value={row.cnpj} onChange={e => { const next=[...distributors]; next[i]={...row,cnpj:e.target.value}; onDistributorsChange(next); }} /></TableCell>
                  <TableCell>
                    <Select
                      value={row.channel_segment_name || '__none__'}
                      onValueChange={v => {
                        const next=[...distributors];
                        next[i]={...row,channel_segment_name:v === '__none__' ? '' : v};
                        onDistributorsChange(next);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder={channelSegments.length === 0 ? 'Sem segmentos do canal' : 'Selecione...'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{channelSegments.length === 0 ? 'Sem segmentos do canal' : 'Nenhum'}</SelectItem>
                        {channelSegments
                          .filter(cs => cs.channel_segment_name.trim())
                          .map(cs => <SelectItem key={cs.channel_segment_name} value={cs.channel_segment_name}>{cs.channel_segment_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Switch checked={row.active} onCheckedChange={v => { const next=[...distributors]; next[i]={...row,active:v}; onDistributorsChange(next); }} /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => onDistributorsChange(distributors.filter((_,j)=>j!==i))}><Trash2 className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
