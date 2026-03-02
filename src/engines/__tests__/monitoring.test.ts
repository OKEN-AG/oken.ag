import { describe, expect, it } from 'vitest';
import {
  buildMonitoringDashboard,
  computeOperationIndicators,
  evaluateMonitoringAlerts,
  type MonitoringAlertRule,
  type MonitoringOperationInput,
} from '../../../supabase/functions/server/engines/monitoring';

const rules: MonitoringAlertRule[] = [
  {
    id: 'r1',
    name: 'Cobertura insuficiente',
    metric: 'collateral_coverage',
    operator: 'lt',
    threshold: 1.2,
    severity: 'high',
    recipients: ['risk@oken.ag'],
  },
  {
    id: 'r2',
    name: 'Variação commodity elevada',
    metric: 'commodity_variation_pct',
    operator: 'lte',
    threshold: -8,
    severity: 'critical',
    recipients: ['treasury@oken.ag'],
  },
  {
    id: 'r3',
    name: 'Exposição acima do limite',
    metric: 'exposure_utilization',
    operator: 'gte',
    threshold: 0.85,
    severity: 'medium',
    recipients: ['ops@oken.ag'],
  },
];

const operations: MonitoringOperationInput[] = [
  {
    operationId: 'op-1',
    tenantId: 'tenant-a',
    campaignId: 'camp-1',
    collateralValue: 900,
    exposureValue: 1000,
    commodityPrice: 90,
    commodityReferencePrice: 100,
    exposureLimit: 1100,
  },
  {
    operationId: 'op-2',
    tenantId: 'tenant-a',
    campaignId: 'camp-2',
    collateralValue: 2100,
    exposureValue: 1000,
    commodityPrice: 106,
    commodityReferencePrice: 100,
    exposureLimit: 1500,
  },
  {
    operationId: 'op-3',
    tenantId: 'tenant-b',
    campaignId: 'camp-1',
    collateralValue: 1400,
    exposureValue: 1200,
    commodityPrice: 115,
    commodityReferencePrice: 100,
    exposureLimit: 1200,
  },
];

describe('monitoring indicators and rules', () => {
  it('consolida indicadores por operação', () => {
    const indicators = computeOperationIndicators(operations[0]);

    expect(indicators.collateralCoverage).toBeCloseTo(0.9);
    expect(indicators.commodityVariationPct).toBeCloseTo(-10);
    expect(indicators.exposureUtilization).toBeCloseTo(1000 / 1100);
  });

  it('avalia severidade, thresholds e destinatários por regra', () => {
    const alerts = evaluateMonitoringAlerts(operations[0], rules);

    expect(alerts).toHaveLength(3);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].ruleId).toBe('r2');
    expect(alerts.map((alert) => alert.recipients[0])).toEqual([
      'treasury@oken.ag',
      'risk@oken.ag',
      'ops@oken.ag',
    ]);
  });
});

describe('monitoring dashboard endpoint payload', () => {
  it('filtra por tenant e campanha e agrega exposição/alertas', () => {
    const payload = buildMonitoringDashboard(operations, rules, {
      tenantId: 'tenant-a',
      campaignId: 'camp-1',
    });

    expect(payload.operations).toHaveLength(1);
    expect(payload.totals.operations).toBe(1);
    expect(payload.totals.exposureValue).toBe(1000);
    expect(payload.totals.averageCollateralCoverage).toBeCloseTo(0.9);
    expect(payload.totals.alertsBySeverity.critical).toBe(1);
    expect(payload.totals.alertsBySeverity.high).toBe(1);
    expect(payload.totals.alertsBySeverity.medium).toBe(1);
  });
});
