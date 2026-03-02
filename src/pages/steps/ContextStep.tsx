import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/NumericInput';
import { AlertCircle, Eye } from 'lucide-react';

export interface ContextStepProps {
  isActive: boolean;
  // Campaign
  selectedCampaignId: string;
  onCampaignChange: (id: string) => void;
  activeCampaigns: { id: string; name: string; season: string }[] | null;
  onShowCampaignPreview: () => void;
  // Area
  area: number;
  onAreaChange: (v: number) => void;
  comboQty: number;
  onComboQtyChange: (v: number) => void;
  // Client
  clientName: string; onClientNameChange: (v: string) => void;
  clientDocument: string; onClientDocumentChange: (v: string) => void;
  documentValid: boolean;
  clientType: 'PF' | 'PJ'; onClientTypeChange: (v: 'PF' | 'PJ') => void;
  clientEmail: string; onClientEmailChange: (v: string) => void;
  clientPhone: string; onClientPhoneChange: (v: string) => void;
  clientIE: string; onClientIEChange: (v: string) => void;
  deliveryAddress: string; onDeliveryAddressChange: (v: string) => void;
  // Location
  clientState: string; onClientStateChange: (v: string) => void;
  clientCity: string; clientCityCode: string;
  onCitySelect: (city: string, code: string) => void;
  eligibleStates: string[];
  eligibleCitiesForState: { ibge: string; name: string; uf: string }[];
  // Distributor / Channel
  selectedDistributorId: string; onDistributorChange: (v: string) => void;
  campaignDistributors: any[];
  channelSegmentName: string;
  channelMarginPercent: number;
  channelAdjustmentPercent: number;
  // Segment
  segment: string; onSegmentChange: (v: string) => void;
  segmentOptions: { value: string; label: string }[];
  // Commodity
  selectedCommodity: string; onCommodityChange: (v: string) => void;
  commodityOptions: { value: string; label: string }[];
  // Due date
  dueMonths: number; onDueMonthsChange: (v: number) => void;
  dueDateOptions: { value: string; label: string }[];
  // Eligibility
  eligibility: { eligible: boolean; blocked: boolean; warnings: string[] } | null;
  // Client whitelist
  hasWhitelist: boolean;
  clientWhitelistFull: { name: string; document: string }[] | null;
  // Formatting helper
  formatCpfCnpj: (v: string) => string;
}

