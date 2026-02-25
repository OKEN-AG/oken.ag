// ============================================================
// CORE TYPES - BARTER SYSTEM
// ============================================================

// === CAMPAIGN ENGINE ===
export type ChannelSegment = 'direto' | 'distribuidor' | 'cooperativa';
export type CampaignTarget = 'produtor' | 'distribuidor' | 'venda_direta';
export type PriceListFormat = 'brl_vista' | 'brl_prazo' | 'usd_vista' | 'usd_prazo' | 'brl_vista_com_margem' | 'brl_prazo_com_margem' | 'usd_vista_com_margem' | 'usd_prazo_com_margem';
export type PaymentMethod = 'brl' | 'usd' | 'barter';
export type OperationStatus = 'simulacao' | 'pedido' | 'formalizado' | 'garantido' | 'faturado' | 'monitorando' | 'liquidado';

export interface Campaign {
  id: string;
  name: string;
  season: string;
  active: boolean;
  target: CampaignTarget;
  eligibility: CampaignEligibility;
  margins: ChannelMargin[];
  interestRate: number; // % a.m.
  exchangeRateProducts: number;
  exchangeRateBarter: number;
  maxDiscountInternal: number; // %
  maxDiscountReseller: number; // %
  priceListFormat: PriceListFormat;
  currency?: 'BRL' | 'USD';
  activeModules: JourneyModule[];
  availableDueDates: string[]; // ISO dates
  createdAt: string;
  // I7: Global incentives
  globalIncentiveType?: string;
  globalIncentive1?: number;
  globalIncentive2?: number;
  globalIncentive3?: number;
}

export interface CampaignEligibility {
  states: string[];
  mesoregions: string[];
  cities: string[];
  distributorSegments: ChannelSegment[];
  clientSegments: string[];
}

export interface ChannelMargin {
  segment: ChannelSegment;
  marginPercent: number;
}

export type JourneyModule = 'adesao' | 'simulacao' | 'pagamento' | 'barter' | 'seguro' | 'pedido' | 'formalizacao' | 'documentos' | 'garantias';

// === PRODUCT ENGINE ===
export interface Product {
  id: string;
  name: string;
  ref: string;
  category: string;
  activeIngredient: string;
  unitType: 'kg' | 'l';
  packageSizes: number[];
  unitsPerBox: number;
  boxesPerPallet: number;
  palletsPerTruck: number;
  dosePerHectare: number;
  minDose: number;
  maxDose: number;
  pricePerUnit: number;
  priceCash?: number;
  priceTerm?: number;
  currency: 'BRL' | 'USD';
  priceType: 'vista' | 'prazo';
  includesMargin: boolean;
}

// === AGRONOMIC ENGINE ===
export interface AgronomicSelection {
  productId: string;
  ref: string;
  product: Product;
  areaHectares: number;
  dosePerHectare: number;
  rawQuantity: number;
  roundedQuantity: number;
  boxes: number;
  pallets: number;
}

// === COMBO CASCADE ENGINE ===
export interface ComboDefinition {
  id: string;
  name: string;
  products: ComboProductRule[];
  discountPercent: number;
  priority: number;
  isComplementary: boolean;
}

export interface ComboProductRule {
  ref: string;
  productId?: string;
  minDosePerHa: number;
  maxDosePerHa: number;
}

export interface ComboActivation {
  comboId: string;
  comboName: string;
  discountPercent: number;
  matchedProducts: string[];
  applied: boolean;
  isComplementary: boolean;
  proportionalHectares?: number;
  activatedHectares?: number;
}

// === PRICING ENGINE ===
export interface PricingResult {
  productId: string;
  basePrice: number;
  normalizedPrice: number;
  interestComponent: number;
  marginComponent: number;
  segmentAdjustmentComponent?: number; // I2
  paymentMethodComponent?: number; // I1
  commercialPrice: number;
  quantity: number;
  subtotal: number;
}

export interface GrossToNet {
  grossRevenue: number;
  comboDiscount: number;
  barterDiscount: number;
  directIncentiveDiscount?: number; // I7
  creditLiberacao?: number; // I7
  creditLiquidacao?: number; // I7
  netRevenue: number;
  financialRevenue: number;
  distributorMargin: number;
  segmentAdjustment?: number; // I2
  paymentMethodMarkup?: number; // I1
  barterCost: number;
  netNetRevenue: number;
}

