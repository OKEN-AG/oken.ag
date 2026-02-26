import type { ComboDefinition, ComboActivation, AgronomicSelection } from '@/types/barter';

/**
 * COMBO CASCADE ENGINE v5 — Faithful to Excel "MATRIZ DESCONTO"
 *
 * For each combo (OFERTA), per product rule:
 *   VOLUME (I)     = total qty of that REF from selections
 *   TESTE1 (J)     = VOLUME / doseMin   → area equivalent (min dose)
 *   TESTE2 (K)     = VOLUME / doseMax   → area equivalent (max dose)
 *   AREA_CONSOL     = MIN(all TESTE1)    → limiting area of the group
 *   MINIMO (L)     = AREA_CONSOL * doseMin
 *   MAXIMO (M)     = AREA_CONSOL * doseMax
 *   VOL_ATIVADO(N) = MIN(VOLUME, MAXIMO) → capped activated volume
 *   SALDO (O)      = VOLUME - VOL_ATIVADO
 *   CONSOL (P)     = VOL_ATIVADO * (1 - discount)
 *   AREA_CONSOL(Q) = if VOL_ATIVADO > 0 then AREA_CONSOL else 0
 *
 * Cascade: sorted by descountPercent desc, then product count desc.
 * Remaining qty is reduced after each combo activation.
 */

export interface ComboItemDetail {
  ref: string;
  volume: number;        // I — total volume from selections
  teste1: number;        // J — volume / doseMin (area equiv)
  teste2: number;        // K — volume / doseMax (area equiv)
  minimo: number;        // L — areaConsol * doseMin
  maximo: number;        // M — areaConsol * doseMax
  volumeAtivado: number; // N — min(volume, maximo)
  saldo: number;         // O — volume - volumeAtivado
  consolidado: number;   // P — volumeAtivado * (1 - discount)
}

export interface ComboConsumptionLedger {
  /** comboId -> { REF -> quantity consumed } */
  [comboId: string]: Record<string, number>;
}

export interface ComboCascadeResult {
  activations: ComboActivation[];
  consumptionLedger: ComboConsumptionLedger;
  totalDiscountValue: number;
  /** Detailed per-item breakdown for each activated combo */
  itemDetails: Record<string, ComboItemDetail[]>;
}

function getSelectionRef(sel: AgronomicSelection): string {
  const ref = (sel.ref || sel.product?.ref || '').toUpperCase().trim();
  if (ref) return ref;
  return (sel.product?.name || '').toUpperCase().trim();
}

function isComplementaryCombo(combo: ComboDefinition): boolean {
  return combo.isComplementary || /^COMPLEMENTAR/i.test(combo.name);
}

/**
 * Find tightest dose range for a REF across all combos.
 */
export function getSuggestedDoseForRef(
  combos: ComboDefinition[],
  ref: string
): number | null {
  const upperRef = ref.toUpperCase().trim();
  if (!upperRef) return null;

  let bestRule: { min: number; max: number; discount: number } | null = null;

  for (const combo of combos) {
    const rule = combo.products.find(p => (p.ref || '').toUpperCase().trim() === upperRef);
    if (!rule) continue;

    const span = rule.maxDosePerHa - rule.minDosePerHa;
    if (!bestRule) {
      bestRule = { min: rule.minDosePerHa, max: rule.maxDosePerHa, discount: combo.discountPercent };
    } else {
      const bestSpan = bestRule.max - bestRule.min;
      if (span < bestSpan || (span === bestSpan && combo.discountPercent > bestRule.discount)) {
        bestRule = { min: rule.minDosePerHa, max: rule.maxDosePerHa, discount: combo.discountPercent };
      }
    }
  }

  if (!bestRule) return null;
  return (bestRule.min + bestRule.max) / 2;
}

/**
 * Apply combo cascade with Excel-faithful logic.
 */
