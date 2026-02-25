export function normalizeText(value: string): string {
  return String(value || '')
    .replace(/^\uFEFF/, '') // strip BOM
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

/**
 * Detect if a token looks like a number (pt-BR or US style).
 * Accepts: 189,2625  207,82  12  1  620,23  72  548,1  54,7575
 */
function looksNumeric(token: string): boolean {
  return /^\d[\d.,]*$/.test(token.trim());
}

export function splitFlexibleLine(line: string): string[] {
  // Strip BOM
  const clean = line.replace(/^\uFEFF/, '');

  // First preference: tab/semicolon separators (most spreadsheet exports)
  if (clean.includes('\t') || clean.includes(';')) {
    return clean
      .split(/\t|;/)
      .map(part => part.trim())
      .filter(Boolean);
  }

  // Space-separated: use right-to-left approach to extract numeric trailing fields,
  // then identify product name boundaries using the REF code pattern.
  return parseSpaceSeparatedLine(clean);
}

/**
 * Parse a space-separated line where the product name contains spaces.
 * Expected format (7 or 8 columns):
 *   CODE  PRODUCT NAME (multi-word)  REF  PRICE_CASH  [PRICE_TERM]  UNITS_PER_BOX  KG_L
 *
 * Strategy: split into tokens, then consume from the RIGHT (numeric fields)
 * and from the LEFT (code), leaving the middle as product name + ref.
 */
function parseSpaceSeparatedLine(line: string): string[] {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 6) return tokens; // not enough for our format

  // First token = code (always numeric)
  const code = tokens[0];
  if (!/^\d+$/.test(code)) return tokens; // not our expected format

  // Consume numeric tokens from the right
  const rightNums: string[] = [];
  let i = tokens.length - 1;
  while (i > 0 && looksNumeric(tokens[i]) && rightNums.length < 4) {
    rightNums.unshift(tokens[i]);
    i--;
  }

  // We expect 3-4 right-side numeric fields: price_cash, [price_term], units_per_box, kg_l
  if (rightNums.length < 3) return tokens; // fallback

  // Remaining tokens [1..i] = product name + REF
  // REF is typically a 3-4 char uppercase alpha code at the end of the name section
  const middleTokens = tokens.slice(1, i + 1);

  // Find REF: last token in middle that is 3-5 uppercase letters (possibly with trailing space)
  let refIdx = middleTokens.length - 1;
  while (refIdx >= 0 && !/^[A-Z]{3,5}$/.test(middleTokens[refIdx].replace(/\s/g, ''))) {
    refIdx--;
  }

  let name: string;
  let ref: string;

  if (refIdx >= 1) {
    name = middleTokens.slice(0, refIdx).join(' ');
    ref = middleTokens[refIdx];
  } else {
    // Fallback: no clear REF found, use all middle as name
    name = middleTokens.join(' ');
    ref = '';
  }

  // Build result: code, name, ref, then right numerics
  // If 4 right nums: price_cash, price_term, units_per_box, kg_l
  // If 3 right nums: price_cash, units_per_box, kg_l (no separate price_term)
  if (rightNums.length === 4) {
    return [code, name, ref, rightNums[0], rightNums[1], rightNums[2], rightNums[3]];
  } else {
    // 3 nums: price_cash, units_per_box, kg_l
    return [code, name, ref, rightNums[0], rightNums[0], rightNums[1], rightNums[2]];
  }
}
