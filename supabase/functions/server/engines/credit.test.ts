import { describe, expect, it, vi } from "vitest";
import {
  calculateCetFromCashFlows,
  calculateOperationCosts,
  generateCreditSchedule,
  persistOrderInstallments,
} from "./credit";

describe("credit engine schedules", () => {
  it("generates PRICE schedule with decreasing interest and zero ending balance", () => {
    const schedule = generateCreditSchedule({
      principal: 1000,
      termMonths: 4,
      monthlyRate: 0.02,
      method: "PRICE",
    });

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBeGreaterThan(schedule[1].interest);
    expect(schedule[3].balance).toBe(0);
    expect(schedule.reduce((acc, item) => acc + item.principal, 0)).toBeCloseTo(1000, 2);
  });

  it("generates SAC schedule with constant principal amortization", () => {
    const schedule = generateCreditSchedule({
      principal: 1200,
      termMonths: 3,
      monthlyRate: 0.03,
      method: "SAC",
    });

    expect(schedule).toHaveLength(3);
    expect(schedule[0].principal).toBe(400);
    expect(schedule[1].principal).toBe(400);
    expect(schedule[2].principal).toBe(400);
    expect(schedule[0].payment).toBeGreaterThan(schedule[1].payment);
    expect(schedule[2].balance).toBe(0);
  });

  it("generates BULLET schedule with principal only in the last installment", () => {
    const schedule = generateCreditSchedule({
      principal: 1000,
      termMonths: 3,
      monthlyRate: 0.015,
      method: "BULLET",
    });

    expect(schedule[0].principal).toBe(0);
    expect(schedule[1].principal).toBe(0);
    expect(schedule[2].principal).toBe(1000);
    expect(schedule[2].balance).toBe(0);
  });
});

describe("credit engine edge cases", () => {
  it("handles zero interest with exact division in PRICE", () => {
    const schedule = generateCreditSchedule({
      principal: 900,
      termMonths: 3,
      monthlyRate: 0,
      method: "PRICE",
    });

    expect(schedule.every((item) => item.interest === 0)).toBe(true);
    expect(schedule.map((item) => item.payment)).toEqual([300, 300, 300]);
  });

  it("handles short term with one installment", () => {
    const schedule = generateCreditSchedule({
      principal: 500,
      termMonths: 1,
      monthlyRate: 0.05,
      method: "SAC",
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0].principal).toBe(500);
    expect(schedule[0].interest).toBe(25);
    expect(schedule[0].payment).toBe(525);
  });

  it("preserves principal sum with rounding pressure", () => {
    const schedule = generateCreditSchedule({
      principal: 1000,
      termMonths: 3,
      monthlyRate: 0,
      method: "SAC",
    });

    const principalSum = schedule.reduce((acc, item) => acc + item.principal, 0);
    expect(principalSum).toBeCloseTo(1000, 2);
    expect(schedule[2].principal).toBe(333.34);
  });
});

describe("CET and persistence", () => {
  it("calculates operation CET and CET per payment method", () => {
    const result = calculateOperationCosts(
      {
        principal: 10000,
        termMonths: 12,
        monthlyRate: 0.015,
        method: "PRICE",
      },
      [
        { paymentMethod: "PIX", fixedFee: 0 },
        { paymentMethod: "CARD", monthlySpreadRate: 0.005, fixedFee: 50 },
      ],
    );

    expect(result.cetMonthly).toBeGreaterThan(0);
    expect(result.cetAnnual).toBeGreaterThan(result.cetMonthly);
    expect(result.byPaymentMethod).toHaveLength(2);

    const card = result.byPaymentMethod.find((item) => item.paymentMethod === "CARD");
    expect(card).toBeDefined();
    expect(card!.cetAnnual).toBeGreaterThan(result.cetAnnual);
    expect(card!.totalCost).toBeGreaterThan(result.totalCost);
  });

  it("calculates CET from deterministic cash flow", () => {
    const cet = calculateCetFromCashFlows(100, [
      { installmentNumber: 1, principal: 100, interest: 10, payment: 110, balance: 0 },
    ]);
    expect(cet).toBeCloseTo(0.1, 6);
  });

  it("persists schedule into order_installments", async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn(() => ({ eq: deleteEq }));
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn(() => ({
        delete: deleteFn,
        insert: insertFn,
      })),
    };

    await persistOrderInstallments(supabase, {
      orderId: "order-1",
      schedule: [
        { installmentNumber: 1, principal: 500, interest: 50, payment: 550, balance: 500 },
        { installmentNumber: 2, principal: 500, interest: 25, payment: 525, balance: 0 },
      ],
      paymentMethod: "PIX",
      cetOperationAnnual: 0.2,
      cetPaymentMethodAnnual: 0.21,
      totalCostOperation: 75,
      totalCostPaymentMethod: 85,
    });

    expect(supabase.from).toHaveBeenCalledWith("order_installments");
    expect(deleteEq).toHaveBeenCalledWith("order_id", "order-1");
    expect(insertFn).toHaveBeenCalledTimes(1);

    const rows = insertFn.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      order_id: "order-1",
      installment_number: 1,
      principal_amount: 500,
      interest_amount: 50,
      payment_amount: 550,
      balance_amount: 500,
      payment_method: "PIX",
      cet_operation_annual: 0.2,
    });
  });
});
