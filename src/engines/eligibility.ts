import type { Campaign, ChannelSegment } from '@/types/barter';

/**
 * ELIGIBILITY ENGINE
 * 
 * Validates whether a client/order is eligible for a given campaign.
 * Returns granular flags so UI can show specific warnings.
 */

export interface EligibilityInput {
  /** Client state (UF) */
  state?: string;
  /** Client mesoregion */
  mesoregion?: string;
  /** Client city */
  city?: string;
  /** Channel segment */
  segment?: ChannelSegment;
  /** Client segment (grande/medio/pequeno) */
  clientSegment?: string;
  /** Client document (CPF/CNPJ) */
  clientDocument?: string;
  /** Order gross amount in campaign currency */
  orderAmount?: number;
  /** Minimum order amount from campaign */
  minOrderAmount?: number;
  /** Whitelist of allowed client documents (if empty, no filter) */
  whitelist?: string[];
  /** Whether campaign blocks ineligible clients */
  blockIneligible?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  blocked: boolean; // hard block (blockIneligible && !eligible)
  flags: {
    geo_ok: boolean;
    state_ok: boolean;
    mesoregion_ok: boolean;
    city_ok: boolean;
    segment_ok: boolean;
    client_segment_ok: boolean;
    min_ok: boolean;
    whitelist_ok: boolean;
  };
  warnings: string[];
}

/**
 * Geo eligibility follows precedence: city > mesoregion > state.
 * If a more specific list is configured and matches, it overrides less specific.
 * If no list is configured at a level, that level passes.
 */
function checkGeoEligibility(
  input: EligibilityInput,
  eligibility: Campaign['eligibility']
): { geo_ok: boolean; state_ok: boolean; mesoregion_ok: boolean; city_ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // State check
  const hasStateFilter = eligibility.states.length > 0;
  const state_ok = !hasStateFilter || !input.state || eligibility.states.includes(input.state);
  if (!state_ok) warnings.push(`Estado "${input.state}" não elegível`);

  // Mesoregion check
  const hasMesoFilter = eligibility.mesoregions.length > 0;
  const mesoregion_ok = !hasMesoFilter || !input.mesoregion || 
    eligibility.mesoregions.some(m => m.toLowerCase() === input.mesoregion!.toLowerCase());
  if (!mesoregion_ok) warnings.push(`Mesorregião "${input.mesoregion}" não elegível`);

  // City check
  const hasCityFilter = eligibility.cities.length > 0;
  const city_ok = !hasCityFilter || !input.city || 
    eligibility.cities.some(c => c.toLowerCase() === input.city!.toLowerCase());
  if (!city_ok) warnings.push(`Cidade "${input.city}" não elegível`);

  // Geo is OK if all configured levels pass
  const geo_ok = state_ok && mesoregion_ok && city_ok;

  return { geo_ok, state_ok, mesoregion_ok, city_ok, warnings };
}

export function checkEligibility(
  campaign: Campaign,
  input: EligibilityInput
): EligibilityResult {
  const warnings: string[] = [];

  // 1. Geo
  const geo = checkGeoEligibility(input, campaign.eligibility);
  warnings.push(...geo.warnings);

  // 2. Distributor segment
  const hasSegmentFilter = campaign.eligibility.distributorSegments.length > 0;
  const segment_ok = !hasSegmentFilter || !input.segment || 
    campaign.eligibility.distributorSegments.includes(input.segment);
  if (!segment_ok) warnings.push(`Segmento "${input.segment}" não elegível`);

  // 3. Client segment
  const hasClientSegFilter = campaign.eligibility.clientSegments.length > 0;
  const client_segment_ok = !hasClientSegFilter || !input.clientSegment ||
    campaign.eligibility.clientSegments.includes(input.clientSegment);
  if (!client_segment_ok) warnings.push(`Segmento do cliente "${input.clientSegment}" não elegível`);

  // 4. Minimum order amount
  const minAmount = input.minOrderAmount ?? 0;
  const min_ok = minAmount <= 0 || !input.orderAmount || input.orderAmount >= minAmount;
  if (!min_ok) warnings.push(`Pedido mínimo: R$ ${minAmount.toLocaleString('pt-BR')}. Atual: R$ ${(input.orderAmount || 0).toLocaleString('pt-BR')}`);

  // 5. Whitelist (always last — AND filter)
  const hasWhitelist = (input.whitelist || []).length > 0;
  const whitelist_ok = !hasWhitelist || !input.clientDocument ||
    input.whitelist!.some(w => w.replace(/\D/g, '') === input.clientDocument!.replace(/\D/g, ''));
  if (!whitelist_ok) warnings.push('Cliente não está na whitelist da campanha');

  const eligible = geo.geo_ok && segment_ok && client_segment_ok && min_ok && whitelist_ok;
  const blocked = !!(input.blockIneligible && !eligible);

  return {
    eligible,
    blocked,
    flags: {
      geo_ok: geo.geo_ok,
      state_ok: geo.state_ok,
      mesoregion_ok: geo.mesoregion_ok,
      city_ok: geo.city_ok,
      segment_ok,
      client_segment_ok,
      min_ok,
      whitelist_ok,
    },
    warnings,
  };
}
