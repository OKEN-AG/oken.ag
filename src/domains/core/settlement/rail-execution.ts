import type { RailExecutionState, SettlementRail } from './types';

export class RailExecutionBook {
  private readonly states = new Map<SettlementRail, RailExecutionState>();

  upsert(state: RailExecutionState): RailExecutionState {
    this.states.set(state.rail, state);
    return state;
  }

  get(rail: SettlementRail): RailExecutionState | undefined {
    return this.states.get(rail);
  }

  list(): RailExecutionState[] {
    return Array.from(this.states.values());
  }

  reconcileCrossRail(): {
    isBalanced: boolean;
    expectedAmount: number | null;
    mismatches: Array<{ rail: SettlementRail; amount: number }>;
  } {
    const entries = this.list();
    if (entries.length === 0) {
      return { isBalanced: true, expectedAmount: null, mismatches: [] };
    }

    const expectedAmount = entries[0].amount;
    const mismatches = entries
      .filter((entry) => entry.amount !== expectedAmount)
      .map((entry) => ({ rail: entry.rail, amount: entry.amount }));

    return {
      isBalanced: mismatches.length === 0,
      expectedAmount,
      mismatches,
    };
  }
}
