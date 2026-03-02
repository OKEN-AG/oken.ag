import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { DocumentType } from '@/types/barter';

export const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  validado: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Validado' },
  assinado: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Assinado' },
  emitido: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Emitido' },
  pendente: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pendente' },
};

export const allDocTypes: { type: DocumentType; label: string; category?: 'poe' | 'pol' | 'pod' }[] = [
  { type: 'termo_adesao', label: 'Termo de Adesão' },
  { type: 'pedido', label: 'Pedido de Compra' },
  { type: 'termo_barter', label: 'Termo de Barter' },
  { type: 'ccv', label: 'CCV', category: 'pol' },
  { type: 'cessao_credito', label: 'Cessão de Crédito', category: 'pol' },
  { type: 'cpr', label: 'CPR', category: 'poe' },
  { type: 'duplicata', label: 'Duplicata' },
  { type: 'certificado_aceite', label: 'Certificado de Aceite', category: 'pod' },
];
