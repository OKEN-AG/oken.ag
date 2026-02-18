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
  activeModules: JourneyModule[];
  availableDueDates: string[]; // ISO dates
  createdAt: string;
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
  ref: string; // "Nome Mãe" - groups product presentations for combo matching
  category: string;
  activeIngredient: string;
  unitType: 'kg' | 'l';
  packageSizes: number[]; // e.g. [1, 5, 10] liters
  unitsPerBox: number;
  boxesPerPallet: number;
  palletsPerTruck: number;
  dosePerHectare: number; // recommended dose
  minDose: number;
  maxDose: number;
  pricePerUnit: number; // base price in list format
  priceCash?: number; // explicit cash price
  priceTerm?: number; // explicit term price
  currency: 'BRL' | 'USD';
  priceType: 'vista' | 'prazo';
  includesMargin: boolean;
}

// === AGRONOMIC ENGINE ===
export interface AgronomicSelection {
  productId: string;
  ref: string; // "Nome Mãe" for combo matching
  product: Product;
  areaHectares: number;
  dosePerHectare: number;
  rawQuantity: number; // area * dose
  roundedQuantity: number; // rounded to full boxes
  boxes: number;
  pallets: number;
}

// === COMBO CASCADE ENGINE ===
export interface ComboDefinition {
  id: string;
  name: string;
  products: ComboProductRule[];
  discountPercent: number;
  priority: number; // auto-calculated: discount * breadth
  isComplementary: boolean; // "COMPLEMENTAR" combos apply proportionally
}

export interface ComboProductRule {
  ref: string; // Match by REF (Nome Mãe), not individual product ID
  productId?: string; // optional, for reference only
  minDosePerHa: number;
  maxDosePerHa: number;
}

export interface ComboActivation {
  comboId: string;
  comboName: string;
  discountPercent: number;
  matchedProducts: string[]; // REFs matched
  applied: boolean;
  isComplementary: boolean;
  proportionalHectares?: number; // For complementary: hectares from activated offers
}

// === PRICING ENGINE ===
export interface PricingResult {
  productId: string;
  basePrice: number;
  normalizedPrice: number; // after FX, interest, margin normalization
  interestComponent: number;
  marginComponent: number;
  commercialPrice: number;
  quantity: number;
  subtotal: number;
}

export interface GrossToNet {
  grossRevenue: number;
  comboDiscount: number;
  barterDiscount: number;
  netRevenue: number;
  financialRevenue: number; // interest
  distributorMargin: number;
  barterCost: number;
  netNetRevenue: number;
}

// === COMMODITY ENGINE ===
export type CommodityType = 'soja' | 'milho' | 'cafe' | 'algodao';

export interface CommodityPricing {
  commodity: CommodityType;
  exchange: string; // CBOT etc
  contract: string; // K, N, etc
  exchangePrice: number; // USD/bushel
  optionCost: number;
  exchangeRateBolsa: number;
  exchangeRateOption: number;
  basisByPort: Record<string, number>; // USD/bushel premium by port
  securityDeltaMarket: number; // %
  securityDeltaFreight: number; // %
  stopLoss: number;
  bushelsPerTon: number; // ~36.744 for soy
  pesoSacaKg: number; // 60 for soy
}

export interface FreightReducer {
  origin: string;
  destination: string;
  distanceKm: number;
  costPerKm: number;
  adjustment: number;
  totalReducer: number; // R$/ton
}

// === PARITY ENGINE ===
export interface ParityResult {
  totalAmountBRL: number;
  commodityPricePerUnit: number; // R$/saca net
  quantitySacas: number;
  referencePrice: number; // montante sem desconto / sacas
  valorization: number; // % above contract price
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

// === LOG ===
export interface OperationLog {
  id: string;
  operationId: string;
  action: string;
  details: Record<string, unknown>;
  userId: string;
  timestamp: string;
}
