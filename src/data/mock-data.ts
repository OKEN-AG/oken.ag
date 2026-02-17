import type { Campaign, Product, ComboDefinition, CommodityPricing, FreightReducer } from '@/types/barter';

export const mockCampaign: Campaign = {
  id: 'camp-2025-safra',
  name: 'Safra 2025/26 - Barter Soja',
  season: '2025/26',
  active: true,
  target: 'produtor',
  eligibility: {
    states: ['PR', 'SP', 'MT', 'GO', 'MS', 'MG', 'BA', 'MA', 'PA', 'RS'],
    mesoregions: ['Norte Central', 'Oeste', 'Triângulo Mineiro'],
    cities: [],
    distributorSegments: ['distribuidor', 'cooperativa'],
    clientSegments: ['grande', 'medio', 'pequeno'],
  },
  margins: [
    { segment: 'distribuidor', marginPercent: 12 },
    { segment: 'cooperativa', marginPercent: 10 },
    { segment: 'direto', marginPercent: 0 },
  ],
  interestRate: 1.5,
  exchangeRateProducts: 5.45,
  exchangeRateBarter: 5.40,
  maxDiscountInternal: 8,
  maxDiscountReseller: 5,
  priceListFormat: 'usd_vista',
  activeModules: ['adesao', 'simulacao', 'pagamento', 'barter', 'seguro', 'pedido', 'formalizacao', 'documentos', 'garantias'],
  availableDueDates: ['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'],
  createdAt: '2025-01-15',
};

export const mockProducts: Product[] = [
  {
    id: 'prod-1', name: 'Cripton', category: 'Herbicida', activeIngredient: 'Glifosato',
    unitType: 'l', packageSizes: [5, 10], unitsPerBox: 4, boxesPerPallet: 40, palletsPerTruck: 20,
    dosePerHectare: 2.5, minDose: 1.5, maxDose: 4.0, pricePerUnit: 12.50, currency: 'USD', priceType: 'vista', includesMargin: false,
  },
  {
    id: 'prod-2', name: 'Nativo', category: 'Fungicida', activeIngredient: 'Trifloxistrobina + Tebuconazol',
    unitType: 'l', packageSizes: [1, 5], unitsPerBox: 6, boxesPerPallet: 50, palletsPerTruck: 20,
    dosePerHectare: 0.75, minDose: 0.5, maxDose: 1.0, pricePerUnit: 42.00, currency: 'USD', priceType: 'vista', includesMargin: false,
  },
  {
    id: 'prod-3', name: 'Connect', category: 'Inseticida', activeIngredient: 'Imidacloprido + Beta-ciflutrina',
    unitType: 'l', packageSizes: [1, 5], unitsPerBox: 4, boxesPerPallet: 60, palletsPerTruck: 20,
    dosePerHectare: 1.0, minDose: 0.5, maxDose: 1.5, pricePerUnit: 38.00, currency: 'USD', priceType: 'vista', includesMargin: false,
  },
  {
    id: 'prod-4', name: 'Adengo', category: 'Herbicida', activeIngredient: 'Isoxaflutole + Tiencarbazona',
    unitType: 'l', packageSizes: [5], unitsPerBox: 4, boxesPerPallet: 40, palletsPerTruck: 20,
    dosePerHectare: 0.35, minDose: 0.25, maxDose: 0.5, pricePerUnit: 85.00, currency: 'USD', priceType: 'vista', includesMargin: false,
  },
  {
    id: 'prod-5', name: 'Fox Xpro', category: 'Fungicida', activeIngredient: 'Bixafem + Protioconazol + Trifloxistrobina',
    unitType: 'l', packageSizes: [5], unitsPerBox: 4, boxesPerPallet: 40, palletsPerTruck: 20,
    dosePerHectare: 0.5, minDose: 0.4, maxDose: 0.6, pricePerUnit: 65.00, currency: 'USD', priceType: 'vista', includesMargin: false,
  },
  {
    id: 'prod-6', name: 'Belt', category: 'Inseticida', activeIngredient: 'Flubendiamida',
    unitType: 'l', packageSizes: [1], unitsPerBox: 12, boxesPerPallet: 60, palletsPerTruck: 20,
    dosePerHectare: 0.1, minDose: 0.05, maxDose: 0.15, pricePerUnit: 180.00, currency: 'USD', priceType: 'vista', includesMargin: false,
  },
];

export const mockCombos: ComboDefinition[] = [
  {
    id: 'combo-1', name: 'Combo Premium', discountPercent: 6, priority: 1,
    products: [
      { productId: 'prod-1', minDosePerHa: 2.0, maxDosePerHa: 4.0 },
      { productId: 'prod-2', minDosePerHa: 0.5, maxDosePerHa: 1.0 },
      { productId: 'prod-5', minDosePerHa: 0.4, maxDosePerHa: 0.6 },
      { productId: 'prod-3', minDosePerHa: 0.5, maxDosePerHa: 1.5 },
    ],
  },
  {
    id: 'combo-2', name: 'Combo Fungicida', discountPercent: 4, priority: 2,
    products: [
      { productId: 'prod-2', minDosePerHa: 0.5, maxDosePerHa: 1.0 },
      { productId: 'prod-5', minDosePerHa: 0.4, maxDosePerHa: 0.6 },
    ],
  },
  {
    id: 'combo-3', name: 'Combo Proteção Total', discountPercent: 3, priority: 3,
    products: [
      { productId: 'prod-3', minDosePerHa: 0.5, maxDosePerHa: 1.5 },
      { productId: 'prod-6', minDosePerHa: 0.05, maxDosePerHa: 0.15 },
    ],
  },
];

export const mockCommodityPricing: CommodityPricing = {
  commodity: 'soja',
  exchange: 'CBOT',
  contract: 'K',
  exchangePrice: 9.35,
  optionCost: 0.75,
  exchangeRateBolsa: 5.40,
  exchangeRateOption: 5.40,
  basisByPort: {
    'Paranaguá (PR)': 0.30,
    'Santos (SP)': 0.30,
    'Rio Grande (RS)': 0.30,
    'Santarém (PA)': 0.30,
    'Itaqui (MA)': 0.30,
    'Ilhéus (BA)': 0.30,
  },
  securityDeltaMarket: 2.0,
  securityDeltaFreight: 15.0,
  stopLoss: 9.16,
};

export const mockFreightReducers: FreightReducer[] = [
  { origin: 'Londrina (PR)', destination: 'Paranaguá (PR)', distanceKm: 490, costPerKm: 0.12, adjustment: 0, totalReducer: 58.80 },
  { origin: 'Sorriso (MT)', destination: 'Santos (SP)', distanceKm: 2100, costPerKm: 0.11, adjustment: 5, totalReducer: 236.00 },
  { origin: 'Rio Verde (GO)', destination: 'Santos (SP)', distanceKm: 900, costPerKm: 0.11, adjustment: 0, totalReducer: 99.00 },
  { origin: 'Luís Eduardo Magalhães (BA)', destination: 'Ilhéus (BA)', distanceKm: 620, costPerKm: 0.10, adjustment: 3, totalReducer: 65.00 },
  { origin: 'Balsas (MA)', destination: 'Itaqui (MA)', distanceKm: 580, costPerKm: 0.10, adjustment: 0, totalReducer: 58.00 },
];
