import { useMemo } from 'react';
import { onlyDigits } from '@/lib/ptbr';

export function useOrderCalculations(params: {
  area: number;
  comboQty: number;
  dueDates: any[];
  clientCity: string;
  clientState: string;
  selectedPaymentMethod: string;
  clientDocument: string;
  validateCpf: (value: string) => boolean;
  validateCnpj: (value: string) => boolean;
}) {
  const effectiveArea = useMemo(() => params.area * params.comboQty, [params.area, params.comboQty]);

  const filteredDueDates = useMemo(() => {
    return (params.dueDates || []).filter((d: any) => {
      const type = String(d.region_type || '').toLowerCase();
      if (type === 'estado' || type === 'uf') return String(d.region_value || '').toUpperCase() === params.clientState.toUpperCase();
      if (type === 'municipio' || type === 'cidade') return String(d.region_value || '').toLowerCase() === params.clientCity.toLowerCase();
      return ['default', 'geral', 'all', 'todos', ''].includes(type);
    });
  }, [params.dueDates, params.clientCity, params.clientState]);

  const dueDateOptions = useMemo(() => {
    return filteredDueDates.filter((d: any) => !d.payment_method || d.payment_method === params.selectedPaymentMethod);
  }, [filteredDueDates, params.selectedPaymentMethod]);

  const selectedDueDate = useMemo(() => dueDateOptions[0], [dueDateOptions]);

  const documentDigits = useMemo(() => onlyDigits(params.clientDocument), [params.clientDocument]);
  const documentValid = useMemo(() => {
    if (documentDigits.length === 11) return params.validateCpf(documentDigits);
    if (documentDigits.length === 14) return params.validateCnpj(documentDigits);
    return documentDigits.length === 0;
  }, [documentDigits, params]);

  return { effectiveArea, filteredDueDates, dueDateOptions, selectedDueDate, documentDigits, documentValid };
}
