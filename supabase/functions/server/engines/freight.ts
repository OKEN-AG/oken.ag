export interface FreightReducerRow {
  id?: string;
  origin?: string | null;
  destination?: string | null;
  distance_km?: number | null;
  cost_per_km?: number | null;
  adjustment?: number | null;
  total_reducer?: number | null;
  cidade?: string | null;
  porto?: string | null;
  km?: number | null;
  custo_km?: number | null;
  ajuste?: number | null;
}

export interface FreightBreakdown {
  matchedReducerId: string | null;
  origin: string;
  destination: string;
  km: number;
  costPerKm: number;
  adjustment: number;
  baseCost: number;
  totalCostPerTon: number;
  usedDefaultCost: boolean;
  rationale: string[];
}

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();

function readReducerValue(reducer: FreightReducerRow | null, defaultCostPerKm: number) {
  const km = Number(reducer?.km ?? reducer?.distance_km ?? 0);
  const costPerKm = Number(reducer?.custo_km ?? reducer?.cost_per_km ?? defaultCostPerKm);
  const adjustment = Number(reducer?.ajuste ?? reducer?.adjustment ?? 0);

  return {
    km: Number.isFinite(km) && km > 0 ? km : 0,
    costPerKm: Number.isFinite(costPerKm) && costPerKm >= 0 ? costPerKm : defaultCostPerKm,
    adjustment: Number.isFinite(adjustment) ? adjustment : 0,
  };
}

export function calculateFreightBreakdown(params: {
  reducers: FreightReducerRow[];
  origin?: string | null;
  destination?: string | null;
  defaultCostPerKm?: number | null;
}): FreightBreakdown {
  const origin = String(params.origin || '').trim();
  const destination = String(params.destination || '').trim();
  const defaultCostPerKm = Number(params.defaultCostPerKm ?? 0);
  const effectiveDefaultCost = Number.isFinite(defaultCostPerKm) && defaultCostPerKm >= 0 ? defaultCostPerKm : 0;

  const reducer = (params.reducers || []).find((candidate) => {
    const candidateOrigin = normalize(candidate.cidade ?? candidate.origin);
    const candidateDestination = normalize(candidate.porto ?? candidate.destination);

    const originMatches = !!origin && candidateOrigin === normalize(origin);
    const destinationMatches = !!destination && candidateDestination === normalize(destination);

    if (origin && destination) return originMatches && destinationMatches;
    if (origin) return originMatches;
    if (destination) return destinationMatches;
    return false;
  }) || null;

  const values = readReducerValue(reducer, effectiveDefaultCost);
  const baseCost = values.km * values.costPerKm;
  const totalCostPerTon = Math.max(baseCost + values.adjustment, 0);

  const rationale: string[] = [];
  if (reducer) {
    rationale.push(`Redutor encontrado para origem "${origin}" e destino "${destination}".`);
  } else {
    rationale.push('Nenhum redutor específico encontrado; aplicado fallback padrão.');
  }

  rationale.push(`Cálculo base: km (${values.km}) × custo_km (${values.costPerKm}) = ${baseCost.toFixed(2)}.`);
  if (values.adjustment !== 0) {
    rationale.push(`Ajuste aplicado: ${values.adjustment.toFixed(2)} R$/ton.`);
  }

  return {
    matchedReducerId: reducer?.id || null,
    origin,
    destination,
    km: values.km,
    costPerKm: values.costPerKm,
    adjustment: values.adjustment,
    baseCost,
    totalCostPerTon,
    usedDefaultCost: !reducer,
    rationale,
  };
}
