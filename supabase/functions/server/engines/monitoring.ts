export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface MonitoringOperationInput {
  operationId: string;
  tenantId: string;
  campaignId: string;
  collateralValue: number;
  exposureValue: number;
  commodityPrice: number;
  commodityReferencePrice: number;
  exposureLimit?: number;
  operationOwner?: string;
}

export interface MonitoringAlertRule {
  id: string;
  name: string;
  metric: 'collateral_coverage' | 'commodity_variation_pct' | 'exposure_utilization';
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  threshold: number;
  severity: AlertSeverity;
  recipients: string[];
  enabled?: boolean;
}

export interface MonitoringFilters {
  tenantId?: string;
  campaignId?: string;
}

export interface MonitoringAlert {
  ruleId: string;
  ruleName: string;
  metric: MonitoringAlertRule['metric'];
  severity: AlertSeverity;
  threshold: number;
  value: number;
  recipients: string[];
  operationId: string;
}

export interface MonitoringOperationSummary {
  operationId: string;
  tenantId: string;
  campaignId: string;
  collateralCoverage: number;
  commodityVariationPct: number;
  exposureValue: number;
  exposureUtilization: number;
  alerts: MonitoringAlert[];
}

export interface MonitoringDashboardResponse {
  filters: MonitoringFilters;
  totals: {
    operations: number;
    exposureValue: number;
    averageCollateralCoverage: number;
    averageCommodityVariationPct: number;
    alertsBySeverity: Record<AlertSeverity, number>;
  };
  operations: MonitoringOperationSummary[];
}

const SEVERITY_ORDER: AlertSeverity[] = ['low', 'medium', 'high', 'critical'];

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

function matchesRule(value: number, rule: MonitoringAlertRule): boolean {
  switch (rule.operator) {
    case 'lt':
      return value < rule.threshold;
    case 'lte':
      return value <= rule.threshold;
    case 'gt':
      return value > rule.threshold;
    case 'gte':
      return value >= rule.threshold;
    default:
      return false;
  }
}

export function computeOperationIndicators(operation: MonitoringOperationInput) {
  const collateralCoverage = safeDivide(operation.collateralValue, operation.exposureValue);
  const commodityVariationPct = safeDivide(operation.commodityPrice - operation.commodityReferencePrice, operation.commodityReferencePrice) * 100;
  const limit = operation.exposureLimit ?? operation.exposureValue;
  const exposureUtilization = safeDivide(operation.exposureValue, limit);

  return {
    collateralCoverage,
    commodityVariationPct,
    exposureUtilization,
  };
}

export function evaluateMonitoringAlerts(
  operation: MonitoringOperationInput,
  rules: MonitoringAlertRule[],
): MonitoringAlert[] {
  const indicators = computeOperationIndicators(operation);

  const metricValueMap: Record<MonitoringAlertRule['metric'], number> = {
    collateral_coverage: indicators.collateralCoverage,
    commodity_variation_pct: indicators.commodityVariationPct,
    exposure_utilization: indicators.exposureUtilization,
  };

  return (rules || [])
    .filter((rule) => rule.enabled !== false)
    .filter((rule) => matchesRule(metricValueMap[rule.metric], rule))
    .map((rule) => ({
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      severity: rule.severity,
      threshold: rule.threshold,
      value: metricValueMap[rule.metric],
      recipients: rule.recipients.length > 0 ? rule.recipients : [operation.operationOwner || 'operational-monitoring@oken.ag'],
      operationId: operation.operationId,
    }))
    .sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));
}

export function buildMonitoringDashboard(
  operations: MonitoringOperationInput[],
  rules: MonitoringAlertRule[],
  filters: MonitoringFilters = {},
): MonitoringDashboardResponse {
  const filteredOperations = (operations || []).filter((operation) => {
    if (filters.tenantId && operation.tenantId !== filters.tenantId) return false;
    if (filters.campaignId && operation.campaignId !== filters.campaignId) return false;
    return true;
  });

  const operationsWithAlerts: MonitoringOperationSummary[] = filteredOperations.map((operation) => {
    const indicators = computeOperationIndicators(operation);
    return {
      operationId: operation.operationId,
      tenantId: operation.tenantId,
      campaignId: operation.campaignId,
      collateralCoverage: indicators.collateralCoverage,
      commodityVariationPct: indicators.commodityVariationPct,
      exposureValue: operation.exposureValue,
      exposureUtilization: indicators.exposureUtilization,
      alerts: evaluateMonitoringAlerts(operation, rules),
    };
  });

  const operationsCount = operationsWithAlerts.length;
  const totalExposure = operationsWithAlerts.reduce((sum, operation) => sum + operation.exposureValue, 0);
  const totalCollateralCoverage = operationsWithAlerts.reduce((sum, operation) => sum + operation.collateralCoverage, 0);
  const totalCommodityVariation = operationsWithAlerts.reduce((sum, operation) => sum + operation.commodityVariationPct, 0);

  const alertsBySeverity: Record<AlertSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const operation of operationsWithAlerts) {
    for (const alert of operation.alerts) {
      alertsBySeverity[alert.severity] += 1;
    }
  }

  return {
    filters,
    totals: {
      operations: operationsCount,
      exposureValue: totalExposure,
      averageCollateralCoverage: operationsCount > 0 ? totalCollateralCoverage / operationsCount : 0,
      averageCommodityVariationPct: operationsCount > 0 ? totalCommodityVariation / operationsCount : 0,
      alertsBySeverity,
    },
    operations: operationsWithAlerts,
  };
}

export interface MonitoringDashboardDependencies {
  loadOperations: (filters: MonitoringFilters) => Promise<MonitoringOperationInput[]>;
  loadRules: (filters: MonitoringFilters) => Promise<MonitoringAlertRule[]>;
}

export async function handleMonitoringDashboardRequest(
  req: Request,
  dependencies: MonitoringDashboardDependencies,
): Promise<Response> {
  const url = new URL(req.url);
  const filters: MonitoringFilters = {
    tenantId: url.searchParams.get('tenantId') || undefined,
    campaignId: url.searchParams.get('campaignId') || undefined,
  };

  const [operations, rules] = await Promise.all([
    dependencies.loadOperations(filters),
    dependencies.loadRules(filters),
  ]);

  const payload = buildMonitoringDashboard(operations, rules, filters);

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
