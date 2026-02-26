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
  /** Client type: PF or PJ */
  clientType?: 'PF' | 'PJ';
  /** Order gross amount in campaign currency */
  orderAmount?: number;
  /** Minimum order amount from campaign */
  minOrderAmount?: number;
  /** Whitelist of allowed client documents (if empty, no filter) */
  whitelist?: string[];
  /** Whether campaign blocks ineligible clients */
  blockIneligible?: boolean;
  /** Campaign allowed client types (from campaigns.client_type) */
  campaignClientTypes?: string[];
  /** Campaign/order currency for user-facing messages */
  currency?: 'BRL' | 'USD';
}

export interface EligibilityResult {
  eligible: boolean;
  blocked: boolean; // hard block (blockIneligible && !eligible)
  flags: {
    pf_pj_ok: boolean;
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
  const normalize = (value?: string) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const normalizedState = String(input.state || '').trim().toUpperCase();
  const normalizedMesoregion = normalize(input.mesoregion);
  const normalizedCity = normalize(input.city);
  
  // State check
  const hasStateFilter = eligibility.states.length > 0;
  const state_ok = !hasStateFilter || !input.state || eligibility.states.some(uf => String(uf || '').trim().toUpperCase() === normalizedState);

  // Mesoregion check
  const hasMesoFilter = eligibility.mesoregions.length > 0;
  const mesoregion_ok = !hasMesoFilter || !input.mesoregion || 
    eligibility.mesoregions.some(m => normalize(m) === normalizedMesoregion);

  // City check
  const hasCityFilter = eligibility.cities.length > 0;
  const city_ok = !hasCityFilter || !input.city || 
    eligibility.cities.some(c => normalize(c) === normalizedCity);

  // Precedence: city > mesoregion > state.
  // If a more specific level is configured, it becomes the decisive constraint.
  let geo_ok = true;
  if (hasCityFilter) {
    geo_ok = city_ok;
    if (!city_ok) warnings.push(`Cidade "${input.city}" não elegível`);
  } else if (hasMesoFilter) {
    geo_ok = mesoregion_ok;
    if (!mesoregion_ok) warnings.push(`Mesorregião "${input.mesoregion}" não elegível`);
  } else if (hasStateFilter) {
    geo_ok = state_ok;
    if (!state_ok) warnings.push(`Estado "${input.state}" não elegível`);
  }

  return { geo_ok, state_ok, mesoregion_ok, city_ok, warnings };
}

export function checkEligibility(
  campaign: Campaign,
  input: EligibilityInput
): EligibilityResult {
  const warnings: string[] = [];

  // 0. PF/PJ check
  const campaignTypes = input.campaignClientTypes || [];
  const hasPfPjFilter = campaignTypes.length > 0;
  const clientTypeLower = input.clientType?.toLowerCase();
  const pf_pj_ok = !hasPfPjFilter || !clientTypeLower || campaignTypes.some(t => t.toLowerCase() === clientTypeLower);
  if (!pf_pj_ok) warnings.push(`Tipo de cliente "${input.clientType}" não elegível para esta campanha`);

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
  if (!min_ok) {
    const currency = input.currency === 'USD' ? 'USD' : 'BRL';
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    warnings.push(`Pedido mínimo: ${formatter.format(minAmount)}. Atual: ${formatter.format(input.orderAmount || 0)}`);
  }

  // 5. Whitelist (always last — AND filter)
  const hasWhitelist = (input.whitelist || []).length > 0;
  const whitelist_ok = !hasWhitelist || !input.clientDocument ||
    input.whitelist!.some(w => w.replace(/\D/g, '') === input.clientDocument!.replace(/\D/g, ''));
  if (!whitelist_ok) warnings.push('Cliente não está na whitelist da campanha');

  const eligible = pf_pj_ok && geo.geo_ok && segment_ok && client_segment_ok && min_ok && whitelist_ok;
  const blocked = !!(input.blockIneligible && !eligible);

  return {
    eligible,
    blocked,
    flags: {
      pf_pj_ok,
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
