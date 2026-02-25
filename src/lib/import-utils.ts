export function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeRef(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

export function parseLocaleNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const str = String(value ?? '').trim();
  if (!str) return 0;

  // Keep digits and separators only
  const cleaned = str.replace(/[^\d,.-]/g, '');
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;

  if (hasComma && hasDot) {
    // Assume pt-BR style: 1.234,56
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function splitFlexibleLine(line: string): string[] {
  // First preference: tab/semicolon separators (most spreadsheet exports)
  if (line.includes('\t') || line.includes(';')) {
    return line
      .split(/\t|;/)
      .map(part => part.trim())
      .filter(Boolean);
  }

  // Fallback: multiple spaces
  return line
    .split(/\s{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
}