export function ContextStep(props: ContextStepProps) {
  if (!props.isActive) return null;

  const {
    selectedCampaignId, onCampaignChange, activeCampaigns, onShowCampaignPreview,
    area, onAreaChange, comboQty, onComboQtyChange,
    clientName, onClientNameChange, clientDocument, onClientDocumentChange, documentValid,
    clientType, onClientTypeChange, clientEmail, onClientEmailChange,
    clientPhone, onClientPhoneChange, clientIE, onClientIEChange,
    deliveryAddress, onDeliveryAddressChange,
    clientState, onClientStateChange, onCitySelect, eligibleStates, eligibleCitiesForState,
    selectedDistributorId, onDistributorChange, campaignDistributors,
    channelSegmentName, channelMarginPercent, channelAdjustmentPercent,
    segment, onSegmentChange, segmentOptions,
    selectedCommodity, onCommodityChange, commodityOptions,
    dueMonths, onDueMonthsChange, dueDateOptions,
    eligibility, hasWhitelist, clientWhitelistFull, formatCpfCnpj,
  } = props;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card p-4 lg:col-span-2">
          <label className="stat-label">Campanha</label>
          <div className="flex items-center gap-2 mt-1">
            <Select value={selectedCampaignId} onValueChange={onCampaignChange}>
              <SelectTrigger className="bg-muted border-border text-foreground flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {activeCampaigns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.season})</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedCampaignId && (
              <Button variant="outline" size="icon" className="shrink-0 h-9 w-9 border-border" onClick={onShowCampaignPreview} title="Ver parâmetros da campanha">
                <Eye className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Área (HA) / Quantidade de Combos</label>
          <div className="flex items-center gap-2 mt-1">
            <NumericInput value={area} onChange={onAreaChange} min={1} decimals={0} className="bg-muted border-border text-foreground flex-1" />
            <span className="text-xs text-muted-foreground">×</span>
            <NumericInput value={comboQty} onChange={v => onComboQtyChange(Math.max(1, v))} min={1} decimals={0} className="bg-muted border-border text-foreground w-20" />
          </div>
        </div>
      </div>

      {/* Client info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Nome do Cliente</label>
          <Input value={clientName} onChange={e => onClientNameChange(e.target.value)} placeholder="Razão social / Nome" className="mt-1 bg-muted border-border text-foreground" />
          {hasWhitelist && (
            <div className="mt-1">
              <Select value={clientDocument} onValueChange={v => {
                onClientDocumentChange(v);
                const match = clientWhitelistFull?.find(c => c.document === v);
                if (match) onClientNameChange(match.name);
              }}>
                <SelectTrigger className="h-7 text-xs bg-muted border-border text-foreground"><SelectValue placeholder="Selecionar da whitelist..." /></SelectTrigger>
                <SelectContent>{clientWhitelistFull?.map(c => <SelectItem key={c.document} value={c.document}>{c.name} ({formatCpfCnpj(c.document)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">CPF / CNPJ</label>
          <Input value={formatCpfCnpj(clientDocument)} onChange={e => onClientDocumentChange(e.target.value.replace(/\D/g, ''))}
            placeholder="000.000.000-00" className={`mt-1 bg-muted border-border text-foreground ${!documentValid ? 'border-destructive' : ''}`} />
          {!documentValid && <p className="text-[11px] text-destructive mt-1">Documento inválido</p>}
          <div className="flex gap-2 mt-1">
            <Button size="sm" variant={clientType === 'PF' ? 'default' : 'outline'} className="h-6 text-xs" onClick={() => onClientTypeChange('PF')}>PF</Button>
            <Button size="sm" variant={clientType === 'PJ' ? 'default' : 'outline'} className="h-6 text-xs" onClick={() => onClientTypeChange('PJ')}>PJ</Button>
          </div>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">E-mail / Telefone</label>
          <Input value={clientEmail} onChange={e => onClientEmailChange(e.target.value)} placeholder="email@exemplo.com" className="mt-1 bg-muted border-border text-foreground" />
          <Input value={clientPhone} onChange={e => onClientPhoneChange(e.target.value)} placeholder="(00) 00000-0000" className="mt-1 bg-muted border-border text-foreground" />
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Estado</label>
          <Select value={clientState} onValueChange={v => { onClientStateChange(v); onCitySelect('', ''); }}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>{eligibleStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Cidade</label>
          <Select value={props.clientCityCode || props.clientCity} onValueChange={v => {
            const m = eligibleCitiesForState.find(c => c.ibge === v || c.name === v);
            if (m) onCitySelect(m.name, m.ibge);
          }}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>{eligibleCitiesForState.map(m => <SelectItem key={m.ibge} value={m.ibge}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">IE / Inscrição Estadual</label>
          <Input value={clientIE} onChange={e => onClientIEChange(e.target.value)} placeholder="IE" className="mt-1 bg-muted border-border text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 md:col-span-3">
          <label className="stat-label">Endereço de Entrega</label>
          <Input value={deliveryAddress} onChange={e => onDeliveryAddressChange(e.target.value)} placeholder="Rua, nº, bairro, CEP" className="mt-1 bg-muted border-border text-foreground" />
        </div>
      </div>

      {/* Distributor / Segment / Commodity / Due date */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <label className="stat-label">Distribuidor / Canal</label>
          <Select value={selectedDistributorId} onValueChange={onDistributorChange}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>{(campaignDistributors || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.short_name || d.full_name} ({d.cnpj})</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-2">Segmento canal: {channelSegmentName || '—'} · Margem: {channelMarginPercent}% · Ajuste: {channelAdjustmentPercent}%</p>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Segmento Comercial</label>
          <Select value={segment} onValueChange={onSegmentChange}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>{segmentOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Commodity</label>
          <Select value={selectedCommodity} onValueChange={onCommodityChange}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{commodityOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="glass-card p-4">
          <label className="stat-label">Vencimento</label>
          <Select value={String(dueMonths)} onValueChange={v => onDueMonthsChange(Number(v))} disabled={dueDateOptions.length === 0}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground"><SelectValue placeholder={dueDateOptions.length === 0 ? 'Sem vencimentos configurados' : undefined} /></SelectTrigger>
            <SelectContent>{dueDateOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          {dueDateOptions.length === 0 && <p className="text-[11px] text-destructive mt-2">Campanha sem vencimentos configurados.</p>}
        </div>
      </div>

      {/* Eligibility flags */}
      {eligibility && !eligibility.eligible && (
        <div className="space-y-1">
          {eligibility.warnings.map((w, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs ${eligibility.blocked ? 'text-destructive bg-destructive/10' : 'text-warning bg-warning/10'} border rounded-md px-3 py-2`}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {w}
              {eligibility.blocked && <span className="ml-auto font-semibold">⛔ BLOQUEANTE</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
