export const DEFAULT_COMMODITY_FALLBACK = ['soja', 'milho', 'cafe', 'algodao'] as const;

export function normalizeCommodityCode(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

export function toCommodityLabel(value?: string | null): string {
  const normalized = normalizeCommodityCode(value);
  if (!normalized) return '';
  if (normalized === 'cafe') return 'Café';
  if (normalized === 'algodao') return 'Algodão';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
