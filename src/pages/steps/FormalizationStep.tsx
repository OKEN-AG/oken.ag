import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { NumericInput } from '@/components/NumericInput';
import TrainTrack from '@/components/TrainTrack';
import {
  Train, ArrowRight, PenLine, ShieldCheck, Lock, Check, FileText,
  CheckCircle, AlertTriangle, Clock,
} from 'lucide-react';
import { statusConfig, allDocTypes } from './constants';
import type { DocumentType } from '@/types/barter';

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
}

export function FormalizationStep({
  isActive, isNewOperation, wagonStages, nextStatus, onAdvanceStatus,
  docMap, emitting, onDocAction, onCessaoNotify,
  performanceIndex, onPerformanceIndexChange, aforoPercent,
  netRevenue, quantitySacas, formatCurrency,
}: FormalizationStepProps) {
  if (!isActive) return null;
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
                    return (
                      <div key={doc.type} className="glass-card p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">{doc.label}</span>
                          <span className={`engine-badge ${config.bg} ${config.color} text-xs`}><Icon className="w-3 h-3 inline mr-1" />{config.label}</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {status === 'pendente' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => onDocAction(doc.type, 'emit')}>{emitting === doc.type ? '...' : 'Emitir'}</Button>}
                          {status === 'emitido' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => onDocAction(doc.type, 'sign')}><PenLine className="w-3 h-3 mr-1" />Assinar</Button>}
                          {status === 'assinado' && <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={emitting === doc.type} onClick={() => onDocAction(doc.type, 'validate')}><ShieldCheck className="w-3 h-3 mr-1" />Validar</Button>}
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
    </div>
  );
}
