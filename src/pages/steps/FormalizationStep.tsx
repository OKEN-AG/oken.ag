import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { NumericInput } from '@/components/NumericInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TrainTrack from '@/components/TrainTrack';
import {
  Train, ArrowRight, PenLine, ShieldCheck, Lock, Check, FileText,
  CheckCircle, AlertTriangle, Eye, Upload, XCircle, ClipboardCheck, Package,
} from 'lucide-react';
import { statusConfig, allDocTypes } from './constants';
import type { DocumentType } from '@/types/barter';
import { generateDocumentHtml, defaultTemplates, type DocumentData } from '@/lib/document-generator';

interface FormalizationStepProps {
  isActive: boolean;
  isNewOperation: boolean;
  wagonStages: any[];
  nextStatus: string | null;
  onAdvanceStatus: () => void;
  docMap: Map<string, any>;
  emitting: string | null;
  onDocAction: (docType: DocumentType, action: 'emit' | 'sign' | 'validate') => void;
  onCessaoNotify: (docId: string, method: 'notificacao' | 'tripartite') => void;
  performanceIndex: number;
  onPerformanceIndexChange: (v: number) => void;
  aforoPercent: number | null | undefined;
  netRevenue: number;
  quantitySacas: number;
  formatCurrency: (v: number) => string;
  documentData?: DocumentData;
  operationStatus?: string;
  paymentMode?: string;
  operationId?: string;
  snapshotId?: string | null;
  onDocumentUpload: (docType: DocumentType, file: File) => void;
  onDocumentReview: (docType: DocumentType, decision: 'approved' | 'rejected', reason?: string) => void;
  onCounterpartyAcceptance: () => void;
}