// === COMMODITY ENGINE ===
export type CommodityType = 'soja' | 'milho' | 'cafe' | 'algodao';

export interface CommodityPricing {
  commodity: CommodityType;
  exchange: string;
  contract: string;
  exchangePrice: number;
  optionCost: number;
  exchangeRateBolsa: number;
  exchangeRateOption: number;
  basisByPort: Record<string, number>;
  securityDeltaMarket: number;
  securityDeltaFreight: number;
  stopLoss: number;
  bushelsPerTon: number;
  pesoSacaKg: number;
  // H3: B&S params from config
  volatility?: number;
  riskFreeRate?: number;
  optionMaturityDays?: number;
  strikePercent?: number; // strike as % of spot
}

export interface FreightReducer {
  origin: string;
  destination: string;
  distanceKm: number;
  costPerKm: number;
  adjustment: number;
  totalReducer: number;
}

// === PARITY ENGINE ===
export interface ParityResult {
  totalAmountBRL: number;
  commodityPricePerUnit: number;
  quantitySacas: number;
  referencePrice: number;
  valorization: number;
  userOverridePrice?: number;
  counterparty?: string;
  hasExistingContract: boolean;
}

// === INSURANCE ENGINE (Black-Scholes) ===
export interface InsuranceOption {
  type: 'commodity' | 'fx';
  underlying: string;
  strikePrice: number;
  maturityDays: number;
  volatility: number;
  riskFreeRate: number;
  premiumPerUnit: number;
  premiumInSacas: number;
  totalSacasWithInsurance: number;
}

// === DOCUMENT ENGINE ===
export type DocumentType = 'termo_adesao' | 'pedido' | 'termo_barter' | 'ccv' | 'cessao_credito' | 'cpr' | 'duplicata' | 'nota_comercial' | 'hipoteca' | 'alienacao_fiduciaria' | 'certificado_aceite';

export interface OperationDocument {
  id: string;
  operationId: string;
  type: DocumentType;
  status: 'pendente' | 'emitido' | 'assinado' | 'validado';
  generatedAt?: string;
  signedAt?: string;
  data: Record<string, unknown>;
}

// === OPERATION (Full Order) ===
export interface Operation {
  id: string;
  campaignId: string;
  status: OperationStatus;
  channel: ChannelSegment;
  clientName: string;
  clientDocument: string;
  city: string;
  state: string;
  distributorId?: string;
  selections: AgronomicSelection[];
  comboActivations: ComboActivation[];
  pricingResults: PricingResult[];
  grossToNet: GrossToNet;
  paymentMethod: PaymentMethod;
  dueDate: string;
  parity?: ParityResult;
  insurance?: InsuranceOption;
  documents: OperationDocument[];
  wagonStages: WagonStage[];
  createdAt: string;
  updatedAt: string;
}

// === TRAIN/WAGON METAPHOR ===
export interface WagonStage {
  id: string;
  name: string;
  module: JourneyModule;
  status: 'pendente' | 'em_progresso' | 'concluido' | 'bloqueado';
  requiredDocuments: DocumentType[];
  completedDocuments: DocumentType[];
  completedAt?: string;
}

// === GUARANTEE FRAMEWORK (PoE/PoL/PoD) ===
export type GuaranteeCategory = 'poe' | 'pol' | 'pod';
export type ContractPriceType = 'fixo' | 'a_fixar' | 'pre_existente';

export interface PerformanceIndex {
  operationId: string;
  value: number; // 0..1
  source: 'manual' | 'ndvi' | 'seguro';
  updatedAt: string;
  notes?: string;
}

export interface GuaranteeCoverage {
  base: number;
  effective: number; // base * IP
  required: number;  // montante * aforo / 100
  sufficient: boolean;
}

export interface CessionChain {
  cedente: string;
  cessionario: string;
  devedor: string;
  notified: boolean;
  accepted: boolean;
}

// === LOG ===
export interface OperationLog {
  id: string;
  operationId: string;
  action: string;
  details: Record<string, unknown>;
  userId: string;
  timestamp: string;
}
