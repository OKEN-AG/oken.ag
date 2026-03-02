export interface MismatchSnapshot {
  settlementId: string;
  fiatAmount: number;
  tokenAmount: number;
  vaultAmount: number;
}

export interface SettlementMetrics {
  mismatchCount: number;
  mismatchRate: number;
  totalObserved: number;
}

export interface SettlementAlert {
  code: 'FIAT_TOKEN_MISMATCH' | 'FIAT_VAULT_MISMATCH' | 'TOKEN_VAULT_MISMATCH';
  settlementId: string;
  expected: number;
  observed: number;
}

export function buildMismatchMetrics(snapshots: MismatchSnapshot[]): {
  metrics: SettlementMetrics;
  alerts: SettlementAlert[];
} {
  const alerts: SettlementAlert[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.fiatAmount !== snapshot.tokenAmount) {
      alerts.push({
        code: 'FIAT_TOKEN_MISMATCH',
        settlementId: snapshot.settlementId,
        expected: snapshot.fiatAmount,
        observed: snapshot.tokenAmount,
      });
    }

    if (snapshot.fiatAmount !== snapshot.vaultAmount) {
      alerts.push({
        code: 'FIAT_VAULT_MISMATCH',
        settlementId: snapshot.settlementId,
        expected: snapshot.fiatAmount,
        observed: snapshot.vaultAmount,
      });
    }

    if (snapshot.tokenAmount !== snapshot.vaultAmount) {
      alerts.push({
        code: 'TOKEN_VAULT_MISMATCH',
        settlementId: snapshot.settlementId,
        expected: snapshot.tokenAmount,
        observed: snapshot.vaultAmount,
      });
    }
  }

  const distinctSettlementsWithMismatch = new Set(alerts.map((alert) => alert.settlementId)).size;

  return {
    metrics: {
      mismatchCount: distinctSettlementsWithMismatch,
      mismatchRate: snapshots.length === 0 ? 0 : distinctSettlementsWithMismatch / snapshots.length,
      totalObserved: snapshots.length,
    },
    alerts,
  };
}