export function FormalizationStep({
  isActive, isNewOperation, wagonStages, nextStatus, onAdvanceStatus,
  docMap, emitting, onDocAction, onCessaoNotify,
  performanceIndex, onPerformanceIndexChange, aforoPercent,
  netRevenue, quantitySacas, formatCurrency,
  documentData,
  operationStatus,
  paymentMode,
  operationId,
  snapshotId,
  onDocumentUpload,
  onDocumentReview,
  onCounterpartyAcceptance,
}: FormalizationStepProps) {
  const [previewDocType, setPreviewDocType] = useState<string | null>(null);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});

  if (!isActive) return null;

  const previewHtml = previewDocType
    ? generateDocumentHtml(defaultTemplates[previewDocType] || defaultTemplates.pedido, documentData || {})
    : '';

  const gateStatus = useMemo(() => {
    const docs = Array.from(docMap.values());
    const poe = docs.some((d: any) => d.guarantee_category === 'poe' && d.status === 'validado');
    const pol = docs.some((d: any) => d.guarantee_category === 'pol' && d.status === 'validado');
    const documentDone = allDocTypes
      .filter(d => ['termo_adesao', 'pedido', 'termo_barter'].includes(d.type))
      .every(d => ['assinado', 'validado'].includes(docMap.get(d.type)?.status));
    return { poe, pol, documentDone };
  }, [docMap]);

  const eligibleForFormalization = ['pedido', 'formalizado', 'garantido'].includes((operationStatus || '').toLowerCase());
  const cessionRuleActive = (paymentMode || '').toLowerCase().includes('barter');

  return (
    <div className="space-y-4">
      {!isNewOperation && wagonStages.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><Train className="w-4 h-4 text-primary" /> Certificação</h3>
          <TrainTrack stages={wagonStages} />
          {nextStatus && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={onAdvanceStatus} className="bg-success text-success-foreground"><ArrowRight className="w-4 h-4 mr-1" /> Avançar para {nextStatus}</Button>
            </div>
          )}
        </div>
      )}
      {isNewOperation && <div className="glass-card p-6 text-center text-muted-foreground">Salve a operação primeiro para acessar a formalização.</div>}
      {!isNewOperation && (
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-primary" /> Feed de Formalização</h4>
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <div className="rounded border border-border p-3">
                <div className="text-muted-foreground text-xs mb-1">Documentos requeridos</div>
                <div className="font-medium">{allDocTypes.length} tipos para operação/campanha</div>
              </div>
              <div className="rounded border border-border p-3">
                <div className="text-muted-foreground text-xs mb-1">Estado dos gates</div>
                <div className="space-y-1 text-xs">
                  <div>PoE: <span className={gateStatus.poe ? 'text-success' : 'text-warning'}>{gateStatus.poe ? 'ok' : 'pendente'}</span></div>
                  <div>PoL: <span className={gateStatus.pol ? 'text-success' : 'text-warning'}>{gateStatus.pol ? 'ok' : 'pendente'}</span></div>
                  <div>document_done: <span className={gateStatus.documentDone ? 'text-success' : 'text-warning'}>{String(gateStatus.documentDone)}</span></div>
                </div>
              </div>
              <div className="rounded border border-border p-3">
                <div className="text-muted-foreground text-xs mb-1">Template</div>
                <div className="font-medium">v1 (defaultTemplates)</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className={`rounded border p-2 ${eligibleForFormalization ? 'border-success/40 text-success' : 'border-warning/40 text-warning'}`}>
                Precedente: operação elegível para formalização = {String(eligibleForFormalization)}
              </div>
              <div className={`rounded border p-2 ${cessionRuleActive ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'}`}>
                Precedente: regras de cessão ativas (payment_mode=barter) = {String(cessionRuleActive)}
              </div>
            </div>
            <div className="rounded border border-border p-3 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Outputs e Persistência</div>
              <div>document_bundle_snapshot: {snapshotId || 'pendente'}</div>
              <div>status de gate atualizado: PoE={String(gateStatus.poe)}, PoL={String(gateStatus.pol)}, document_done={String(gateStatus.documentDone)}</div>
              <div>evento esperado: {gateStatus.poe && gateStatus.pol && gateStatus.documentDone ? 'formalization.completed' : 'formalization.pending'}</div>
              <div>metadados persistidos: arquivo, hash, signers, timestamps + vínculo operation_id ({operationId || '—'})/snapshot_id + trilha de auditoria.</div>
            </div>
          </div>

          {[
            { cat: 'poe' as const, title: 'Comprovação de Produção', icon: ShieldCheck, color: 'text-success' },
            { cat: 'pol' as const, title: 'Comprovação de Contrato', icon: Lock, color: 'text-primary' },
            { cat: 'pod' as const, title: 'Comprovação de Entrega', icon: Check, color: 'text-info' },
            { cat: undefined as undefined, title: 'Outros Documentos', icon: FileText, color: 'text-muted-foreground' },
          ].map(group => {
            const docs = allDocTypes.filter(d => d.category === group.cat);
            if (docs.length === 0) return null;
            const GroupIcon = group.icon;
            return (
              <div key={group.cat || 'other'}>
                <h4 className={`text-xs font-semibold ${group.color} flex items-center gap-1.5 mb-2`}>
                  <GroupIcon className="w-3.5 h-3.5" /> {group.title}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {docs.map(doc => {
                    const existing = docMap.get(doc.type);
                    const status = (existing?.status as keyof typeof statusConfig) || 'pendente';
                    const config = statusConfig[status];
                    const Icon = config.icon;
                    const hasTemplate = !!defaultTemplates[doc.type];
                    return (
                      <div key={doc.type} className="glass-card p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                          <span className={`engine-badge ${config.bg} ${config.color} text-xs`}><Icon className="w-3 h-3 inline mr-1" />{config.label}</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Label htmlFor={`upload-${doc.type}`} className="sr-only">Upload {doc.label}</Label>
                          <Input id={`upload-${doc.type}`} type="file" className="text-xs" onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) onDocumentUpload(doc.type, file);
                            e.currentTarget.value = '';
                          }} />
                          {status === 'pendente' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => onDocAction(doc.type, 'emit')}>{emitting === doc.type ? '...' : 'Emitir'}</Button>}
                          {status === 'emitido' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => onDocAction(doc.type, 'sign')}><PenLine className="w-3 h-3 mr-1" />Assinar</Button>}
                          {status === 'assinado' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => onDocAction(doc.type, 'validate')}><ShieldCheck className="w-3 h-3 mr-1" />Validar</Button>}
                          <Textarea
                            placeholder="Motivo da reprovação/aprovação"
                            className="text-xs min-h-16"
                            value={reviewReasons[doc.type] || ''}
                            onChange={e => setReviewReasons(prev => ({ ...prev, [doc.type]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => onDocumentReview(doc.type, 'approved', reviewReasons[doc.type])}><CheckCircle className="w-3 h-3 mr-1" />Aprovar</Button>
                          <Button size="sm" variant="outline" className="text-xs border-destructive text-destructive" onClick={() => onDocumentReview(doc.type, 'rejected', reviewReasons[doc.type])}><XCircle className="w-3 h-3 mr-1" />Reprovar</Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={onCounterpartyAcceptance}><Upload className="w-3 h-3 mr-1" />Registrar aceite contraparte</Button>
                          {hasTemplate && (
                            <Button size="sm" variant="ghost" className="text-xs px-2" onClick={() => setPreviewDocType(doc.type)} title="Visualizar documento">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {doc.type === 'cessao_credito' && existing && (status === 'emitido' || status === 'assinado') && (
                            (() => {
                              const docData = (existing as any).data || {};
                              const notified = docData.counterparty_notified;
                              return notified ? (
                                <span className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" />Comprador notificado ({docData.notification_method || 'notificação'})</span>
                              ) : (
                                <div className="flex gap-1 w-full mt-1">
                                  <Button size="sm" variant="outline" className="flex-1 text-xs border-warning text-warning" onClick={() => onCessaoNotify(existing.id, 'notificacao')}>Notificar</Button>
                                  <Button size="sm" variant="outline" className="flex-1 text-xs border-primary text-primary" onClick={() => onCessaoNotify(existing.id, 'tripartite')}>Tripartite</Button>
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="glass-card p-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><ShieldCheck className="w-4 h-4 text-primary" /> Cobertura de Garantias</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <div className="stat-label">Índice de Cumprimento</div>
                <div className="flex items-center gap-2 mt-1">
                  <NumericInput value={performanceIndex} onChange={onPerformanceIndexChange} min={0} max={100} decimals={0} className="h-8 w-20 bg-muted border-border text-xs text-foreground" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div>
                <div className="stat-label">Aforo Exigido</div>
                <div className="font-mono text-foreground">{aforoPercent ?? '—'}%</div>
              </div>
              <div>
                <div className="stat-label">Montante Operação</div>
                <div className="font-mono text-foreground">{formatCurrency(netRevenue)}</div>
              </div>
              <div>
                <div className="stat-label">Sacas Efetivas</div>
                <div className="font-mono text-foreground">{Math.round(quantitySacas * (performanceIndex / 100)).toLocaleString('pt-BR')} sc</div>
              </div>
            </div>
            <Progress value={performanceIndex} className="h-2 bg-muted" />
            {performanceIndex < 80 && (
              <div className="mt-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> Índice de Cumprimento abaixo de 80% — risco elevado de não entrega
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Preview Dialog */}
      <Dialog open={!!previewDocType} onOpenChange={open => !open && setPreviewDocType(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Pré-visualização: {allDocTypes.find(d => d.type === previewDocType)?.label || previewDocType}
            </DialogTitle>
          </DialogHeader>
          <div className="border border-border rounded-lg bg-background p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          <p className="text-xs text-muted-foreground text-center mt-2">Esta é uma pré-visualização. O documento final será gerado no momento da emissão.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
