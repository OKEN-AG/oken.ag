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

  // Keep digits, separators and minus only
  const cleaned = str.replace(/[^\d,.-]/g, '');
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    // Choose decimal separator by last occurrence.
    // Examples:
    // - 1.234,56 => comma decimal
    // - 1,234.56 => dot decimal
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    // 1234,56 => 1234.56
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    // If there are multiple dots, treat them as thousand separators except last
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      const decimal = parts.pop();
      normalized = `${parts.join('')}.${decimal}`;
    }
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