export function applyComboCascadeWithLedger(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboCascadeResult {
  const mainCombos = combos.filter(c => !isComplementaryCombo(c));
  const complementaryCombos = combos.filter(c => isComplementaryCombo(c));

  // Sort: highest discount first, then most products (widest coverage)
  const sortedMain = [...mainCombos].sort((a, b) => {
    if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
    return b.products.length - a.products.length;
  });

  // Track remaining quantity per REF (starts with total from selections)
  const remainingQty = new Map<string, number>();
  for (const sel of selections) {
    const ref = getSelectionRef(sel);
    if (ref) remainingQty.set(ref, (remainingQty.get(ref) || 0) + sel.roundedQuantity);
  }

  // Build dose lookup: REF -> dosePerHectare (from selections)
  const doseLookup = new Map<string, number>();
  for (const sel of selections) {
    const ref = getSelectionRef(sel);
    if (ref && !doseLookup.has(ref)) doseLookup.set(ref, sel.dosePerHectare);
  }

  const activations: ComboActivation[] = [];
  const consumptionLedger: ComboConsumptionLedger = {};
  const itemDetails: Record<string, ComboItemDetail[]> = {};

  for (const combo of sortedMain) {
    const details: ComboItemDetail[] = [];
    let allPresent = true;
    let areaConsolidada = Infinity;

    // Phase 1: Check presence + calculate TESTE1 (area equiv by min dose)
    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) { allPresent = false; break; }

      const volume = remainingQty.get(ruleRef) || 0;
      if (volume <= 0) { allPresent = false; break; }

      const doseMin = rule.minDosePerHa;
      const doseMax = rule.maxDosePerHa;

      // Check dose is in range (use actual selection dose)
      const selectionDose = doseLookup.get(ruleRef) || 0;
      if (selectionDose < doseMin || selectionDose > doseMax) {
        allPresent = false; break;
      }

      // J = volume / doseMin (area equivalent)
      const teste1 = doseMin > 0 ? volume / doseMin : Infinity;
      // K = volume / doseMax
      const teste2 = doseMax > 0 ? volume / doseMax : 0;

      // Track min area for the group (limiting area)
      areaConsolidada = Math.min(areaConsolidada, teste1);

      details.push({
        ref: ruleRef,
        volume,
        teste1,
        teste2,
        minimo: 0, maximo: 0, volumeAtivado: 0, saldo: 0, consolidado: 0, // filled in Phase 2
      });
    }

    if (!allPresent || details.length === 0 || areaConsolidada === Infinity || areaConsolidada <= 0) {
      activations.push({
        comboId: combo.id, comboName: combo.name, discountPercent: combo.discountPercent,
        matchedProducts: [], applied: false, isComplementary: false,
      });
      continue;
    }

    // Phase 2: Calculate MINIMO, MAXIMO, VOL_ATIVADO, SALDO, CONSOL
    const comboLedger: Record<string, number> = {};
    const matchedRefs: string[] = [];

    for (const item of details) {
      const rule = combo.products.find(p => (p.ref || '').toUpperCase().trim() === item.ref)!;
      item.minimo = areaConsolidada * rule.minDosePerHa;           // L
      item.maximo = areaConsolidada * rule.maxDosePerHa;           // M
      item.volumeAtivado = Math.min(item.volume, item.maximo);     // N
      item.saldo = item.volume - item.volumeAtivado;               // O
      item.consolidado = item.volumeAtivado * (1 - combo.discountPercent / 100); // P

      // Consume from remaining
      comboLedger[item.ref] = item.volumeAtivado;
      remainingQty.set(item.ref, item.saldo);
      matchedRefs.push(item.ref);
    }

    consumptionLedger[combo.id] = comboLedger;
    itemDetails[combo.id] = details;

    activations.push({
      comboId: combo.id,
      comboName: combo.name,
      discountPercent: combo.discountPercent,
      matchedProducts: matchedRefs,
      applied: true,
      isComplementary: false,
      activatedHectares: areaConsolidada,
    });
  }

  // Complementary combos
  const hasActivatedOffers = activations.some(a => a.applied && !a.isComplementary);
  const maxActivatedArea = Math.max(0, ...activations.filter(a => a.applied).map(a => a.activatedHectares || 0));

  for (const combo of complementaryCombos) {
    if (!hasActivatedOffers) {
      activations.push({
        comboId: combo.id, comboName: combo.name, discountPercent: combo.discountPercent,
        matchedProducts: [], applied: false, isComplementary: true,
      });
      continue;
    }

    const matchedRefs: string[] = [];
    const compDetails: ComboItemDetail[] = [];

    for (const rule of combo.products) {
      const ruleRef = (rule.ref || '').toUpperCase().trim();
      if (!ruleRef) continue;

      const volume = remainingQty.get(ruleRef) || 0;
      if (volume <= 0) continue;

      const selectionDose = doseLookup.get(ruleRef) || 0;
      if (selectionDose < rule.minDosePerHa || selectionDose > rule.maxDosePerHa) continue;

      matchedRefs.push(ruleRef);
      compDetails.push({
        ref: ruleRef, volume, teste1: 0, teste2: 0,
        minimo: 0, maximo: volume, volumeAtivado: volume,
        saldo: 0, consolidado: volume * (1 - combo.discountPercent / 100),
      });
    }

    if (matchedRefs.length > 0) {
      const comboLedger: Record<string, number> = {};
      for (const d of compDetails) {
        comboLedger[d.ref] = d.volumeAtivado;
        remainingQty.set(d.ref, 0);
      }
      consumptionLedger[combo.id] = comboLedger;
      itemDetails[combo.id] = compDetails;
    }

    activations.push({
      comboId: combo.id,
      comboName: combo.name,
      discountPercent: combo.discountPercent,
      matchedProducts: matchedRefs,
      applied: matchedRefs.length > 0,
      isComplementary: true,
      proportionalHectares: matchedRefs.length > 0 ? maxActivatedArea : undefined,
    });
  }

  return { activations, consumptionLedger, totalDiscountValue: 0, itemDetails };
}

// Backwards-compatible wrapper
export function applyComboCascade(
  combos: ComboDefinition[],
  selections: AgronomicSelection[]
): ComboActivation[] {
  return applyComboCascadeWithLedger(combos, selections).activations;
}

export function getMaxPossibleDiscount(combos: ComboDefinition[]): number {
  const mainCombos = combos.filter(c => !c.isComplementary && !/^COMPLEMENTAR/i.test(c.name));
  if (mainCombos.length === 0) return 0;
  return Math.max(...mainCombos.map(c => c.discountPercent));
}

export function getActivatedDiscount(activations: ComboActivation[]): number {
  const activatedMain = activations.filter(a => a.applied && !a.isComplementary);
  if (activatedMain.length === 0) return 0;
  return Math.max(...activatedMain.map(a => a.discountPercent));
}

export function getComplementaryDiscount(activations: ComboActivation[]): number {
  return activations
    .filter(a => a.applied && a.isComplementary)
    .reduce((sum, a) => sum + a.discountPercent, 0);
}
